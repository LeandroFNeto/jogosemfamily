# Design

## Context

- O servidor (`src/backend/server.mjs`) é Node puro com SQLite. A identidade é um perfil criado por cookie `mesa_session`; salas guardam `playerIds`, `botIds`, `capacity`, `mode` e o estado do jogo. Os motores em `src/games/*` já exportam `createGame`, `processAction`, `publicGame` e `requestRematch`, independentes de HTTP, e `chooseBotAction` roda os bots no servidor.
- Os use cases de sala (criar, entrar por convite, aprovar, agir, revanche, sair) estão embutidos dentro de `api()` e dependem de `me` vindo do cookie. Convites hoje têm uso único (`used_by`) e exigem aprovação do dono, exceto se o convidado já é contato.
- O Tech-Saas já tem: WPPConnect server em contêiner, geração de token (`/api/{sessao}/{secret}/generate-token`), `start-session` com webhook, `status-session`, QR Code, `send-message`, e um DTO de webhook tolerante a vários formatos (`from`, `data.key`, `@lid`, `fromMe`, `onselfmessage`) com filtros de grupo, status e mensagem antiga (>120 s). Esse código é Java; este projeto é Node.
- Produção é instância única com HTTPS (`PUBLIC_ORIGIN`), o que combina com estado de conversa em memória/SQLite. Ver `docs/architecture.md`.
- Ver proposal.md para a motivação.

## Goals / Non-Goals

**Goals:**

- Jogar os quatro jogos pelo WhatsApp, sozinho contra bots ou com amigos, com convite por link.
- Reutilizar motores, bots, persistência e regras de autorização existentes, sem duplicar regras.
- Manter o frontend web intacto.

**Non-Goals:**

- Migrar para a WhatsApp Cloud API oficial (avaliada como alternativa, ver abaixo).
- Jogar em grupos do WhatsApp.
- Voz, áudio, chamadas de vídeo, botões interativos nativos e imagens geradas (o Quebra-cabeça usa grade textual na primeira versão).
- Pagamento, planos ou multiempresa (o Tech-Saas é multiempresa; aqui há um único número de bot).
- Escalar para várias instâncias do servidor.

## Decisions

### 1. Bot em Node dentro do mesmo processo, WPPConnect como serviço separado

O código do Tech-Saas não é importado: copiamos a **ideia** (token, start-session, webhook, send-message) para `src/whatsapp/wpp-client.mjs`, usando `fetch` nativo. O `wppconnect-server` roda como contêiner à parte (mesma imagem/configuração do Tech-Saas, com `WEBHOOK_URL` apontando para o jogo).

- _Alternativa_: chamar o backend Java do Tech-Saas como proxy. Rejeitada: acopla duas stacks, adiciona Postgres/Spring sem necessidade e o `AGENTS.md` prefere APIs nativas e poucas dependências.
- _Alternativa_: Baileys embutido. Rejeitada: aumenta dependências de produção e mantém a conexão no mesmo processo do jogo.

### 2. Extrair casos de uso de sala para um módulo sem cookie

Criar `src/backend/rooms-service.mjs` com funções `createRoom(profile, options)`, `joinByCode(profile, code)`, `act(profile, roomId, action, revision)`, `rematch`, `leave`, `snapshot(room, playerId)`, recebendo o perfil já resolvido. `server.mjs` passa a delegar a elas, mantendo as respostas HTTP idênticas (protegido pelos testes atuais `api.test.mjs` e `games.test.mjs`). O canal WhatsApp chama as mesmas funções.

- _Alternativa_: o bot chamar a API HTTP em loopback com um token de serviço. Rejeitada: obrigaria falsificar cookie/origem e ainda duplicaria o `rateLimit`; porém é o plano B se a extração se mostrar arriscada.

### 3. Identidade por telefone

Tabela nova `channel_identities(channel, external_id_hash, profile_id)`. O `external_id` é o JID normalizado (somente dígitos), guardado também cifrado para envio de resposta; consultas usam hash. `@lid` é resolvido pelo campo `sender` como no Tech-Saas. O nome é pedido na primeira conversa.

- _Alternativa_: guardar o JID em claro no JSON do perfil. Rejeitada: telefones são dados pessoais e vazam em backups.

### 4. Convite por código curto e link `wa.me`

`issueInvitation` ganha o tipo `whatsapp` com código de 8 caracteres base32 (sem 0/O/1/I), expiração de 24 h e capacidade multiuso até a mesa lotar (necessário para Truco com 4/6/8). A entrada pelo WhatsApp **pula a aprovação** e adiciona o convidado a `owner.contacts`; no fluxo web a aprovação continua. O link é `https://wa.me/<WHATSAPP_BOT_NUMBER>?text=ENTRAR%20<CODIGO>`.

- _Alternativa_: reaproveitar token de 43 caracteres do convite web. Rejeitada: difícil de digitar se o link não abrir e feio numa mensagem curta.
- Segurança: o link equivale a consentimento do dono; recusa se `targetId` existir e for outro, impede dono duplicado e telefone duplicado.

### 5. Máquina de conversa por telefone

`src/whatsapp/conversation.mjs` mantém, por perfil, um estado simples: `NAME`, `MENU`, `PICK_MODE`, `PICK_DIFFICULTY`, `PICK_SEATS`, `IN_ROOM`. Persistido em SQLite (`conversations`) para sobreviver a reinício. As mensagens de um mesmo telefone passam por uma fila serial (`Map<jid, Promise>`) para manter ordem.

- Mensagem com `ENTRAR <CODIGO>` tem prioridade em qualquer estado.
- Em `IN_ROOM`, números respondem às opções da vez; palavras-chave globais (`menu`, `estado`, `ajuda`, `sair`, `revanche`) sempre funcionam.

### 6. Renderizadores de texto por jogo

Um módulo por jogo (`src/whatsapp/render/{domino,cards,crossword,puzzle}.mjs`) recebe o resultado de `publicGame(game, playerId)` e devolve `{texto, opcoes}`, onde `opcoes` mapeia o número digitado para a ação do motor. O mapeamento de opções é guardado junto da revisão da sala; jogada enviada com número de revisão antiga é recusada pelo servidor (`revision`), reaproveitando a proteção de concorrência existente.

- Dominó: peças como `[3|5]` e extremos da mesa; opções "jogar [3|5] à esquerda/direita", "comprar", "passar".
- Truco: cartas com naipe emoji; opções de jogar carta, truco/aumento, aceitar, correr.
- Palavras cruzadas: pista, número de letras e resposta digitada livre (não numerada).
- Quebra-cabeça: grade 3x3 numerada e comando `trocar A B`.

### 7. Notificações por publish

O bot se inscreve no mesmo mecanismo de `publish(room)` do servidor: ao salvar uma sala, envia a cada jogador com telefone vinculado a visão dele (apenas quando algo mudou para ele ou é a sua vez, para evitar spam). Os envios passam por uma fila com intervalo mínimo entre mensagens ao mesmo contato.

### 8. Configuração

Variáveis: `WPP_URL`, `WPP_SECRET_KEY`, `WPP_SESSION`, `WHATSAPP_BOT_NUMBER`, `WHATSAPP_WEBHOOK_SECRET`. O webhook é `POST /webhook/whatsapp?secret=...` (WPPConnect permite URL arbitrária). Sem essas variáveis o canal fica desligado e o servidor funciona só com a web, preservando desenvolvimento local.

## Risks / Trade-offs

- **[Bloqueio do número pelo WhatsApp (WPPConnect não é oficial)]** → número dedicado e descartável, só responder a quem escreveu primeiro, intervalo mínimo entre envios, sem envio em massa, aviso no README; plano de migração para a Cloud API oficial documentado como evolução.
- **[Notificação proativa fora da janela de 24 h na Cloud API]** → hoje irrelevante com WPPConnect; registrado para a migração.
- **[Refatoração de `server.mjs` quebrar o fluxo web]** → extrair em passos pequenos com os testes `api.test.mjs`/`games.test.mjs` verdes a cada passo; plano B de loopback HTTP.
- **[Mensagens de estado longas ou confusas no celular]** → textos curtos, emojis simples, divisão em partes e `ajuda` contextual; validar com pessoas idosas na fase de validação já pendente em `docs/status.md`.
- **[Telefone `@lid` não resolvido]** → usar `sender`; se continuar ambíguo, tratar `@lid` como identidade própria e não misturar com `@c.us`.
- **[Estado em memória (fila serial, anti-duplicidade)]** → aceitável com instância única; ids de mensagens processadas guardados em SQLite com TTL para sobreviver a reinício.
- **[Privacidade de telefones]** → hash para busca, cifra para envio, mascaramento em logs, nenhum telefone na `snapshot` enviada à web.

## Migration Plan

1. Criar migração de tabelas novas (`channel_identities`, `conversations`, `processed_messages`) com `CREATE TABLE IF NOT EXISTS`, sem alterar dados existentes.
2. Extrair `rooms-service` sem mudar o comportamento web; rodar a suíte completa.
3. Publicar o canal desligado por padrão (sem variáveis), depois ligar em homologação com um número de teste.
4. Subir o `wppconnect-server` em contêiner com volume persistente para tokens e perfil do navegador.
5. Rollback: remover as variáveis do canal desativa o bot; as tabelas novas são inertes e podem permanecer.

## Open Questions

- Qual número será usado em produção e quem escaneará o QR Code (não altera specs nem tarefas).
- Texto exato das mensagens de boas-vindas e ajuda (pode ser refinado durante a validação com usuários).
