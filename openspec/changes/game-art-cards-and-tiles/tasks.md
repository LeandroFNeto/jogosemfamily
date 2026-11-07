# Tasks

## 1. Módulo de arte

- [x] 1.1 Criar `src/frontend/art.mjs` com `cardSvg`, `cardBackSvg`, `tileSvg` (horizontal e vertical) e `hiddenTileSvg`, mais os `<symbol>` de naipes, coringa, coroa e ponto no `index.html`; testar na unidade que as 52 cartas + coringa e as 28 peças únicas são geradas, sem atributo `style` nem URL externa
- [x] 1.2 Criar a função de nome acessível das peças (`tileLabel`) e testar nomes em português para cartas, peças, verso e peça virada
- [x] 1.3 Definir as cores e os contornos por variável CSS, incluindo alto contraste, e testar por script a razão mínima de 4,5:1 de valor, naipe e pontos

## 2. Galeria de revisão

- [x] 2.1 Servir `/arte` com todas as cartas, verso, 28 peças e estados (jogável, selecionada, desativada, manilha, alto contraste) apenas fora de produção; testar que em produção responde como inexistente
- [x] 2.2 Teste de navegador da galeria: tamanhos normal, grande e extra, alto contraste, tela de 360 px sem rolagem horizontal da página e sem violações de CSP no console

## 3. Jogos de cartas

- [x] 3.1 Trocar `cardMarkup` pela arte nas mãos de Cacheta e Truco, mantendo `aria-label` e os testes existentes; mãos de adversários e monte com verso sem informação da face
- [x] 3.2 Destacar manilha e carta virada do Truco e o descarte e o monte da Cacheta, além da vez do jogador
- [x] 3.3 Garantir alvo de toque de 44 px e quebra de linha (sem rolagem horizontal) em telas estreitas; teste de navegador no celular emulado

## 4. Dominó

- [x] 4.1 Trocar os pontos em CSS pelas peças SVG na mão e no tabuleiro, com orientação correta das pontas e peça virada para as mãos ocultas
- [x] 4.2 Destacar pontas abertas e peças jogáveis com contorno, não só cor; teste de navegador com jogada e cadeia girada

## 5. Movimento

- [x] 5.1 Animar comprar, descartar, jogar carta ou peça e virar carta em até 400 ms com `transform` e `opacity`, sem bloquear botões e descartando animação pendente quando chega estado mais novo
- [x] 5.2 Desativar deslocamento e giro com `prefers-reduced-motion`, mantendo o destaque estático; teste de navegador com a preferência ativa

## 6. Documentação e verificação

- [x] 6.1 Atualizar `docs/status.md` e `docs/tutorial.md` com a nova aparência e a rota `/arte`
- [x] 6.2 Rodar `npm run format`, `npm run check`, `npm test`, `npm run test:bots`, `npm run test:e2e` e `openspec validate game-art-cards-and-tiles --strict`
