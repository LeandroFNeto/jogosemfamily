# Proposal

## Why

Hoje os "contatos autorizados" são uma lista simples dentro do perfil, e a única forma de convidar é mandar um link. Falta uma lista de favoritos que fique guardada, um jeito de chamar todos de uma vez sem incomodar quem não quer, e um motivo para voltar: o ranking entre amigos.

## What Changes

- **Lista de favoritos permanente** no servidor, ligada ao contato. Os contatos atuais migram para ela.
- **Consentimento no primeiro chamado:** quem é chamado pela primeira vez recebe "Ana quer chamar você para jogar. Aceita receber convites e colocá-la nos favoritos?" e só depois recebe chamados.
- **Ranking entre favoritos**, guardado no banco, por jogo e geral.
- **Chamar favoritos:** o dono de uma mesa envia um aviso a todos os favoritos. Se a sala encher, quem responde vê "Infelizmente a sala está cheia" e um botão "Criar outra sala".

Depende de `whatsapp-bot-frontend`. Usa os botões de `timer-buttons-inactivity`, mas funciona sem eles com texto numerado.

## Capabilities

### New Capabilities

- `favorites-consent`: lista permanente de favoritos e consentimento para receber chamados.
- `favorites-ranking`: resultados guardados e ranking entre favoritos.
- `play-call-broadcast`: chamado a todos os favoritos, entrada e aviso de sala cheia.

### Modified Capabilities

<!-- Nenhuma. Substitui o "contato autorizado automático" da change whatsapp-bot-frontend: entrar por link continua valendo como consentimento. -->

## Impact

- Banco: tabelas `favorites` e `match_results`; migração dos `contacts` existentes.
- `src/whatsapp/conversation.mjs`: comandos `favoritos`, `ranking`, `chamar`, `parar convites`.
- `rooms-service.mjs`: gravar resultado ao terminar a partida.
- Painel do familiar e site: lista de favoritos e tela de ranking.
- Documentação: `docs/whatsapp.md`, `docs/architecture.md`.
