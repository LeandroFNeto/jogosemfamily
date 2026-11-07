# Proposal

## Why

Hoje a mesa espera para sempre: ninguém sabe quanto tempo tem para jogar, uma pessoa que some trava a partida e as partidas abandonadas ficam abertas. No WhatsApp, as jogadas dependem de digitar números, o que é difícil para quem não tem costume.

## What Changes

- **Cronômetro por jogada:** linha que esvazia e muda de verde para laranja e vermelho, com um relógio na ponta que balança cada vez mais rápido. No WhatsApp, a mesma ideia em texto, com lembretes.
- **Jogada automática** quando o tempo acaba, para a mesa nunca ficar parada.
- **Partida cancelada** se nenhum jogador estiver presente por 5 minutos. Quem volta e encontra a partida ainda ativa, entra de novo; se foi cancelada, vê o menu e cria outra.
- **Botões melhores:** botões grandes e claros no site; no WhatsApp, botões ou lista nativos quando o aparelho aceita, com texto numerado como alternativa.

Depende da change `whatsapp-bot-frontend` (arquive-a antes de aplicar esta).

## Capabilities

### New Capabilities

- `turn-timer`: tempo por jogada, barra colorida com relógio, lembretes no WhatsApp e jogada automática.
- `match-inactivity`: presença, cancelamento em 5 minutos e regras de retorno.
- `game-buttons`: ações como botões no site e estratégia de botões, lista e texto no WhatsApp.

### Modified Capabilities

<!-- Nenhuma: os specs principais ainda não existem. A regra "sem cronômetro" do docs/architecture.md passa a valer só quando o tempo está desligado. -->

## Impact

- `src/backend/rooms-service.mjs` e `server.mjs`: prazo da vez, varredura periódica, jogada automática e cancelamento por inatividade.
- `src/frontend/games-ui.mjs` e `styles.css`: barra de tempo e botões.
- `src/whatsapp/`: barra em texto, lembretes, envio de botões e lista, leitura das respostas de toque.
- Painel do familiar: escolha do tempo (desligado, 30, 60 ou 90 s).
- Documentação: `docs/architecture.md`, `docs/whatsapp.md`.
