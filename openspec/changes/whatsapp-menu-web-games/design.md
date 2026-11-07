# Design

## Context

O canal WhatsApp (`conversation.mjs`, `render/*`) hoje conduz a partida inteira: renderiza o estado de cada jogo em texto e interpreta números como jogadas. A web já tem interface completa para os seis jogos, autorização no servidor e partidas por SSE. A identidade web é um cookie de sessão (`mesa_session`, tabela `sessions`); o telefone do WhatsApp já se liga a um perfil (`channel_identities`). A recuperação de conta (`/api/recovery/verify`) já sabe abrir sessão para um perfil, mas derruba as sessões antigas.

## Goals / Non-Goals

**Goals:** WhatsApp só para decisões e convites; partida só na web; entrada na web sem senha a partir da conversa; manter regras, bots e privacidade como estão.
**Non-Goals:** mudar regras dos jogos; nova interface web de criação de mesa (a que existe continua); múltiplas instâncias; túnel ou domínio automático; app nativo.

## Decisions

### 1. Link pessoal de uso único (`/m/<token>`)

Tabela `web_links(token_hash, profile_id, room_id, expires, used_at)`. Token de 32 bytes em base64url (mesmo gerador de `invitations/service.mjs`), guardado como hash, validade de 30 minutos, uso único. Ao digitar `jogo`, os links não usados do mesmo perfil e mesa são apagados e um novo é emitido. `GET /m/:token` só confere o token e mostra o botão "Abrir minha partida" (prévias de link do WhatsApp fazem GET e não podem gastar o acesso). `POST /m/:token` marca `used_at`, **adiciona** uma sessão (`startSession`, sem apagar as outras) e redireciona (303) para `/mesa/<id>`.

- _Alternativa:_ reaproveitar o convite web (`/api/invitations`). Rejeitada: ele cria perfil novo e exige aprovação; aqui o perfil já existe e é conhecido.
- _Alternativa:_ link longo e reutilizável. Rejeitada: quem encaminhasse o link entregaria a conta.

### 2. Convidados recebem link próprio

O dono nunca encaminha link web. O convite continua sendo `wa.me/<bot>?text=ENTRAR <código>` ou o chamado de favoritos; cada pessoa, ao entrar, recebe do bot o seu link pessoal. Isso mantém "decisão e convite no WhatsApp" e evita transferir sessões.

### 3. O que sai e o que fica na conversa

Sai: `render/*` de jogo, os estados `IN_ROOM` de jogada e o parser de jogadas. Fica: menu, escolha de jogo, modo, dificuldade, lugares e mistura, convites, favoritos, `chamar`, `ranking`, `sair`, `retirar`, `encerrar`, `revanche`, `convite`, `jogo`. Durante a partida, qualquer mensagem que não seja comando recebe o link novo e a lista curta de comandos. O motor, a criação de mesa e os bots em `rooms-service` não mudam.

### 4. Avisos

Reaproveita `onRoomChanged` e o `tick` de lembretes: "partida começou" e "é a sua vez" trazem o link (um novo, se o anterior venceu ou foi usado); o fim traz o resultado resumido (vencedor e pontos) e a pergunta de revanche. Sem estado de jogo no texto. Os lembretes continuam no máximo dois por vez, e só para quem tem telefone ligado.

### 5. Origem web alcançável

O link usa `PUBLIC_ORIGIN` (HTTPS, produção) ou, fora de produção, nova `WEB_BASE_URL` (por exemplo `http://192.168.5.9:3000`). Sem nenhuma das duas, o bot diz que a web não está disponível e não envia link. Em casa o celular só abre o link na mesma rede; para jogar de qualquer lugar é preciso um túnel ou domínio com HTTPS, descrito na documentação.

### 6. Web

`/m/:token` é tratado no servidor (cookie e redirecionamento). A tela da mesa já existe; acrescenta-se o aviso "faltam N lugares, chame amigos pelo WhatsApp" quando a mesa espera jogadores. Páginas de erro do link em português.

## Risks / Trade-offs

- **Link encaminhado por engano** → uso único, 30 minutos, aviso na mensagem e novo link sob demanda.
- **Celular fora da rede do notebook** → o link não abre; mensagem clara e documentação do túnel. É o limite real do modo "em casa".
- **Perda da jogabilidade só no WhatsApp** → intencional; quem não tem web disponível não joga. Mitigação: aviso explícito quando a origem não está configurada.
- **Remoção grande de código e testes** → feita em etapas, mantendo a suíte verde a cada tarefa; os motores não são tocados.
- **Cliente WhatsApp bloqueado** → o risco do WPPConnect continua o mesmo de antes; esta mudança reduz o volume de mensagens (sem uma por jogada).

## Migration Plan

1. Criar `web_links` e a rota `/m/:token` com testes. 2. Trocar o fluxo do bot para enviar links, ainda com o jogo em texto desligado por padrão. 3. Remover o jogo por texto e seus testes. 4. Atualizar documentação e e2e. Reversão: reativar o jogo por texto exige restaurar `render/*`; por isso a remoção é a penúltima tarefa.

## Open Questions

- Origem pública para uso fora de casa (túnel ou domínio): decidir antes de convidar amigos de outras redes. Esta mudança só exige que a origem seja configurável.
