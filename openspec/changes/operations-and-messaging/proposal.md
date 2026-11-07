# Proposal

## Why

O envio de mensagens depende de um único servidor WPPConnect, sem fila durável, sem visão de saúde e sem rotina de backup. Se o WhatsApp cai ou o servidor reinicia, mensagens se perdem e ninguém percebe. Quanto mais gente joga, mais isso dói.

## What Changes

- **Provedor de mensagens trocável:** uma interface única de envio, com WPPConnect como implementação e espaço para a API oficial depois.
- **Fila de saída durável:** mensagens ficam no banco até serem enviadas, com novas tentativas e descarte após prazo.
- **Saúde e métricas:** `/healthz` e `/metrics` simples, e aviso ao administrador quando o bot cai.
- **Retenção e backup:** limpeza de dados antigos e cópia periódica do banco.

Não inclui validação de qualidade do bot (item tratado em outra change).

## Capabilities

### New Capabilities

- `messaging-provider`: interface de envio e fila de saída durável.
- `operations-health`: verificação de saúde, métricas e alerta ao administrador.
- `data-retention-backup`: retenção de dados e backup do banco.

### Modified Capabilities

<!-- Nenhuma. -->

## Impact

- `src/whatsapp/channel.mjs` e `wpp-client.mjs`: envio passa pela interface e pela fila.
- `store.mjs`: tabela `outbox`; rotinas de limpeza e backup.
- `server.mjs`: rotas `/healthz` e `/metrics` e variáveis de ambiente novas.
- Documentação: `docs/whatsapp.md`, `docs/architecture.md`, `.env.example`.
