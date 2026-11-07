// Arte vetorial das cartas e peças. Só gera texto SVG: sem DOM, sem estilos
// inline e sem imagens externas, para respeitar a CSP e poder ser testada em Node.
// As cores vêm de classes em styles.css; os símbolos vêm de ART_SYMBOLS (index.html).

export const SUITS = {
  clubs: 'paus',
  diamonds: 'ouros',
  hearts: 'copas',
  spades: 'espadas',
  joker: 'curinga',
};
export const RED_SUITS = ['diamonds', 'hearts'];

const RANK_NAMES = { 1: 'Ás', 11: 'Valete', 12: 'Dama', 13: 'Rei' };
const RANK_LETTERS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const NUMBER_WORDS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis'];
const TRUCO_ORDER = [4, 5, 6, 7, 12, 11, 13, 1, 2, 3];

export const rankName = (rank) => RANK_NAMES[rank] || String(rank);
export const cardLabel = (card) =>
  card.suit === 'joker'
    ? 'Curinga'
    : `${rankName(card.rank)} de ${SUITS[card.suit]}`;
export const tileLabel = (tile) =>
  `Peça ${NUMBER_WORDS[tile.a]} e ${NUMBER_WORDS[tile.b]}`;
export const BACK_LABEL = 'Carta virada';
export const HIDDEN_TILE_LABEL = 'Peça virada';

/** Valor da manilha a partir da carta virada (mesma regra do motor do Truco). */
export function manilhaRank(vira) {
  return TRUCO_ORDER[(TRUCO_ORDER.indexOf(vira.rank) + 1) % TRUCO_ORDER.length];
}

/** Formas dos naipes e ornamentos, em caixa 24×24, para <symbol> no index.html. */
export const ART_SYMBOLS = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" class="art-sprite" aria-hidden="true" focusable="false"><defs>
<symbol id="s-hearts" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21.5C5 15.8 2 12.4 2 8.6 2 5.6 4.3 3.5 7 3.5c2 0 3.8 1.1 5 3 1.2-1.9 3-3 5-3 2.7 0 5 2.1 5 5.1 0 3.8-3 7.2-10 12.9z"/></symbol>
<symbol id="s-diamonds" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5 21 12 12 22.5 3 12z"/></symbol>
<symbol id="s-clubs" viewBox="0 0 24 24"><g fill="currentColor"><circle cx="12" cy="7" r="4.6"/><circle cx="6.4" cy="14" r="4.6"/><circle cx="17.6" cy="14" r="4.6"/><path d="M10.5 14h3l1.8 8.5H8.7z"/></g></symbol>
<symbol id="s-spades" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5C6 8 3 11 3 14.6 3 17.4 5.1 19 7.4 19c1.7 0 3.1-.8 3.9-2.2l-.7 5.7h2.8l-.7-5.7c.8 1.4 2.2 2.2 3.9 2.2 2.3 0 4.4-1.6 4.4-4.4C21 11 18 8 12 1.5z"/></symbol>
<symbol id="s-joker" viewBox="0 0 24 24"><path fill="currentColor" d="m12 1.8 2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.1l7.1-.7z"/></symbol>
<symbol id="s-crown" viewBox="0 0 24 24"><path fill="currentColor" d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11zm0 2h18v2H3z"/></symbol>
<symbol id="s-tiara" viewBox="0 0 24 24"><g fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="7" r="2.4"/><circle cx="19" cy="12" r="2"/><path d="M3 20c2-6 5-8 9-8s7 2 9 8z"/></g></symbol>
<clipPath id="art-back-clip"><rect x="8" y="8" width="84" height="124" rx="5"/></clipPath>
</defs></svg>`;

const sym = (name, x, y, size, extra = '') =>
  `<use href="#s-${name}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"${extra}/>`;

// Posições dos símbolos (colunas 32/50/68) para 2 a 10, em caixa 100×140.
const L = 32;
const C = 50;
const R = 68;
const PIPS = {
  2: [
    [C, 32],
    [C, 108],
  ],
  3: [
    [C, 32],
    [C, 70],
    [C, 108],
  ],
  4: [
    [L, 32],
    [R, 32],
    [L, 108],
    [R, 108],
  ],
  5: [
    [L, 32],
    [R, 32],
    [C, 70],
    [L, 108],
    [R, 108],
  ],
  6: [
    [L, 32],
    [R, 32],
    [L, 70],
    [R, 70],
    [L, 108],
    [R, 108],
  ],
  7: [
    [L, 32],
    [R, 32],
    [C, 51],
    [L, 70],
    [R, 70],
    [L, 108],
    [R, 108],
  ],
  8: [
    [L, 32],
    [R, 32],
    [C, 51],
    [L, 70],
    [R, 70],
    [C, 89],
    [L, 108],
    [R, 108],
  ],
  9: [
    [L, 32],
    [R, 32],
    [L, 57],
    [R, 57],
    [C, 70],
    [L, 83],
    [R, 83],
    [L, 108],
    [R, 108],
  ],
  10: [
    [L, 32],
    [R, 32],
    [C, 44.5],
    [L, 57],
    [R, 57],
    [L, 83],
    [R, 83],
    [C, 95.5],
    [L, 108],
    [R, 108],
  ],
};

function corner(letter, suit) {
  const size = letter.length > 1 ? 16 : 20;
  return `<text class="art-rank" x="11" y="21" text-anchor="middle" font-size="${size}">${letter}</text>${sym(suit, 11, 33, 14)}`;
}

function cardCenter(card) {
  if (card.suit === 'joker')
    return `${sym('joker', 50, 70, 46)}<text class="art-joker-label" x="50" y="112" text-anchor="middle" font-size="10">CURINGA</text>`;
  if (card.rank === 1) return sym(card.suit, 50, 70, 44);
  if (card.rank >= 11) {
    const ornament = { 11: 'diamonds', 12: 'tiara', 13: 'crown' }[card.rank];
    return `<rect class="art-frame" x="24" y="24" width="52" height="92" rx="5"/>${sym(ornament, 50, 40, 14, ' class="art-ornament"')}<text class="art-figure" x="50" y="82" text-anchor="middle" font-size="40">${RANK_LETTERS[card.rank]}</text>${sym(card.suit, 50, 102, 16)}`;
  }
  return (PIPS[card.rank] ?? [])
    .map(([x, y]) =>
      y > 70
        ? `<g transform="rotate(180 ${x} ${y})">${sym(card.suit, x, y, 18)}</g>`
        : sym(card.suit, x, y, 18)
    )
    .join('');
}

/** Face da carta. Decorativa: o nome acessível fica no botão ou item que a contém. */
export function cardSvg(card) {
  const letter = RANK_LETTERS[card.rank] ?? String(card.rank);
  const tone =
    card.suit === 'joker'
      ? 'joker'
      : RED_SUITS.includes(card.suit)
        ? 'red'
        : 'black';
  const corners =
    card.suit === 'joker'
      ? `<g>${sym('joker', 11, 19, 14)}</g><g transform="rotate(180 50 70)">${sym('joker', 11, 19, 14)}</g>`
      : `<g>${corner(letter, card.suit)}</g><g transform="rotate(180 50 70)">${corner(letter, card.suit)}</g>`;
  return `<svg class="art-card ${tone}" viewBox="0 0 100 140" role="presentation" focusable="false" aria-hidden="true"><rect class="art-face" x="1" y="1" width="98" height="138" rx="9"/>${corners}${cardCenter(card)}</svg>`;
}

/** Verso padrão: não contém nenhuma informação sobre a face. */
export function cardBackSvg() {
  const lines = Array.from({ length: 9 }, (_, i) => {
    const o = 12 + i * 12;
    return `<path d="M${o} 14 ${o - 40} 126M${o} 14 ${o + 40} 126" />`;
  }).join('');
  return `<svg class="art-card art-back" viewBox="0 0 100 140" role="presentation" focusable="false" aria-hidden="true"><rect class="art-back-bg" x="1" y="1" width="98" height="138" rx="9"/><rect class="art-back-inner" x="8" y="8" width="84" height="124" rx="5"/><g class="art-back-lines" clip-path="url(#art-back-clip)">${lines}</g><rect class="art-back-medal" x="34" y="52" width="32" height="36" rx="6"/>${sym('diamonds', 50, 70, 16, ' class="art-back-mark"')}</svg>`;
}

const TILE_PIPS = [
  [],
  [5],
  [1, 9],
  [1, 5, 9],
  [1, 3, 7, 9],
  [1, 3, 5, 7, 9],
  [1, 3, 4, 6, 7, 9],
];
const OFFSET = 14;
const pipAt = (cx, cy, value) => (index) => {
  const col = ((index - 1) % 3) - 1;
  const row = Math.floor((index - 1) / 3) - 1;
  return `<circle class="art-pip" data-v="${value}" cx="${cx + col * OFFSET}" cy="${cy + row * OFFSET}" r="5.4"/>`;
};

/** Peça de dominó (0 a 6): horizontal 120×60 ou vertical 60×120. */
export function tileSvg(tile, { vertical = false } = {}) {
  const [w, h] = vertical ? [60, 120] : [120, 60];
  const centers = vertical
    ? [
        [30, 30],
        [30, 90],
      ]
    : [
        [30, 30],
        [90, 30],
      ];
  const halves = [tile.a, tile.b]
    .map((value, i) =>
      (TILE_PIPS[value] ?? [])
        .map(pipAt(centers[i][0], centers[i][1], value))
        .join('')
    )
    .join('');
  const line = vertical
    ? '<path class="art-tile-line" d="M8 60h44"/>'
    : '<path class="art-tile-line" d="M60 8v44"/>';
  const double = tile.a === tile.b ? ' double' : '';
  return `<svg class="art-tile${double}" viewBox="0 0 ${w} ${h}" role="presentation" focusable="false" aria-hidden="true"><rect class="art-tile-face" x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="8"/>${line}${halves}</svg>`;
}

/** Peça virada (mão oculta). */
export function hiddenTileSvg({ vertical = false } = {}) {
  const [w, h] = vertical ? [60, 120] : [120, 60];
  return `<svg class="art-tile art-tile-back" viewBox="0 0 ${w} ${h}" role="presentation" focusable="false" aria-hidden="true"><rect class="art-tile-back-face" x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="8"/><rect class="art-tile-back-inner" x="7" y="7" width="${w - 14}" height="${h - 14}" rx="5"/></svg>`;
}

export const allCards = () => {
  const cards = [];
  for (const suit of ['clubs', 'diamonds', 'hearts', 'spades'])
    for (let rank = 1; rank <= 13; rank++)
      cards.push({ id: `${suit}-${rank}`, suit, rank });
  cards.push({ id: 'joker-0', suit: 'joker', rank: 0 });
  return cards;
};
export const allTiles = () => {
  const tiles = [];
  for (let a = 0; a <= 6; a++)
    for (let b = a; b <= 6; b++) tiles.push({ id: `${a}-${b}`, a, b });
  return tiles;
};
