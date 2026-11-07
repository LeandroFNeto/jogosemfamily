# Canal WhatsApp

O WhatsApp é o **menu e a porta de entrada** do jogo: é aqui que se escolhe o jogo, a dificuldade e a mesa, e que se convidam amigos. **A partida acontece na web**, por um link pessoal que o bot envia. A integração com o WhatsApp é feita pelo [WPPConnect server](https://github.com/wppconnect-team/wppconnect-server), o mesmo usado no projeto Tech-Saas.

## Como funciona

1. A pessoa escreve para o número do bot. Na primeira vez, o bot explica o que faz, pergunta o nome e cria um perfil vinculado ao telefone.
2. O menu é uma **imagem** (`src/whatsapp/assets/menu-jogos.png`, gerada do SVG compacto `menu-jogos.svg` por `node scripts/build-menu-image.mjs`) com os seis jogos numerados: 1 Dominó, 2 Truco paulista, 3 Palavras cruzadas, 4 Quebra-cabeça, 5 Cacheta e 6 Caça-palavras. A pessoa responde com o **número** (fixo, como na imagem) ou com o **nome** do jogo (com ou sem acento e hífen). Se o jogo estiver desligado no painel do familiar, o bot avisa. Se a imagem não puder ser enviada, o bot manda o mesmo menu em texto. Dominó, Truco e Cacheta: **com amigos** (bots completam se faltar gente) ou **contra bots** (todos no mesmo nível). Palavras cruzadas, quebra-cabeça e caça-palavras: **em grupo** ou **sozinho**, sem bots. O Truco é sempre 2 contra 2 (4 lugares); o Dominó e a Cacheta perguntam 2, 3 ou 4 lugares; caça-palavras e quebra-cabeça perguntam a dificuldade.
3. Ao criar a mesa, o bot envia um **link pessoal** (`<origem-web>/m/<token>`). Quem abre o link toca em "Abrir minha partida" e cai na mesa, já com o jogo e a dificuldade escolhidos, sem cadastro nem senha.
4. Com amigos, o bot também devolve uma mensagem pronta para encaminhar, com o link `https://wa.me/<número-do-bot>?text=ENTRAR%20<CÓDIGO>`. Quem toca nele abre a conversa com o bot, **entra sem aprovação**, vira contato autorizado de quem convidou e recebe o **próprio** link pessoal. O código vale 24 horas e serve a várias pessoas até a mesa lotar.
5. Quando a mesa enche, a partida começa e cada pessoa recebe o aviso com o seu link. O jogo em si (mão, tabuleiro, jogadas) **não** passa pelo WhatsApp. Se alguém mandar uma jogada por mensagem, o bot não altera nada e devolve o link.
6. No fim da rodada o bot envia o resultado resumido e a pergunta de revanche (`revanche`). Se a pessoa estiver parada na sua vez, recebe lembretes com o link (no máximo dois).

Comandos válidos a qualquer momento: `menu`, `ajuda`, `jogo` (novo link da partida), `convite`, `chamar`, `favoritos`, `ranking`, `revanche`, `sair`, `retirar` e `encerrar`.

### Link pessoal

- É enviado **uma vez por pessoa e mesa**, fica **ativo por 24 horas** e pode ser aberto de novo; só o hash do token fica guardado. O bot não reenvia o link sozinho (nem em lembretes, nova rodada ou fim de partida): só quando a pessoa digita `jogo`, o que gera um link novo e invalida o anterior. Risco: quem tiver o link entra como a pessoa, então não encaminhe.
- Abrir o link (GET) só mostra o botão; a mesa é aberta pelo botão (POST). Assim as prévias de link do WhatsApp não gastam o acesso.
- Ele adiciona uma sessão no aparelho, sem apagar as de outros aparelhos. **Não encaminhe**: quem abrir entra como você.
- Sem origem web configurada, o bot avisa que a partida na web não está disponível e não envia link.

### Origem web e rede

O link usa `PUBLIC_ORIGIN` (HTTPS, produção) ou, fora de produção, `WEB_BASE_URL` (por exemplo `http://192.168.0.10:3000`, o endereço do notebook). Com endereço de rede local, **só aparelhos na mesma rede abrem o link**. Para jogar de qualquer lugar use um túnel ou domínio com HTTPS (por exemplo Cloudflare Tunnel) e coloque essa origem em `PUBLIC_ORIGIN`. O bot em si responde pela internet, sem depender da rede do celular.

O bot só responde em conversas privadas. Grupos, status, mídia, mensagens antigas (mais de 120 s), duplicadas e enviadas pelo próprio número são ignorados.

## Configuração

O canal fica desligado se faltar qualquer uma das variáveis obrigatórias, e o servidor continua atendendo só a web.

| Variável                  | Obrigatória | Uso                                                                                            |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `WPP_URL`                 | sim         | Endereço do WPPConnect, por exemplo `http://127.0.0.1:21465`.                                  |
| `WPP_SECRET_KEY`          | sim         | Chave usada para gerar o token da sessão (mesmo valor do contêiner).                           |
| `WHATSAPP_WEBHOOK_SECRET` | sim         | Segredo anexado à URL do webhook; também cifra os endereços se não houver `WHATSAPP_DATA_KEY`. |
| `WPP_SESSION`             | não         | Nome da sessão (padrão `mesa-familia`).                                                        |
| `WHATSAPP_BOT_NUMBER`     | não         | Número do bot com país e DDD, só dígitos. Sem ele o convite pede `ENTRAR <código>`.            |
| `WHATSAPP_WEBHOOK_BASE`   | não         | URL pela qual o WPPConnect alcança este servidor (padrão `PUBLIC_ORIGIN`).                     |
| `WHATSAPP_ADMIN_TOKEN`    | não         | Token das rotas `/admin/whatsapp/*`. Sem ele, as rotas recusam tudo.                           |
| `WHATSAPP_DATA_KEY`       | não         | Chave que cifra os endereços de resposta (recomendado separar do segredo do webhook).          |

## Conectar o número do bot

1. Suba o WPPConnect: `WPP_SECRET_KEY=... docker compose -f deploy/wppconnect/docker-compose.yml up -d --build`. A porta fica publicada só em `127.0.0.1`.
2. Inicie o servidor do jogo com as variáveis acima.
3. Peça o QR Code: `curl -X POST -H "x-admin-token: $WHATSAPP_ADMIN_TOKEN" http://localhost:3000/admin/whatsapp/start`. A resposta traz `status` e, enquanto o número não estiver conectado, `qrcodeBase64` (uma imagem `data:image/png;base64,...` para abrir no navegador).
4. No celular do número do bot: WhatsApp → Aparelhos conectados → Conectar um aparelho, e leia o QR Code.
5. Confira com `GET /admin/whatsapp/status` (envie o mesmo cabeçalho `x-admin-token`). O valor esperado é `CONNECTED`.

O webhook registrado no WPPConnect é `POST <WHATSAPP_WEBHOOK_BASE>/webhook/whatsapp?secret=<WHATSAPP_WEBHOOK_SECRET>`. Chamadas sem o segredo recebem 401.

## Tempo da vez e partidas abandonadas

- A mensagem de vez traz uma barra de dez quadrados (🟩 acima de 50%, 🟧 até 20%, 🟥 depois) e um ⏰ com os segundos restantes.
- O jogador da vez recebe no máximo dois lembretes: na metade do tempo e nos últimos 15 s. Jogar antes cancela o lembrete pendente.
- Esgotado o tempo, o servidor joga pela pessoa (estratégia fácil) e todos recebem “Tempo esgotado: jogada automática de …”.
- Se ninguém da mesa dá sinal por 5 minutos (nem mensagem no WhatsApp nem site aberto), a partida é cancelada e cada jogador recebe “Essa partida foi cancelada por falta de jogadores” com o menu. Para jogar de novo é preciso criar outra partida. Quem volta a tempo, com gente ainda jogando, vê a mesa no estado atual (digite _estado_).

## Sair, retirar e recuperar o acesso

- _sair_: o jogador deixa a mesa e **um bot assume o lugar**; a mesa continua para os outros. Digitar _jogo_ devolve o lugar, de onde o bot parou.
- Duas jogadas automáticas seguidas (tempo esgotado) também deixam o lugar com o bot.
- Só o dono usa _encerrar_ (fecha a mesa para todos) e _retirar_ (escolhe uma pessoa; o lugar vira bot e a pessoa não volta àquela mesa). Se o dono sai, a posse passa a outro humano sorteado.
- _VINCULAR CÓDIGO_: quem criou o perfil no site mostra um código em “Registrar meu número” e o envia ao bot; o número passa a ser do perfil do site. Números que já têm perfil com nome no WhatsApp não são mesclados.
- Na tela “Recuperar acesso” o site pede o número, e o bot envia um código aleatório de 6 dígitos (10 minutos, uso único, 5 tentativas, 3 pedidos por hora por número e por origem). Ao recuperar, as sessões antigas são revogadas e o dono recebe um aviso. Risco: quem clonar o chip recupera a conta, como em qualquer recuperação por SMS.

## Botões

- Até 3 opções: botões de resposta. De 4 a 10: lista. Acima disso: só texto numerado. A mensagem sempre traz as opções numeradas, então digitar o número continua valendo.
- Os botões servem às decisões (chamado de favoritos, consentimento, entrar ou recusar).
- Se o provedor recusar um botão ou lista, a mesma mensagem segue como texto e os botões ficam em pausa por 30 minutos.
- `WHATSAPP_INTERACTIVE=off` envia somente texto.

## Privacidade e segurança

- O telefone nunca é guardado em claro: a busca usa HMAC-SHA-256 e o endereço de resposta fica cifrado com AES-256-GCM. Logs mostram o número mascarado e nunca o texto das mensagens.
- Identificadores `@lid` e telefones `@c.us` são tratados como identidades diferentes e nunca se misturam.
- O servidor continua sendo a fonte de verdade: cada jogada passa pelo motor com a revisão da mesa, na web. Nenhuma mão ou palavra privada é enviada pelo WhatsApp.
- Limite de 30 mensagens por minuto por telefone. As mensagens de um mesmo telefone são processadas em ordem.
- O código de convite é aleatório (8 caracteres, sem 0/O/1/I), de 24 horas, ligado a uma única mesa e revogado quando a mesa é encerrada ou um novo convite é gerado.

## Risco operacional e evolução

O WPPConnect automatiza o WhatsApp Web e **não é uma API oficial**. O WhatsApp pode bloquear o número. Por isso:

- use um número dedicado e descartável, nunca o de uma pessoa ou do negócio principal;
- o bot só responde a quem escreve primeiro e espaça os envios (1 s por contato); não faça envio em massa;
- mantenha o servidor em instância única (o estado de envio e de conversa em andamento é por processo).

A evolução prevista é trocar `src/whatsapp/wpp-client.mjs` por um cliente da WhatsApp Cloud API oficial. O restante (conversa, renderizadores e mesas) não depende do WPPConnect. Na API oficial, mensagens fora da janela de 24 horas exigem modelos aprovados; as notificações de vez precisariam ser repensadas.

## Limites desta versão

- Quebra-cabeça em grade numérica de texto, sem imagem.
- Sem áudio nem mídia. Botões e listas dependem do WPPConnect e podem ser desligados (veja “Botões”).
- Sem grupos do WhatsApp.
- Notificações ocorrem como resposta a mudanças da mesa, mais no máximo dois lembretes de tempo por vez.

## Favoritos, consentimento e chamado em massa

- _favoritos_ mostra a lista permanente (guardada no servidor, ligada ao perfil) e _remover N_ tira alguém; o mesmo vale pelo painel do site. Remover revoga convites direcionados e encerra mesas que dependiam da pessoa.
- Entrar numa mesa pelo link vale como aceite nos dois sentidos: quem convidou e quem entrou viram favoritos aceitos um do outro, sem pergunta extra.
- Quem ainda não aceitou recebe uma única mensagem proativa: “_Fulano_ quer chamar você para jogar. Aceita receber convites de Fulano e colocar nos favoritos?”, com Sim, Não e Bloquear. O chamado fica guardado e só é entregue depois do Sim. Não: nada é entregue e quem chamou só vê “não está disponível”; só dá para tentar de novo após 7 dias. Bloquear: nenhum chamado dessa pessoa chega mais.
- _parar convites_ impede qualquer chamado (_receber convites_ desfaz). Sem botões (`WHATSAPP_INTERACTIVE=off`), basta responder SIM, NÃO, BLOQUEAR, ENTRAR ou AGORA NÃO.
- _chamar_, na mesa que espera amigos, envia “Fulano quer jogar Jogo. Entrar?” (Entrar / Agora não) a todos os favoritos aceitos e disponíveis. Não recebem: bloqueados, quem parou os convites, quem está em partida e quem não tem número registrado. Limites: 20 destinatários, 1 chamado por mesa a cada 5 minutos e 3 por hora por pessoa.
- Entrar com lugar usa as mesmas regras do link. Mesa cheia: “Infelizmente a sala está cheia.” com o botão “Criar outra sala” (abre a criação do mesmo jogo). Mesa cancelada ou encerrada: o bot avisa e mostra o menu.
- _ranking_ (ou _ranking truco_) lista vitórias, partidas e taxa entre você e seus favoritos. Nunca aparecem telefones.

## Operação, alertas e backup

- Defina `ADMIN_PHONE` (dígitos com país e DDD) para receber um aviso se o bot ficar mais de 5 minutos desconectado e outro quando voltar. Defina `ADMIN_TOKEN` (ou use `WHATSAPP_ADMIN_TOKEN`) para consultar `/metrics`; `/healthz` é público e sem dados pessoais.
- Mensagens ficam numa fila durável: se o WhatsApp cair, elas saem na ordem quando voltar (até 10 minutos; depois são descartadas e contadas em `mesa_messages_dropped_total`).
- O banco é copiado todo dia para `BACKUP_DIR` (7 cópias). Guarde essas cópias também fora do servidor.
- Para restaurar: pare o servidor, substitua `data/mesa.sqlite` pela cópia desejada e inicie novamente.
- Retenção configurável por `RETENTION_MESSAGES_DAYS`, `RETENTION_OUTBOX_DAYS` e `RETENTION_ROOMS_DAYS`; resultados e favoritos são preservados.

## Reiniciou o Docker ou o computador?

Se o bot parar de responder depois de reiniciar o Docker, rode com o jogo ligado (`npm start`):

```bash
npm run wpp:up
```

O script (`scripts/wpp-restart.ps1`) espera o Docker, apaga a trava antiga do Chromium (`Singleton*`) que impede o WPPConnect de abrir, sobe o contêiner e registra o webhook de novo. A sessão do WhatsApp é mantida, então não precisa de novo QR Code. Só se o status final for `QRCODE` a sessão foi perdida.

O WPPConnect só entrega mensagens para a URL listada em `WEBHOOK_ALLOWED_URLS`. O compose usa a variável `WPP_WEBHOOK_URL` do `.env`, que deve ser exatamente `<WHATSAPP_WEBHOOK_BASE>/webhook/whatsapp?secret=<WHATSAPP_WEBHOOK_SECRET>`. Sem isso, as mensagens chegam ao WPPConnect e não ao jogo.

O bot responde pelo WhatsApp, pela internet: o celular não precisa estar na mesma rede do notebook. O notebook, porém, precisa estar ligado, com o Docker e o jogo rodando.
