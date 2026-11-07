# Proposal

## Why

Hoje, quem sai de uma mesa a encerra para todos, o dono não pode tirar ninguém, e quem perde o cookie perde a conta. Isso derruba partidas por pouca coisa e deixa as pessoas sem saída.

## What Changes

- **Um bot assume o lugar** de quem sai ou some. Se a pessoa volta, continua do ponto em que o bot parou.
- **O dono pode retirar um jogador**; o lugar vira bot. Se o dono sai, a posse passa para outro humano sorteado.
- **Recuperação de conta pelo número:** um código aleatório é enviado ao WhatsApp cadastrado, e o código devolve o acesso ao perfil.

Depende de `whatsapp-bot-frontend` e de `timer-buttons-inactivity` (jogada automática e cancelamento por inatividade).

## Capabilities

### New Capabilities

- `seat-substitution`: bot no lugar de quem sai e retorno ao mesmo lugar.
- `table-ownership`: dono retira jogador, posse passa a outro quando o dono sai.
- `account-recovery`: número de WhatsApp registrado e código de recuperação.

### Modified Capabilities

<!-- Nenhuma. Substitui "sair encerra a mesa para todos" das changes anteriores: agora só o dono encerra. -->

## Impact

- `rooms-service.mjs`: estado de lugar (`present`, `away`, `removed`), troca para bot e retorno.
- Site e WhatsApp: botões "Sair (um bot assume)", "Encerrar mesa" (só o dono) e "Retirar jogador".
- Novas rotas de recuperação e vínculo de número; tabelas `recovery_codes` e `link_codes`.
- Sessões: revogação das sessões antigas ao recuperar.
- Documentação: `docs/architecture.md` (identidade e recuperação), `docs/whatsapp.md`.
