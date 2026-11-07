# Proposal

## Why

Hoje o bot permite jogar inteiro pelo WhatsApp, com mão, tabuleiro e jogadas em texto. Na prática isso é pesado e limitado (grade de caça-palavras, cartas e tabuleiro de dominó em mensagens). O desejado é o inverso: o WhatsApp fica só como **menu e porta de entrada** (escolher jogo, dificuldade, mesa, chamar amigos, decidir) e a **partida acontece exclusivamente na web**, que já tem a interface completa.

## What Changes

- O bot do WhatsApp deixa de exibir o estado do jogo e de aceitar jogadas por texto. **BREAKING**: remove os renderizadores de texto por jogo e as ações de jogo por mensagem.
- No WhatsApp ficam todas as **decisões de preparação**: escolher o jogo; escolher sozinho contra bots (dificuldade fácil, média ou difícil) ou com amigos; definir lugares e mistura de humanos e bots; convidar amigos (link `wa.me`, favoritos, `chamar`); aceitar ou recusar convites e pedidos de favorito; `sair`, `retirar`, `encerrar`, `revanche`, `ranking`, `favoritos`.
- Ao criar a mesa, o bot responde com um **link pessoal para a web** que abre a partida já criada, com o jogo e a dificuldade escolhidos, sem cadastro nem senha.
- Cada pessoa que entra por convite recebe o seu **próprio link pessoal**. O link é de uso único, vale por pouco tempo e não deve ser encaminhado. Quem perdeu o link digita `jogo` e recebe um novo.
- O bot continua avisando o essencial: partida começou (com o link), lembrete para quem está parado na sua vez e resultado final com a pergunta de revanche.
- A web abre direto na mesa quando a pessoa chega por esse link e mostra quantos lugares faltam.
- O link usa uma origem web alcançável pelo celular. Sem ela configurada, o bot avisa que a web não está disponível em vez de enviar um link inútil.

## Capabilities

### New Capabilities

- `web-handoff-links`: geração, resgate e expiração do link pessoal de uso único que leva da conversa do WhatsApp para a mesa na web, sem senha.
- `whatsapp-menu-only`: o que o WhatsApp faz (decisões, convites, avisos) e o que deixa de fazer (renderizar jogo e aceitar jogadas).
- `web-room-entry`: comportamento da web ao receber o link: sessão do perfil, abertura da mesa certa e tratamento de link inválido, usado ou vencido.

### Modified Capabilities

<!-- Nenhuma: as capacidades do WhatsApp ainda estão na mudança whatsapp-bot-frontend, que não foi arquivada; os requisitos novos ficam nas capacidades acima. -->

## Impact

- `src/whatsapp/conversation.mjs`: remove a entrada de jogadas e os estados de jogo; passa a enviar link; ajusta os lembretes.
- `src/whatsapp/render/`: removido, exceto textos comuns que o menu ainda usar.
- `src/backend/server.mjs` e `store.mjs`: nova rota de resgate do link e tabela de links de uso único.
- `src/frontend/`: abre a mesa a partir do link e mostra os lugares que faltam; sem mudança nas regras dos jogos.
- Testes: remover os de jogo por texto; adicionar os de link, sessão e fluxo do menu; e2e do caminho WhatsApp → link → partida.
- Configuração: a origem web (`PUBLIC_ORIGIN` ou nova `WEB_BASE_URL`) precisa ser alcançável pelo celular. Em casa isso exige a mesma rede ou um túnel (por exemplo Cloudflare Tunnel); em produção, HTTPS.
- Documentação: `docs/whatsapp.md`, `docs/architecture.md`, `docs/tutorial.md` e `docs/status.md`.
