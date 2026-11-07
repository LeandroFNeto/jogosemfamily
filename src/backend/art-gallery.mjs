import {
  ART_SYMBOLS,
  allCards,
  allTiles,
  cardBackSvg,
  cardLabel,
  cardSvg,
  hiddenTileSvg,
  tileLabel,
  tileSvg,
} from '../frontend/art.mjs';

const FONTS = ['normal', 'large', 'extra'];

/** Página de revisão visual (somente fora de produção): tudo o que a mesa desenha. */
export function galleryPage({ font = 'normal', contrast = false } = {}) {
  const size = FONTS.includes(font) ? font : 'normal';
  const card = (item, extra = '') =>
    `<figure class="gallery-item"><span class="playing-card${extra}" role="img" aria-label="${cardLabel(item)}">${cardSvg(item)}</span><figcaption>${cardLabel(item)}</figcaption></figure>`;
  const tile = (item, vertical) =>
    `<figure class="gallery-item"><span class="tile${vertical ? ' tile-v' : ''}" role="img" aria-label="${tileLabel(item)}">${tileSvg(item, { vertical })}</span><figcaption>${tileLabel(item)}</figcaption></figure>`;
  const cards = allCards();
  const sample = { id: 'hearts-7', suit: 'hearts', rank: 7 };
  const board = [
    { id: '2-3', a: 2, b: 3 },
    { id: '3-3', a: 3, b: 3 },
    { id: '3-6', a: 3, b: 6 },
  ];
  return `<!doctype html>
<html lang="pt-BR" data-font="${size}" data-contrast="${contrast ? 'true' : 'false'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galeria de artes — Mesa em Família</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
${ART_SYMBOLS}
<main id="main" class="gallery">
<h1>Galeria de artes</h1>
<p class="fine">Página de revisão visual, disponível só fora de produção. Use <code>?font=large</code>, <code>?font=extra</code> e <code>&amp;contrast=1</code>.</p>
<section aria-labelledby="g-cards"><h2 id="g-cards">Baralho</h2><div class="gallery-grid" id="gallery-cards">${cards.map((item) => card(item)).join('')}</div></section>
<section aria-labelledby="g-backs"><h2 id="g-backs">Verso e peça virada</h2><div class="gallery-grid">
<figure class="gallery-item"><span class="playing-card card-back" role="img" aria-label="Carta virada">${cardBackSvg()}</span><figcaption>Carta virada</figcaption></figure>
<figure class="gallery-item"><span class="tile tile-v" role="img" aria-label="Peça virada">${hiddenTileSvg({ vertical: true })}</span><figcaption>Peça virada</figcaption></figure>
<figure class="gallery-item"><span class="tile" role="img" aria-label="Peça virada">${hiddenTileSvg()}</span><figcaption>Peça virada (horizontal)</figcaption></figure></div></section>
<section aria-labelledby="g-tiles"><h2 id="g-tiles">Peças de dominó</h2><div class="gallery-grid" id="gallery-tiles">${allTiles()
    .map((item) => tile(item, true))
    .join('')}</div></section>
<section aria-labelledby="g-states"><h2 id="g-states">Estados</h2><div class="gallery-grid">
<figure class="gallery-item"><button class="card-button" disabled aria-label="Carta desativada"><span class="playing-card">${cardSvg(sample)}</span></button><figcaption>Desativada</figcaption></figure>
<figure class="gallery-item"><button class="card-button" aria-label="Carta jogável"><span class="playing-card">${cardSvg(sample)}</span></button><figcaption>Jogável</figcaption></figure>
<figure class="gallery-item"><button class="card-button is-manilha" aria-label="Manilha"><span class="playing-card manilha">${cardSvg(sample)}</span><span class="manilha-tag" aria-hidden="true">manilha</span></button><figcaption>Manilha</figcaption></figure>
<figure class="gallery-item"><button class="tile-button playable" aria-label="Peça jogável">${`<span class="tile tile-v" aria-hidden="true">${tileSvg({ a: 6, b: 4 }, { vertical: true })}</span>`}</button><figcaption>Peça jogável</figcaption></figure>
<figure class="gallery-item"><button class="tile-button playable selected" aria-label="Peça selecionada">${`<span class="tile tile-v" aria-hidden="true">${tileSvg({ a: 5, b: 5 }, { vertical: true })}</span>`}</button><figcaption>Peça selecionada</figcaption></figure></div></section>
<section aria-labelledby="g-table"><h2 id="g-table">Mesa de dominó</h2><div class="table"><div class="board can-play" role="list" aria-label="Sequência de peças">${board
    .map(
      (item, i) =>
        `<span class="board-tile${i === 0 || i === board.length - 1 ? ' open-end' : ''}" role="listitem" aria-label="${tileLabel(item)}"><span class="tile" aria-hidden="true">${tileSvg(item)}</span></span>`
    )
    .join('')}</div></div></section>
</main>
</body>
</html>`;
}
