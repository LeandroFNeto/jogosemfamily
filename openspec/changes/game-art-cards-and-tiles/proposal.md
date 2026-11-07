# Proposal

## Why

Agora que a partida acontece só na web, a mesa é o produto inteiro. Hoje as cartas são texto estilizado (valor, símbolo e nome do naipe no `.playing-card`) e as peças de dominó são metades com pontos feitos em CSS. Funciona, mas parece protótipo: não há verso de carta, rosto de figuras, tapete de mesa nem movimento nas jogadas. Para um jogo de família (muitas vezes no celular, com pessoas mais velhas), a leitura clara de cada carta e peça e o capricho visual fazem diferença.

## What Changes

- Novo conjunto de **artes vetoriais próprias** (SVG inline, sem imagens externas nem dependências): baralho completo (A a K, quatro naipes e coringa), verso da carta, as 28 peças de dominó, a peça virada (mão dos adversários) e a superfície da mesa (tapete, madeira, bordas).
- As cartas e peças de **Truco, Cacheta e Dominó** passam a usar essa arte; a manilha, o descarte, as pontas abertas do dominó e a carta virada do Truco ganham destaque visual.
- **Animações curtas** de jogada (comprar, descartar, jogar peça, virar carta) com a opção de movimento reduzido respeitada.
- **Acessibilidade**: cada carta e peça mantém o nome falado em português (por exemplo "Sete de copas", "Peça seis e quatro"), contraste mínimo, naipes diferenciados por forma e não só por cor, e tamanho que cabe e é tocável no celular.
- Cartas e peças **acompanham** as preferências de acessibilidade que já existem (tamanho da letra normal/grande/extra e alto contraste), sem criar opção nova.
- Uma **página de galeria** de desenvolvimento (`/arte`, só fora de produção) que mostra todas as cartas, peças e estados para revisão visual e para os testes de navegador.
- Sem mudança nas regras, no servidor, na privacidade das mãos ou no WhatsApp.

## Capabilities

### New Capabilities

- `card-and-tile-art`: aparência das cartas, do verso, das peças de dominó e da mesa, com nome acessível, variantes de destaque e adaptação às preferências de tamanho e contraste.
- `play-motion`: movimento das jogadas na mesa, com respeito à preferência de movimento reduzido e sem atrasar a ação do jogador.

### Modified Capabilities

<!-- Nenhuma: os requisitos de regras e acessibilidade já existentes não mudam; os novos ficam nas capacidades acima. -->

## Impact

- `src/frontend/`: novo módulo de arte (`art.mjs`), ajustes em `games-ui.mjs` (Truco, Cacheta, Dominó) e `styles.css`; sem imagens binárias.
- `src/backend/server.mjs`: rota `/arte` apenas fora de produção, respeitando a CSP (sem estilos inline).
- `src/accessibility/client.mjs`: sem mudança de dados; as artes leem `data-font` e `data-contrast` já aplicados na página.
- Testes: unidade para a geração dos SVG (todas as 52 + coringa e 28 peças únicas, nomes corretos); navegador para a galeria, o modo grande e o movimento reduzido.
- Documentação: `docs/status.md` e `docs/tutorial.md`.
