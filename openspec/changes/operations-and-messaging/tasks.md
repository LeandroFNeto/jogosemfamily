# Tasks

## 1. Provedor e fila de saída

- [x] 1.1 Definir a interface de provedor e adaptar o `wpp-client` a ela; verificar que os testes do canal passam sem alteração de regra
- [x] 1.2 Criar a tabela `outbox` e fazer `channel.mjs` enfileirar em vez de enviar direto; verificar que nenhuma mensagem sai sem registro
- [x] 1.3 Criar o laço de envio com ordem por destinatário e espera crescente; verificar com provedor falso que falha retém a seguinte e que o sucesso marca `sent_at`
- [x] 1.4 Descartar pendentes com mais de 10 minutos e contar; verificar com relógio simulado
- [x] 1.5 Retomar pendentes após reinício sem duplicar as confirmadas; verificar com teste de reinício

## 2. Saúde e métricas

- [x] 2.1 Criar `/healthz` (200/503) sem dados pessoais; verificar com banco e provedor simulados
- [x] 2.2 Criar `/metrics` com token e contadores; verificar 401 sem token e valores corretos com token
- [x] 2.3 Criar o verificador de 30 segundos e o aviso ao administrador após 5 minutos e no retorno, uma vez por ocorrência; verificar com relógio simulado
- [x] 2.4 Criar o `log` que descarta telefone e conteúdo; verificar que os registros de falha de envio não contêm o número

## 3. Retenção e backup

- [x] 3.1 Criar a limpeza diária (mensagens processadas, outbox enviada, códigos expirados, mesas encerradas antigas) preservando resultados e favoritos; verificar com dados de datas variadas
- [x] 3.2 Criar o backup com `VACUUM INTO` a cada 24 horas mantendo 7 cópias; verificar que a cópia abre e tem os mesmos dados, e que a oitava remove a mais antiga
- [x] 3.3 Adicionar `backups/` ao `.gitignore` e as variáveis `ADMIN_PHONE` e de retenção ao `.env.example`
- [x] 3.4 Documentar a restauração, o alerta e o aviso de guardar cópias fora do servidor em `docs/architecture.md` e `docs/whatsapp.md`

## 4. Integração

- [x] 4.1 Rodar `npm run format`, `npm run check`, `npm test` e `npm run test:e2e` e confirmar que tudo passa

## Workflow follow-up

- Aplicar depois de `whatsapp-bot-frontend` ser arquivada.
