# Design

## Context

`leave` fecha a sala (`status = CLOSED`) para todos. A sala tem `playerIds`, `botIds` e `ownerId`; bots são perfis com `bot: true`. O perfil é identificado por cookie (site) ou por telefone (WhatsApp, tabela `channel_identities`).

## Goals / Non-Goals

**Goals:** sair sem derrubar a mesa, voltar ao mesmo lugar, dono com controle, recuperar conta.
**Non-Goals:** troca de número, recuperação por e-mail, login com senha.

## Decisions

### 1. Lugar é separado de quem o ocupa

A sala passa a ter `seats[]` com `{ playerId, state: 'present' | 'away' | 'removed', botId }`. Quando o estado é `away`, o motor continua usando o `playerId` da pessoa nas regras (mãos, placar); quem decide a jogada é o bot do lugar (`botId`). Assim "continuar do ponto onde o bot parou" é só voltar o estado para `present`. Nenhuma mão é trocada.

- _Alternativa:_ criar um perfil novo de bot e mover a mão. Rejeitada: perde histórico e placar e complica a volta.

### 2. Bot no lugar usa a dificuldade da mesa

Em mesas sem bots, o padrão é médio. A decisão passa por `advanceBots`, que passa a considerar lugares `away` além de `botIds`.

### 3. Retirar e dono que sai

`remove(ownerId, playerId)` marca `removed` e guarda o id numa lista `banned` da sala (só aquela mesa). Quando o dono sai, `ownerId` recebe um humano `present` sorteado com `crypto.randomInt`; sem humanos presentes, a sala segue como mesa de bots e entra na regra dos 5 minutos.

### 4. Código de recuperação

Tabela `recovery_codes(id, profile_id, code_hash, expires, attempts, ip_hash)`. Código de 6 dígitos com `crypto.randomInt`. O envio usa o canal do bot; a resposta HTTP é idêntica existindo ou não o perfil (sem enumerar números). Ao validar: cria sessão nova, apaga as anteriores (`DELETE FROM sessions WHERE profile_id`), envia aviso.

### 5. Vincular o número a um perfil do site

O site mostra um código de 8 caracteres (`link_codes`, 10 min); a pessoa o envia ao bot e o perfil do site passa a apontar para aquele número. Se o número já tem perfil do WhatsApp, a vinculação **não** mescla perfis: o sistema recusa e explica. Mesclar fica fora do escopo.

## Risks / Trade-offs

- **[Sequestro de conta se o número for clonado]** → mesmo risco de qualquer recuperação por SMS; mitigado por limites, aviso ao dono e revogação das sessões.
- **[Bot no lugar muda o resultado]** → aceito: a ausência já alterava o jogo; o resumo ao voltar mostra o que aconteceu.
- **[Estado de lugar em mesas antigas]** → mesas sem `seats` são lidas assumindo todos `present`.
- **[Abuso do "retirar"]** → só o dono, com confirmação, e o retirado fica livre para outras mesas.

## Migration Plan

1. Ler salas antigas sem `seats` como todos `present`.
2. Criar as tabelas de recuperação.
3. Rollback: voltar `leave` ao comportamento de fechar a sala; `seats` é ignorado.
