# Arquitetura e decisões do MVP

## Componentes

O navegador carrega HTML, CSS e módulos JavaScript. O servidor Node atende a interface, API JSON e eventos SSE na mesma origem. SQLite persiste perfis, sessões, convites e partidas. Não há dependências de produção; Playwright e Prettier servem apenas ao desenvolvimento.

Os motores não conhecem HTTP, cookies ou banco. O registro em `src/games/core/registry.mjs` fornece `createGame`, `processAction`, `requestRematch` e `publicGame` para dominó, Truco, palavras cruzadas, quebra-cabeça, Cacheta e caça-palavras. O catálogo compartilhado contém apenas metadados públicos. Soluções e estratégias de bot ficam no servidor; nunca importe esses módulos nas telas.

Mesas registram `playerIds`, capacidade, modo e IDs dos bots. O carregamento normaliza as mesas antigas com `ownerId`/`guestId`, sem apagar dados. Perfis antigos recebem a lista de jogos compatível com sua configuração de dominó; novos perfis e alterações usam `enabledGames`.

## Identidade e autorização

Um cookie aleatório `HttpOnly; SameSite=Lax` identifica o navegador por 30 dias. Só seu hash SHA-256 é armazenado. O painel configura o perfil desse navegador; não representa uma conta de administrador independente. Quem compartilha o navegador também compartilha o acesso ao perfil. Um familiar deve configurar o aparelho com o consentimento do jogador.

O convite contém apenas um token aleatório de 256 bits. O banco guarda o hash, mesa, validade e participante que o utilizou. Convites novos exigem aprovação explícita de quem criou a mesa. O nome e a foto ajudam no reconhecimento, mas não são prova de identidade: confirme por um canal conhecido quando houver dúvida. O convite pode ser vinculado a um contato já aprovado. Recusar, encerrar ou renovar invalida o link anterior.

O servidor restringe leitura e eventos aos participantes. Um participante pendente não recebe peças. Contatos aprovados entram automaticamente em novos convites do mesmo remetente; apagar cookies cria outro perfil e volta a exigir confirmação. Remover um contato encerra as mesas criadas com ele e revoga seus convites.

## Canal WhatsApp

`src/backend/rooms-service.mjs` concentra os casos de uso de mesa (criar, entrar, agir, revanche, sair) sem HTTP nem cookie; a API web e o bot chamam as mesmas funções, e `onRoomChanged` avisa quando uma mesa é salva. `src/whatsapp/` contém o cliente do WPPConnect, o webhook, a identidade por telefone, e a máquina de conversa (menu e convites; o jogo é na web). O telefone vira um perfil comum (tabela `channel_identities`, com hash e endereço cifrado); o estado da conversa fica em `conversations` e as mensagens já tratadas em `processed_messages`. Convites do WhatsApp usam código curto de 24 h, sem aprovação manual e válido até a mesa lotar; quem entra vira contato autorizado de quem convidou. Detalhes de operação, riscos e configuração: [whatsapp.md](whatsapp.md).

## Estado e regras

São 28 peças de duplo-seis, 7 por pessoa e 14 para comprar. Começa quem tem a maior dupla distribuída; se nenhuma dupla foi distribuída, começa quem tem a peça de maior soma (empate favorece quem criou a mesa). A primeira peça é livre. É obrigatório jogar se houver encaixe; sem encaixe, compra-se uma peça por ação, mantendo o turno. Só se pode passar com monte vazio e sem encaixe.

Ganha quem esvaziar a mão. Dois passes consecutivos fecham a mesa; vence a menor soma restante. Pontuação: soma do perdedor menos soma do vencedor. Empate não aumenta pontos nem vitórias. A revanche exige consentimento dos dois e preserva o placar. A vez tem tempo limitado (veja “Tempo da vez” abaixo).

Cada ação carrega a revisão da mesa. Depois de ler o corpo da requisição, o servidor recarrega e valida a revisão antes de executar a operação síncrona e persistir. Esse modelo evita perda de atualização dentro da única instância suportada. A interface escolhe possíveis encaixes para orientar o jogador; o servidor repete a validação independentemente.

SSE envia uma projeção própria para cada jogador, com somente sua mão, contagens dos adversários e monte, tabuleiro e placar. No Truco, somente a equipe com onze pontos vê as mãos dos parceiros durante a decisão dessa mão. As respostas pendentes das palavras cruzadas e o tabuleiro adversário do quebra-cabeça não são enviados. Reconectar restaura o estado sem repetir comandos. Presença indica uma conexão ativa, sem penalidade por desconexão. O histórico guarda as últimas 40 ações.

## Truco e desafios

O Truco usa 40 cartas, três por participante, vira e manilhas móveis. As equipes A/B alternam por assento. Os tamanhos de 6 e 8 são uma adaptação da mesa familiar para duas equipes maiores. Pedidos seguem 1→3→6→9→12; o próximo adversário representa a equipe na resposta. Correr entrega o valor aceito. Com onze pontos, o primeiro integrante da equipe decide e seus parceiros podem mostrar as cartas. Com as duas equipes em onze, usa-se mão de ferro aberta, sem aumento. Não há carta coberta nem regra especial de carta exposta; todas as cartas jogadas ficam visíveis. Regras completas de mesa estão na ajuda. Referência da modalidade: [Copag](https://blog.copag.com.br/a-copag/afinal-como-se-joga-o-truco-paulista).

Mesas online de Truco geram um convite por pessoa, com confirmação individual. Cada novo convite revoga o anterior. A partida começa somente com a capacidade completa. Todos os humanos devem consentir na revanche; entre mãos de uma mesma partida, qualquer participante pode avançar.

Palavras cruzadas, quebra-cabeça e caça-palavras permitem uma pessoa ou um grupo cooperativo, nunca bots (`createRoom` recusa `mode: 'bot'` nos jogos com `solo: true`). Na cooperação, a solução completa dá um ponto e uma vitória a cada participante. A montagem tem nove partes permutáveis e utiliza uma ilustração SVG própria ou a foto reduzida do perfil, escolhida explicitamente na criação.

## Bots e dificuldade

Bots possuem perfis sem sessão de login, gerados pelo servidor; clientes não podem enviar ações em nome deles. O servidor executa suas ações legais até devolver a vez a uma pessoa. O tempo da vez vale só para pessoas; bots jogam na hora. Mesas mistas guardam `humanSeats` e `botSeats`: pessoas ocupam os primeiros lugares e bots os últimos, o que equilibra as equipes do Truco (2 + 2, 3 + 1). Bots nunca entram no ranking.

Em jogos de vários jogadores, a varredura de 1 s (`rooms.sweep()`) preenche com bots (`fillWithBots`) as mesas `WAITING` em modo `online` que passaram de 3 minutos com ao menos uma pessoa, usando a dificuldade escolhida na criação (`fillDifficulty`, médio por padrão); o dono também pode pedir isso na hora (`POST /api/rooms/:id/fill`). Jogos individuais nunca são preenchidos. O instantâneo marca bots e lugares de quem saiu (`bot` e `seat`), e a interface mostra a marca 🤖 bot.

Os bots decidem só pela visão pública: a própria mão, mesa, quantidade de peças ou cartas dos outros e o que já foi jogado. Um teste troca as mãos adversárias e confirma que a jogada não muda. O sorteio vem de um gerador injetável (`src/games/core/rng.mjs`), então a mesma semente repete a mesma partida.

- Fácil: jogada legal ao acaso; nos jogos de resposta (Truco) erra de vez em quando.
- Médio: regras práticas. No dominó, controla o jogo: prefere a peça de maior soma, bônus para duplas e para a extremidade que deixa mais peças da própria mão encaixáveis. Essa heurística substituiu a de "preservar duplas" porque ficou em torno de 52% contra o fácil, abaixo da meta de 60%; a de controle chega a cerca de 64%. No Truco, joga a carta necessária mais fraca e pede aumento com mão forte.
- Difícil: sorteia mãos ocultas compatíveis com o que já saiu (determinização, até 100 amostras em no máximo 200 ms por decisão) e joga cada opção com a política média; no Truco, condiciona a mão do adversário a ele ter pedido aumento.
- Palavras cruzadas: o bot tenta uma palavra por vez, com acerto de 25%, 55% ou 85% por oportunidade. As soluções são conhecimento do bot, sem acesso ao texto digitado pela pessoa.
- Quebra-cabeça: o bot tenta colocar uma parte no lugar certo com chance de 25%, 65% ou 100%; nas demais jogadas, troca partes ainda fora do lugar ao acaso.

`npm run test:bots` roda o torneio com sementes fixas (200 partidas por confronto) em dominó e Truco e exige que médio > fácil e difícil > médio em 60% ou mais. A Cacheta também joga o torneio (2 jogadores): o médio vence o fácil em mais de 90% das partidas, mas o difícil vence o médio por cerca de 55%, porque a sorte pesa mais e o limite do teste é 55%. Fora disso os níveis seguem como heurísticas locais, não calibradas com jogadores reais. Para mais variedade nas cruzadas, amplie as grades em `src/games/crossword/puzzles.mjs`; mantenha soluções fora dos arquivos publicados pelo build.

## Banco de imagens do quebra-cabeça

A dificuldade define a grade: fácil 3×3 (9 peças), média 4×4 (16) e difícil 5×5 (25). Mesas antigas sem `size` abrem como 3×3. O catálogo embutido (`src/games/puzzle/images/catalog.json`, gerado por `scripts/build-images.mjs`) tem 12 ilustrações próprias em SVG, 4 por dificuldade, com título, categoria, licença e autoria. Elas funcionam sem rede.

`GET /api/images?difficulty=` lista as imagens e `GET /images/:id` serve cada uma pela própria origem, o que mantém a CSP restrita. Na criação a pessoa escolhe a imagem, deixa sortear ou usa a foto do perfil; a imagem precisa ser do mesmo nível.

Uma fonte externa é opcional. O servidor lê a lista JSON (`id`, `title`, `difficulty`, `license`, `url`, ...), baixa cada imagem, aceita só JPEG, PNG ou WebP de até 2 MB, exige licença e só baixa da origem da lista ou de hosts liberados. Imagens aceitas são servidas como `ext-<id>` e guardadas em disco. Se a fonte cair, o catálogo embutido continua atendendo e nenhuma criação falha.

| Variável          | Uso                                                             |
| ----------------- | --------------------------------------------------------------- |
| `IMAGE_API_URL`   | URL da lista externa; vazia desliga a fonte                     |
| `IMAGE_API_KEY`   | token Bearer opcional                                           |
| `IMAGE_API_HOSTS` | hosts extras permitidos para os arquivos, separados por vírgula |
| `IMAGE_CACHE_DIR` | pasta para guardar as cópias entre reinícios                    |

## Cacheta

Variante única e fixa, descrita na ajuda do jogo: de 2 a 4 jogadores, 52 cartas mais 2 curingas, 9 cartas por jogador e uma carta virada no descarte. Com 4 jogadores o monte começa com 17 cartas. A vez tem duas fases (`phase`): `draw` (comprar do monte ou pegar o topo do descarte) e `discard` (descartar uma carta ou bater). Quem pegou do descarte não pode devolver a mesma carta nessa vez.

- **Jogos:** sequência de 3 ou mais cartas seguidas do mesmo naipe, com o Ás baixo ou alto (sem dar a volta Rei–Ás–2), e trinca de 3 ou 4 cartas de mesmo valor e naipes diferentes. O curinga serve de qualquer carta, no máximo um por jogo.
- **Bater:** ação `knock`. O servidor procura, por busca com poda (`src/games/cacheta/melds.mjs`), um descarte que deixe as 9 cartas inteiras em jogos, e guarda essa organização no resultado. O jogador não organiza a mão; isso serve também ao WhatsApp. A mesa envia `knockCardIds` só para quem pode agir.
- **Monte:** quando acaba, o descarte (menos o topo) é embaralhado. Se ninguém bater em 150 turnos por jogador, a rodada termina empatada.
- **Privacidade:** o estado público traz só a mão de quem pede, o topo do descarte, o tamanho do monte e as quantidades de cartas dos outros. No fim, as mãos e as sobras são reveladas.
- **Tempo da vez:** se o prazo acabar, a jogada automática compra e descarta na mesma vez.
- **Bots:** o fácil joga cartas legais ao acaso (bate quando consegue). O médio avalia a mão pelas cartas fora de jogos e compra o descarte só se melhorar. O difícil conta as cartas ainda não vistas (descartes públicos e a própria mão), escolhe o descarte que deixa mais "saídas" e evita jogar o que ajuda quem pegou cartas do descarte. Todos decidem só pela visão pública.
- **Mesas:** de 2 a 4 lugares, com a mesma proporção de pessoas e bots do Truco ("metade bots" arredonda para baixo).

## Caça-palavras

O motor (`src/games/wordsearch/`) gera a grade com semente injetável: fácil 8×8 e 6 palavras (horizontal e vertical), média 12×12 e 10 (também diagonais), difícil 15×15 e 14 (também invertidas). As palavras vêm de listas temáticas em português, em maiúsculas e sem acento (`words.mjs`); se alguma não couber após 300 tentativas, outro conjunto é sorteado.

- **Ações:** `mark {start, end}` (linha reta; vale também de trás para a frente) e `word {text}` (o servidor localiza a palavra). No modo contra o bot, `pass`.
- **Privacidade:** as posições ficam em `placements`, no servidor. O estado público traz a lista de palavras e só as posições das já encontradas por quem pede.
- **Modos:** individual e cooperativo (lista compartilhada, vitória conjunta) ou contra o bot (progresso separado, vez alternada, vence quem completar a lista). Uma tentativa errada no modo competitivo passa a vez; nos outros, apenas é recusada.
- **Bot:** em cada tentativa acha uma palavra com 25%, 55% ou 85% de chance, conforme o nível.
- **Site:** toque no início e no fim, arrasto ou teclado; o texto digitado também funciona.

## Catálogo e perfis

`src/shared/games.mjs` lista seis jogos. Mesas de tamanho variável declaram `capacities` (Truco: só 4, dois contra dois; Dominó: 2, 3, 4; Cacheta: 2, 3, 4). Perfis novos já nascem com todos os jogos habilitados. Perfis antigos, sem lista própria, mantêm os quatro jogos que tinham; o familiar liga a Cacheta e o caça-palavras no painel.

## Operação e limites conhecidos

- Use uma instância do servidor. Eventos e presença ficam em memória; mais instâncias exigem pub/sub compartilhado e controle transacional entre processos.
- SQLite exige disco persistente e permissões de acesso restritas. Mesas e convites expirados são removidos periodicamente; perfis são mantidos para preservar contatos. Uma política de exclusão e recuperação de identidade é necessária antes de uma operação pública ampla.
- Configure HTTPS e `PUBLIC_ORIGIN` na publicação. O proxy deve preservar o Host, não armazenar respostas privadas e permitir SSE sem buffering. A aplicação não confia em `X-Forwarded-For`; o limite de pedidos é aplicado por IP da conexão (300/minuto), podendo agrupar usuários atrás de um proxy.
- Limites: dez mesas abertas por perfil, cinco conexões SSE por perfil, corpos de até 200 KB e fotos JPEG de até 160 mil caracteres. A redução da foto para 160×160 acontece no navegador.
- Sem recuperação de conta, senha, autenticação forte ou administração remota. Contatos são relações direcionais: quem aprova controla sua lista.
- O build prepara somente arquivos públicos. Publique também `src/backend`, módulos de domínio e `package.json`; `dist/` sozinho não executa partidas.
- Não há certificado de conformidade WCAG. Realize auditoria assistiva e testes com o público-alvo antes de declarar conformidade.

Referências técnicas: [SQLite no Node](https://nodejs.org/api/sqlite.html), [SSE no navegador](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) e [testes Playwright](https://playwright.dev/docs/intro).

## Tempo da vez

- Cada mesa tem um tempo por jogada: desligado, 30, 60 (padrão) ou 90 segundos, escolhido ao criar a partida. Só jogos com vez (dominó, Truco e os modos competitivos de palavras cruzadas e quebra-cabeça) têm prazo; partidas individuais e cooperativas não têm.
- O prazo é do servidor: a sala guarda `turn = { playerId, deadline, seconds }`, enviado ao navegador junto de `serverNow` para corrigir diferença de relógio. O prazo recomeça sempre que a vez muda.
- Uma varredura de 1 s (`rooms.sweep()`) joga pela pessoa quando o prazo vence, com a estratégia fácil dos bots, registra `auto` no histórico, guarda `autoPlays` por jogador e avisa a mesa. Ações que chegam depois do prazo recebem 409.
- No site, uma linha esvazia (verde acima de 50%, laranja até 20%, vermelha depois) e um relógio na ponta balança mais rápido ao fim (de 1,2 s a 0,2 s). O balanço some com “menos movimento” ou alto contraste; os segundos aparecem sempre em texto e há aviso por leitor de tela aos 10 s.

## Inatividade

- Está presente o jogador com conexão aberta no site ou com ação/mensagem nos últimos 5 minutos (`room.seen`, reiniciada ao subir o servidor).
- Partida `PLAYING` sem nenhum humano presente por 5 minutos é cancelada: `status = CLOSED` com `closedReason = 'inactive'` e convites revogados. Mesas aguardando amigos continuam valendo 24 horas.
- Quem volta a uma partida ativa a vê no estado atual; quem volta a uma cancelada recebe o aviso, o menu e precisa criar outra partida.

## Lugares, dono e recuperação

- Cada jogador ocupa um lugar (`room.seats`: `present`, `away` ou `removed`). Mesas antigas sem a lista leem todos como presentes. Quando o lugar está `away` ou `removed`, o motor continua usando o mesmo `playerId` (mão e placar não mudam) e `advanceBots` joga com a dificuldade da mesa (médio por padrão). O bot só joga se houver ao menos uma pessoa presente; sem ninguém, a regra de inatividade cancela em 5 minutos.
- Sair em partida em andamento deixa o lugar `away`; em mesa que espera amigos, libera a vaga. Quem abre a mesa de novo (site ou _jogo_ no WhatsApp) volta a `present`, com aviso do número de jogadas do bot. Só o dono encerra para todos (`close`) e retira jogadores (`remove`, lista `banned` por mesa). Se o dono sai, `ownerId` passa a um humano presente sorteado com `crypto.randomInt`.
- Recuperação: `recovery_codes` guarda só o hash (`sha256(id:código)`), com expiração de 10 minutos, 5 tentativas e limites de 3 pedidos por hora por número e por origem; a resposta é idêntica para números desconhecidos. `link_codes` liga um número ao perfil do site (10 minutos). Restaurar o acesso apaga as sessões antigas do perfil.

## Favoritos e ranking

- `favorites(owner_id, friend_id, state, created_at, decided_at, call_payload, retry_after)`: `state` é `pending`, `accepted`, `declined` ou `blocked` do ponto de vista de quem chama. A migração de `profile.contacts` roda na abertura do banco e é idempotente; `saveProfile` continua espelhando `contacts` como aceitos, e a remoção passa por `rooms.removeFavorite`. O chamado a quem não aceitou fica em `call_payload` e só é entregue após o Sim.
- `match_results(id, room_id, round, game_id, humans, winners, points)` com `UNIQUE(room_id, round)`: `save()` grava quando o jogo chega a `FINISHED` (cada revanche incrementa `room.round`), ignora bots e nunca grava partidas canceladas.
- O ranking é uma consulta sobre `match_results`: só conta partidas cujos humanos estão em {pessoa} ∪ favoritos aceitos, ordenando por vitórias, taxa e partidas. `GET /api/ranking?game=` devolve nome, vitórias, partidas e taxa, sem telefones.
- `call_log(batch, room_id, owner_id, friend_id, sent_at, answer)` sustenta os limites do chamado (5 min por mesa, 3 por hora) e autoriza os toques em Entrar.

## Operação: fila de saída, saúde e backup

- **Provedor de mensagens** (`src/messaging/provider.mjs`): interface `send(to, mensagem, interativo?)` e `status()`. O WPPConnect é a implementação inicial; a API oficial do WhatsApp pode entrar como outro arquivo com a mesma forma, sem mexer nos jogos.
- **Fila de saída durável** (`outbox` no SQLite): toda mensagem é gravada (destinatário cifrado) antes do envio e marcada com `sent_at` depois. Falhas repetem com espera de 2, 4, 8… até 60 s, mantendo a ordem por destinatário. Pendentes com mais de 10 minutos são descartadas e contadas; avisos ao administrador valem 24 h. Após reinício, as pendentes são retomadas sem repetir as confirmadas.
- **Saúde**: `GET /healthz` devolve 200 (banco respondendo) ou 503, com o estado do provedor, sem dados pessoais. Um desconectado ainda responde 200 e mostra o estado.
- **Métricas**: `GET /metrics` (cabeçalho `X-Admin-Token` ou `Authorization: Bearer`, valor de `ADMIN_TOKEN`/`WHATSAPP_ADMIN_TOKEN`) lista `mesa_messages_sent_total`, `mesa_messages_pending`, `mesa_messages_dropped_total`, `mesa_provider_errors_total`, `mesa_provider_connected` e `mesa_rooms_active`.
- **Alerta**: o monitor consulta o provedor a cada 30 s; após 5 minutos desconectado avisa `ADMIN_PHONE` uma vez por ocorrência e avisa de novo quando voltar.
- **Registros**: `src/shared/log.mjs` descarta telefone, destinatário e conteúdo; falhas de envio registram só código e identificador.
- **Retenção diária**: apaga mensagens processadas (7 dias), fila enviada/descartada (7 dias), códigos de recuperação vencidos e mesas encerradas há mais de 30 dias. Resultados de partidas e favoritos nunca são apagados. Ajuste com `RETENTION_MESSAGES_DAYS`, `RETENTION_OUTBOX_DAYS` e `RETENTION_ROOMS_DAYS`.
- **Backup**: a cada 24 horas, `VACUUM INTO` grava `mesa-AAAAMMDD.db` em `BACKUP_DIR` (padrão `./backups`, só com o banco padrão), mantendo as 7 mais recentes. **Copie essa pasta para fora do servidor**: backups no mesmo disco não protegem contra a perda dele.
- **Restauração**: pare o servidor, copie o arquivo escolhido sobre `data/mesa.sqlite` (apague `mesa.sqlite-wal` e `-shm`) e inicie de novo.

## WhatsApp como menu e jogo na web

- A conversa (`src/whatsapp/conversation.mjs`) só decide: jogo, modo, dificuldade, lugares, convites, favoritos, `sair`, `retirar`, `encerrar` e `revanche`. Não há renderização de jogo nem entrada de jogadas por mensagem.
- `src/invitations/web-links.mjs` emite o link pessoal (`/m/<token>`): token de 32 bytes, guardado como hash na tabela `web_links`, reutilizável e válido por 24 horas (pedir _jogo_ gera outro e invalida o anterior). O bot envia um link por pessoa e mesa e só o reenvia a pedido. `GET /m/<token>` só mostra o botão; `POST` abre uma sessão para o perfil, sem apagar as outras, e redireciona para `/mesa/<id>`.
- O bot avisa início, nova rodada, fim com resultado resumido e lembretes da vez (cada um com um link novo). Avisos de mesa (saiu, voltou, retirado, novo dono, jogada automática) seguem em texto.
- A origem do link vem de `PUBLIC_ORIGIN` ou `WEB_BASE_URL`; sem ela o bot não envia link.
