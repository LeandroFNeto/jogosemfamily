# Tasks

## 1. Link pessoal e entrada na web

- [x] 1.1 Criar a tabela `web_links` e o serviço (emitir, resgatar, invalidar anteriores) com token de 32 bytes guardado como hash; testar uso único, 30 minutos de validade e perfil ligado
- [x] 1.2 Criar a rota `GET /m/:token` que adiciona a sessão sem apagar as outras e redireciona para a mesa; testar token usado, vencido, desconhecido e mesa encerrada, com páginas de erro em português do Brasil
- [x] 1.3 Ler a origem web (`PUBLIC_ORIGIN` ou `WEB_BASE_URL`) e montar o link; sem origem, o bot informa e não envia; testar os dois casos e atualizar `.env.example`

## 2. Menu no WhatsApp

- [x] 2.1 Fazer a criação de mesa (sozinho com dificuldade, com amigos, mistura de bots) terminar com o link pessoal em vez da tela de jogo; testar jogo e dificuldade chegando à mesa criada
- [x] 2.2 Enviar link próprio a quem entra por `ENTRAR`, pelo chamado de favoritos e por revanche; testar que o link do dono não serve ao convidado
- [x] 2.3 Implementar `jogo` (novo link, invalidando os anteriores) e a resposta a mensagens de jogada com link e comandos; testar sem mesa ativa e com mesa em andamento
- [x] 2.4 Trocar os avisos: partida começou com link, lembrete da vez com link (no máximo dois), fim com resultado resumido e revanche; testar que nada de mão ou palavra privada é enviado
- [x] 2.5 Atualizar boas-vindas e `ajuda`: o que o bot faz, que o jogo é na web e o que fazer se não houver resposta

## 3. Web

- [x] 3.1 Mostrar na mesa que espera jogadores quantos lugares faltam e a orientação de chamar amigos pelo WhatsApp; teste de navegador

## 4. Remoção do jogo por texto

- [x] 4.1 Remover `src/whatsapp/render/` de jogo, os estados de jogada e o parser de ações da conversa; ajustar ou remover os testes de jogo por mensagem e confirmar que os motores e a web continuam passando

## 5. Documentação e integração

- [x] 5.1 Atualizar `docs/whatsapp.md`, `docs/architecture.md`, `docs/tutorial.md` e `docs/status.md`, incluindo o limite da mesma rede e a opção de túnel com HTTPS
- [x] 5.2 Criar o teste de navegador do caminho WhatsApp simulado → link → partida na web
- [x] 5.3 Rodar `npm run format`, `npm run check`, `npm test`, `npm run test:bots`, `npm run test:e2e` e `openspec validate whatsapp-menu-web-games --strict`
