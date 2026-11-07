# Use sempre que o Docker (ou o computador) reiniciar e o bot parar de responder.
# Remove a trava antiga do Chromium (Singleton*), sobe o WPPConnect de novo e
# registra o webhook. A sessão do WhatsApp é mantida: não precisa ler o QR outra vez.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# Carrega o .env (mesmas variáveis do jogo).
Get-Content .env | Where-Object { $_ -match '^\s*[^#=\s][^=]*=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim()
}
$env:COMPOSE_BAKE = 'false'
$compose = 'deploy/wppconnect/docker-compose.yml'

Write-Host '1/4 Conferindo o Docker...'
$ready = $false
for ($i = 0; $i -lt 24 -and -not $ready; $i++) {
  docker info *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true } else { Start-Sleep 5 }
}
if (-not $ready) { throw 'O Docker não respondeu. Abra o Docker Desktop e espere "Engine running".' }

Write-Host '2/4 Parando o WPPConnect e apagando a trava do Chromium...'
docker compose -f $compose stop wppconnect | Out-Null
docker compose -f $compose run --rm --no-deps --entrypoint sh wppconnect -c "find /usr/src/wpp-server/userDataDir -maxdepth 3 -name 'Singleton*' -print -delete"

Write-Host '3/4 Subindo o WPPConnect...'
docker compose -f $compose up -d

Write-Host '4/4 Aguardando a sessão e registrando o webhook...'
$status = 'indisponível'
for ($i = 0; $i -lt 18; $i++) {
  Start-Sleep 5
  try {
    $r = Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/admin/whatsapp/start' `
      -Headers @{ 'x-admin-token' = $env:WHATSAPP_ADMIN_TOKEN } -TimeoutSec 60
    $status = $r.status
    if ($status -eq 'CONNECTED') { break }
  } catch { $status = 'jogo fora do ar (rode: npm start)' }
}
Write-Host "Situação do WhatsApp: $status"
if ($status -eq 'QRCODE') { Write-Host 'A sessão foi perdida: peça o QR Code de novo (POST /admin/whatsapp/start).' }
