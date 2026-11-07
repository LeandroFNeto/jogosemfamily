# Tasks

## 1. Cacheta: regras

- [x] 1.1 Criar `src/games/cacheta/engine.mjs` com preparação, vez (comprar e descartar) e reciclagem do monte; verificar com testes de distribuição e de vez inválida
- [x] 1.2 Implementar o solucionador de jogos (sequências, trincas, curingas) e a ação `knock`; verificar com tabela de mãos válidas e inválidas
- [x] 1.3 Implementar `publicGame` com estado privado e revanche; verificar que mãos adversárias e ordem do monte nunca aparecem
- [x] 1.4 Registrar no catálogo e no painel do familiar; verificar que perfis antigos mantêm seus jogos

## 2. Cacheta: bots, site e WhatsApp

- [x] 2.1 Criar bots dos três níveis para a Cacheta; verificar que concluem partidas completas e que só usam informação pública
- [x] 2.2 Criar a tela do site com botões de comprar, descartar e bater; verificar em teste de navegador contra bot
- [x] 2.3 Criar o renderizador do WhatsApp (mão numerada, comprar, pegar descarte, descartar, bater); verificar com o servidor simulado
- [x] 2.4 Documentar as regras em `docs/tutorial.md` e a variante em `docs/architecture.md`

## 3. Caça-palavras: regras

- [x] 3.1 Criar `src/games/wordsearch/` com listas temáticas, gerador com semente e direções por dificuldade; verificar que todas as palavras cabem e que o nível fácil não usa diagonais
- [x] 3.2 Implementar `mark` e `word`, validação e placar; verificar acerto, erro e palavra digitada
- [x] 3.3 Implementar `publicGame` sem posições ocultas, os modos individual, cooperativo e contra bot, e a revanche; verificar que a solução não vaza
- [x] 3.4 Registrar no catálogo e no painel do familiar; verificar com perfil novo e antigo

## 4. Caça-palavras: bot, site e WhatsApp

- [x] 4.1 Criar o bot do caça-palavras com 25%, 55% e 85% por tentativa; verificar as taxas em simulação com semente fixa
- [x] 4.2 Criar a tela do site com toque e arrasto e a lista de palavras riscadas; verificar em teste de navegador, inclusive com teclado
- [x] 4.3 Criar o renderizador do WhatsApp com a grade rotulada e as entradas "B3 até B8" e palavra digitada; verificar com o servidor simulado
- [x] 4.4 Documentar o jogo em `docs/tutorial.md`

## 5. Integração

- [x] 5.1 Rodar `npm run format`, `npm run check`, `npm test` e `npm run test:e2e` e confirmar que tudo passa

## Workflow follow-up

- Aplicar junto de `smarter-bots-and-images` para o nível difícil da Cacheta.
