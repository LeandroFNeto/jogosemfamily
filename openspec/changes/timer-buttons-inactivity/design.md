# Design

## Context

Os jogos não têm limite de tempo (`docs/architecture.md`). O servidor já guarda `revision`, publica o estado por SSE e tem `onRoomChanged`. A presença web existe como conexões SSE em memória. No WhatsApp, a conversa é em `src/whatsapp/` e as opções são texto numerado.

## Goals / Non-Goals

**Goals:** tempo visível e confiável, partida que não fica pendurada, botões simples.
**Non-Goals:** relógio de xadrez (tempo total por jogador), animação no WhatsApp (não existe edição de mensagem).

## Decisions

### 1. Prazo no servidor, varredura a cada segundo

A sala guarda `turn = { playerId, deadline, seconds }`, atualizado quando a vez muda. Um único temporizador de 1 s varre as salas com prazo e as de inatividade. A sala é a fonte da verdade; o temporizador só chama `rooms-service`.

- _Alternativa:_ um `setTimeout` por sala. Rejeitada: difícil de reconstruir após reinício e de cancelar.

### 2. Jogada automática reutiliza o bot fácil

`chooseBotAction(..., 'easy')` já escolhe jogadas legais. Registra `{type:'auto'}` no histórico e incrementa o contador de jogadas automáticas do jogador (usado pela change `seat-continuity-and-recovery`).

### 3. Barra no site sem biblioteca

O estado traz `turn.deadline` e `serverNow`. O navegador calcula o desvio do relógio uma vez e anima com `requestAnimationFrame`. Largura = restante/total; cor por faixas (50% e 20%). O relógio fica em `left: calc(restante*100%)` e usa uma variável CSS `--shake` que muda de 1,2 s para 0,2 s. `prefers-reduced-motion` e alto contraste desligam o balanço.

### 4. WhatsApp: barra em texto e dois lembretes

Barra de 10 quadrados calculada no momento do envio. Os lembretes (50% e 15 s) são agendados na varredura e cancelados quando a revisão da sala muda. Máximo de dois por vez para não parecer spam e não pesar no limite de envio.

### 5. Presença e cancelamento

Cada jogador tem `lastSeenAt` por sala (atualizado por conexão SSE, ação e mensagem). A varredura cancela quando `PLAYING` e todos os humanos estão sem conexão e com `lastSeenAt` acima de 5 min. Cancelar usa `status = CLOSED` com `closedReason = 'inactive'`, assim o restante do código já trata a mesa como encerrada; só a mensagem muda.

### 6. Botões: escolha por quantidade, com texto sempre junto

Uma função `presentOptions(options)` devolve `buttons` (≤3), `list` (4–10) ou `text`. O provedor envia o formato; se falhar, cai para `text` e abre um disjuntor de 30 min. O identificador do toque é `r<revisão>:<índice>`.

## Risks / Trade-offs

- **[Botões do WPPConnect são instáveis]** → o texto numerado vai sempre junto e o disjuntor evita falhas repetidas. A API oficial (change `operations-and-messaging`) suporta botões de forma nativa.
- **[Jogada automática irrita quem lê devagar]** → padrão de 60 s, ajustável de 30 a 90 s e pode ser desligado no painel do familiar.
- **[Relógio do aparelho errado]** → o cliente usa o desvio medido contra `serverNow`.
- **[Muitas varreduras]** → a varredura só percorre salas com prazo ativo, mantidas em um índice em memória reconstruído do banco na partida do servidor.

## Open Questions

- Padrão de 60 s é adequado ao público idoso? Pode mudar sem alterar specs.
