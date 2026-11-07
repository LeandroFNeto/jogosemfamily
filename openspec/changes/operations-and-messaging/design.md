# Design

## Context

`channel.mjs` envia direto com `wpp-client.mjs`, e o `processed_messages` só evita duplicar mensagens de entrada. O servidor é uma única instância com SQLite.

## Goals / Non-Goals

**Goals:** não perder mensagens, enxergar problemas, limitar dados, poder restaurar.
**Non-Goals:** múltiplas instâncias, API oficial do WhatsApp agora, painel de monitoramento, validação do bot.

## Decisions

### 1. Interface mínima

`provider = { send(to, message) -> Promise<{ id }>, status() -> Promise<'connected' | 'disconnected'> }`. O `wpp-client` já existente a implementa; a API oficial vira outro arquivo depois.

### 2. Outbox em SQLite

Tabela `outbox(id, to_hash, to_sealed, body, created_at, attempts, next_at, sent_at, dropped_at)`. O destinatário é guardado cifrado como já ocorre em `channel_identities`. Um laço de 1 segundo pega o mais antigo pendente por destinatário com `next_at <= agora`, envia e marca. Falha: `attempts += 1` e `next_at = agora + min(2^attempts, 60)` segundos. Pendente com mais de 10 minutos vira `dropped_at`.

- _Alternativa:_ fila em memória. Rejeitada: perde tudo no reinício.

### 3. Saúde e alerta

`/healthz` consulta o banco (`SELECT 1`) e `provider.status()`. Um verificador a cada 30 segundos guarda desde quando o provedor está desconectado e avisa o administrador (`ADMIN_PHONE`) pelo próprio provedor se passar de 5 minutos; se o provedor está fora, o aviso fica na outbox e sai quando voltar. `/metrics` usa o formato de texto simples (`nome valor`) e o token administrativo.

### 4. Limpeza e backup

Um agendador diário executa as limpezas e o backup com `VACUUM INTO 'backups/mesa-AAAAMMDD.db'`, que gera uma cópia consistente sem parar o servidor. Mantém as 7 mais recentes. A pasta `backups/` entra no `.gitignore`.

### 5. Logs sem dados pessoais

Um pequeno `log(evento, campos)` descarta campos chamados `phone`, `to`, `body`; envio registra apenas `outbox.id` e código de erro.

## Risks / Trade-offs

- **[Reenvio duplicado se o provedor enviou mas não confirmou]** → aceito: melhor repetir uma mensagem que perder; o texto das mensagens do jogo é idempotente na leitura.
- **[Backup no mesmo disco]** → documentar para copiar a pasta para fora do servidor.
- **[Aviso ao administrador depende do próprio provedor]** → o alerta também aparece em `/healthz` e nas métricas.

## Migration Plan

1. Criar `outbox` e passar `channel.mjs` a enfileirar em vez de enviar.
2. Ligar o laço de envio, o verificador e o agendador.
3. Rollback: voltar `channel.mjs` ao envio direto; a tabela pode ficar sem uso.

## Open Questions

- Quando a API oficial do WhatsApp for usada, os botões e listas mudam; a interface já isola isso, mas os renderizadores precisarão de variantes.
