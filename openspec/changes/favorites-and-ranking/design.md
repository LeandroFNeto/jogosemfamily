# Design

## Context

Hoje `profile.contacts` é um vetor de ids dentro do JSON do perfil, e o ranking não existe: o placar vive dentro da mesa e some com ela. A identidade por telefone vem da change `whatsapp-bot-frontend`.

## Goals / Non-Goals

**Goals:** favoritos permanentes com consentimento, ranking simples, chamado em massa seguro.
**Non-Goals:** conversa livre entre jogadores, grupos, ranking global público.

## Decisions

### 1. Tabela `favorites`

`favorites(owner_id, friend_id, state, created_at, decided_at)` com chave `(owner_id, friend_id)`. Estados: `pending`, `accepted`, `declined`, `blocked`. `profile.contacts` continua sendo lido durante a migração (um passo único, idempotente, na abertura do banco) e depois é mantido em sincronia para o código web antigo, até ser removido em outra change.

### 2. Consentimento como estado, não como mensagem solta

O chamado a alguém `pending` fica guardado (`call_payload`) e é entregue somente quando a pessoa responde Sim. Isso evita enviar texto de convite a quem nunca falou com o bot. A pergunta de consentimento é a única mensagem proativa permitida sem aceite.

- _Alternativa:_ pedir consentimento só na primeira conversa. Rejeitada: não cobre pessoas que já falaram com o bot mas nunca com aquele convidador.

### 3. Tabela `match_results`

`match_results(id, room_id UNIQUE, game_id, ended_at, humans JSON, winners JSON, points JSON)`. O `UNIQUE(room_id, round)` impede gravar duas vezes; cada revanche usa um número de rodada. Gravado em `rooms-service` quando o jogo passa a `FINISHED`.

### 4. Ranking por consulta

Não há tabela de ranking: é uma consulta sobre `match_results` filtrando partidas em que todos os humanos pertencem a `{pessoa} ∪ favoritos aceitos`. Com poucos milhares de linhas é rápido; se crescer, vira tabela agregada em outra change.

### 5. Chamado em massa com limites

Fila de envio pelo canal existente, com os limites de 20 destinatários, 5 min por mesa e 3 por hora. O botão "Entrar" usa o código da mesa; "Criar outra sala" abre o fluxo de criação já com o jogo escolhido.

## Risks / Trade-offs

- **[Spam e bloqueio do número do bot]** → consentimento, limites e `parar convites`.
- **[Ranking sem filtro de partidas combinadas]** → só contam partidas terminadas e com humanos do grupo.
- **[Dupla lista (`contacts` e `favorites`)]** → sincronizadas na escrita até remover `contacts`.

## Migration Plan

1. Criar as tabelas com `CREATE TABLE IF NOT EXISTS`.
2. Migrar `contacts` para `favorites` como `accepted`.
3. Rollback: apagar as tabelas novas; `contacts` continua válido.
