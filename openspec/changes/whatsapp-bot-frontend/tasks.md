# Tasks

## 1. Extrair casos de uso de sala

- [x] 1.1 Criar `src/backend/rooms-service.mjs` com `createRoom`, `joinByCode`, `act`, `rematch`, `leave` e `snapshot` recebendo o perfil já resolvido, e verificar que o módulo é importável sem HTTP (teste unitário novo em `src/tests/rooms-service.test.mjs`)
- [x] 1.2 Fazer `server.mjs` delegar a esse módulo mantendo as respostas HTTP idênticas e verificar que `npm test` (incluindo `api.test.mjs` e `games.test.mjs`) passa sem alterar os testes existentes
- [x] 1.3 Expor um gancho de eventos (`onRoomChanged`) que é chamado no `save(room)` e verificar com teste que dispara uma vez por revisão

## 2. Persistência e identidade por telefone

- [x] 2.1 Adicionar tabelas `channel_identities`, `conversations` e `processed_messages` em `store.mjs` com `CREATE TABLE IF NOT EXISTS` e verificar que um banco antigo abre sem perda de dados (teste de persistência)
- [x] 2.2 Implementar `src/whatsapp/identity.mjs` (normalização de JID, hash para busca, cifra para envio, mascaramento) e verificar com testes que `@c.us` e `@lid` resolvem corretamente e que o telefone nunca aparece em claro em logs
- [x] 2.3 Criar perfil na primeira mensagem e exigir nome antes de jogar; verificar com teste que perfil existente é reutilizado com contatos e jogos habilitados

## 3. Cliente WPPConnect e webhook

- [x] 3.1 Implementar `src/whatsapp/wpp-client.mjs` (token, `start-session`, `status-session`, QR Code, `send-message`) com `fetch` e verificar com um servidor falso que `CONNECTED`, `QRCODE` e `DISCONNECTED` são normalizados como no Tech-Saas
- [x] 3.2 Adicionar `POST /webhook/whatsapp` com segredo obrigatório e verificar que segredo ausente ou errado retorna erro e que o correto retorna 200
- [x] 3.3 Implementar filtros (grupo, status, não texto, eco, atraso >120 s, id duplicado) e verificar com testes de tabela usando payloads nos formatos plano, `data.key` e `@lid`
- [x] 3.4 Implementar fila serial por telefone e limite de mensagens por minuto, verificando em teste que duas mensagens rápidas são processadas em ordem e que o excesso gera um único aviso
- [x] 3.5 Adicionar rotas administrativas de status e iniciar sessão do bot protegidas por token e documentar em `docs/` como escanear o QR Code; verificar executando o passo a passo contra o servidor falso

## 4. Convites e entrada automática

- [x] 4.1 Estender `invitations/service.mjs` com convite `whatsapp` (código curto, 24 h, multiuso até lotar) e verificar com testes de expiração, uso e mesa cheia
- [x] 4.2 Implementar `joinByCode` sem aprovação manual, com inclusão automática em `owner.contacts` sem duplicar, e verificar que o fluxo web de aprovação permanece inalterado
- [x] 4.3 Cobrir restrições (dono usando o próprio código, telefone repetido, `targetId` de outro contato, contato removido) com testes de autorização
- [x] 4.4 Gerar o link `https://wa.me/<WHATSAPP_BOT_NUMBER>?text=ENTRAR%20<CODIGO>` e a mensagem de convite pronta para encaminhar, verificando o formato em teste
- [x] 4.5 Iniciar a partida e notificar todos quando a última vaga for preenchida, verificando mesas de 2 lugares e Truco de 4, 6 e 8 lugares

## 5. Conversa e renderização

- [x] 5.1 Implementar a máquina de conversa (`NAME`, `MENU`, `PICK_MODE`, `PICK_DIFFICULTY`, `PICK_SEATS`, `IN_ROOM`) persistida, com comandos globais `menu`, `estado`, `ajuda`, `sair`, `revanche`, e verificar com testes de transição incluindo entrada inválida
- [x] 5.2 Implementar criação de partida contra bots (fácil, médio, difícil) e solo, verificando que a partida inicia e os bots jogam pelo servidor
- [x] 5.3 Implementar renderizador e mapeamento de opções do Dominó e verificar em teste que a mão de um jogador não aparece na mensagem de outro
- [x] 5.4 Implementar renderizador do Truco (cartas, vira, truco/aumento, aceitar, correr) e verificar privacidade das cartas e fluxo de aumento
- [x] 5.5 Implementar renderizadores de Palavras cruzadas (resposta livre) e Quebra-cabeça (grade 3x3 e `trocar A B`) e verificar validação no servidor
- [x] 5.6 Rejeitar opção de revisão antiga e reenviar o estado, verificando em teste de concorrência com duas jogadas simultâneas
- [x] 5.7 Notificar vez, entrada/saída e fim de partida com revanche consensual, evitando mensagens duplicadas, e verificar com teste de ponta a ponta usando o servidor falso do WPPConnect

## 6. Configuração, documentação e integração

- [x] 6.1 Ler `WPP_URL`, `WPP_SECRET_KEY`, `WPP_SESSION`, `WHATSAPP_BOT_NUMBER` e `WHATSAPP_WEBHOOK_SECRET`, mantendo o canal desligado quando ausentes; verificar que `npm start` sem as variáveis funciona como antes
- [ ] 6.2 Adicionar `docker-compose` de exemplo do `wppconnect-server` (derivado do Tech-Saas, com volumes de tokens) e verificar que o contêiner sobe e responde ao status
- [x] 6.3 Atualizar `docs/architecture.md`, `docs/status.md`, README e `.env.example` (sem segredos) com o novo canal, o risco do WPPConnect e o plano de migração para a Cloud API
- [x] 6.4 Rodar `npm run format`, `npm run check`, `npm test` e `npm run test:e2e` e confirmar que tudo passa, incluindo a web sem alterações
- [ ] 6.5 Validar manualmente com um número de teste real: criar partida com amigos, entrar pelo link, jogar uma rodada de cada jogo e partida solo contra bot, registrando evidências em `docs/status.md`

## Workflow follow-up

- Revisar o design com a equipe e a decisão de usar WPPConnect não oficial versus Cloud API antes de produção.
- Arquivar a change após a validação com número real.
