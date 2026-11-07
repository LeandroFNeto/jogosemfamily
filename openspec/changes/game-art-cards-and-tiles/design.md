# Design

## Context

Hoje `games-ui.mjs` monta as cartas como texto (`cardMarkup`: valor, símbolo do naipe e nome) e o dominó usa `.tile-half` com pontos em CSS. A CSP proíbe estilos inline, o projeto evita dependências de produção e a mesa precisa funcionar em celulares. A acessibilidade já define `data-font` e `data-contrast` no `<html>`. Veja `proposal.md` para a motivação.

## Goals / Non-Goals

**Goals:** arte consistente, leve e legível para cartas, peças e mesa; nomes acessíveis; adaptação a tamanho e contraste; movimento curto e opcional; revisão visual fácil.
**Non-Goals:** mudar regras, estado do servidor, mãos privadas ou WhatsApp; ilustrações encomendadas ou imagens raster; temas de mesa personalizáveis; som.

## Decisions

### 1. SVG gerado por código, em um módulo único

Novo `src/frontend/art.mjs`, sem DOM, que devolve strings de SVG: `cardSvg(card)`, `cardBackSvg()`, `tileSvg([a, b], { vertical })`, `hiddenTileSvg()`. As figuras (J, Q, K) usam monograma e coroa/ornamento vetorial simples; as demais usam a disposição tradicional dos símbolos. Os naipes têm paths próprios; espadas e paus em tom escuro e copas e ouros em vermelho, sempre com a forma distinta. Cores vêm de variáveis CSS (`fill: currentColor` e classes), nunca de atributos `style`.

- _Alternativa:_ arquivos SVG/PNG por carta (52+28). Rejeitada: dezenas de arquivos, difícil de manter e de adaptar ao contraste.
- _Alternativa:_ fonte de ícones ou biblioteca de baralho. Rejeitada: dependência nova sem necessidade.

### 2. Um símbolo por naipe e `<use>`

Um `<svg hidden>` no `index.html` define `<symbol>` para os quatro naipes, o coringa, as coroas e o ponto do dominó. Cada carta referencia os símbolos com `<use>`, o que reduz o HTML por carta e mantém o tamanho do DOM baixo em mãos de 10 cartas ou 14 peças.

### 3. Nome acessível separado da arte

O SVG é `aria-hidden`; o botão ou item que o contém carrega o `aria-label` em português (`cardLabel` já existe; adiciona-se `tileLabel`). Verso: "Carta virada"; peça virada: "Peça virada". A manilha ganha `data-manilha` e o rótulo "manilha".

### 4. Acessibilidade e tamanho

As dimensões usam `em`/`rem` e variáveis CSS ligadas a `[data-font]`; em `[data-contrast='true']` os contornos engrossam e as faces usam fundo branco puro com símbolos em preto ou vermelho escuro. Largura mínima de toque de 44 px na mão; em telas estreitas as cartas diminuem um pouco e quebram de linha, sem rolagem horizontal da página.

### 5. Movimento com FLIP simples

Ao receber um novo estado, a tela compara a posição anterior e a nova de cada item (por `id` da carta ou peça) e aplica uma classe de transição (`transform` e `opacity`, ≤ 400 ms). Nada espera a animação: os botões usam o estado novo imediatamente e um estado mais novo cancela a transição em curso. `@media (prefers-reduced-motion: reduce)` remove as transições e deixa só o contorno de destaque.

### 6. Galeria `/arte`

Rota servida só quando `NODE_ENV !== 'production'`, com HTML estático que importa `art.mjs` e desenha todas as cartas, o verso, as 28 peças e os estados (jogável, selecionada, desativada, manilha, alto contraste). Serve de base para testes de navegador e para revisão visual sem montar uma partida.

## Risks / Trade-offs

- **Aparência de figuras (J/Q/K) limitada** → monogramas e ornamentos vetoriais simples; a arte é trocável depois porque está isolada em `art.mjs`.
- **Desempenho do DOM em mãos grandes** → `<use>` e SVG leve; mede-se o tempo de renderização de uma mão de 10 cartas no teste de navegador.
- **Contraste insuficiente em vermelho sobre fundo claro** → escolher tons já validados a 4,5:1 e testar a razão por script na unidade.
- **Animação em aparelhos fracos** → só `transform`/`opacity`, duração curta e desligada com movimento reduzido.
- **Cache de arte antiga** → `art.mjs` e `styles.css` seguem o mesmo versionamento de assets do build.

## Migration Plan

1. Criar `art.mjs` e a galeria com testes de unidade. 2. Trocar Cacheta e Truco (cartas), depois o Dominó (peças), mantendo os testes de navegador existentes verdes a cada passo. 3. Acrescentar destaques e movimento. 4. Documentar. Reversão: voltar o `cardMarkup` e o CSS de peças anteriores, pois as regras e o servidor não mudam.

## Open Questions

- Estilo das figuras (J, Q, K): monogramas simples (assumido) ou ilustrações mais elaboradas, o que exigiria arte feita por quem desenha. Não bloqueia a implementação.
