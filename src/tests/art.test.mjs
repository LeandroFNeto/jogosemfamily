import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  ART_SYMBOLS,
  allCards,
  allTiles,
  cardBackSvg,
  cardLabel,
  cardSvg,
  hiddenTileSvg,
  manilhaRank,
  tileLabel,
  tileSvg,
} from '../frontend/art.mjs';
import { cardStrength, fullDeck } from '../games/cards/engine.mjs';
import { createApplication } from '../backend/server.mjs';
import { galleryPage } from '../backend/art-gallery.mjs';

const css = readFileSync('src/frontend/styles.css', 'utf8');
const html = readFileSync('src/frontend/index.html', 'utf8');
const squash = (text) => text.replace(/\s+/g, '');

function luminance(hex) {
  const [r, g, b] = hex
    .replace('#', '')
    .match(/../g)
    .map((part) => parseInt(part, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Cor declarada (color ou fill) em um bloco CSS simples.
function colorOf(selector, property) {
  const block = css.match(
    new RegExp(
      `(?:^|\\n)${selector.replace(/[.[\]'=()]/g, '\\$&')}\\s*\\{([^}]*)\\}`
    )
  );
  const hex = block?.[1].match(
    new RegExp(`${property}:\\s*#([0-9a-f]{3,6})\\b`, 'i')
  )?.[1];
  if (!hex) return undefined;
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex}`;
}

test('o baralho tem as 52 cartas e o coringa, todas com arte própria', () => {
  const cards = allCards();
  assert.equal(cards.length, 53);
  const faces = new Set(cards.map((card) => cardSvg(card)));
  assert.equal(faces.size, 53, 'nenhuma carta repete a arte de outra');
  for (const card of cards) {
    const svg = cardSvg(card);
    assert.match(svg, /^<svg class="art-card /);
    assert.doesNotMatch(svg, /style=|<script|https?:|<image|href="[^#]/);
  }
});

test('as 28 peças são únicas e têm tantos pontos quanto o valor das metades', () => {
  const tiles = allTiles();
  assert.equal(tiles.length, 28);
  const arts = new Set();
  for (const tile of tiles)
    for (const vertical of [false, true]) {
      const svg = tileSvg(tile, { vertical });
      assert.equal(svg.split('class="art-pip"').length - 1, tile.a + tile.b);
      assert.doesNotMatch(svg, /style=|<script|https?:/);
      arts.add(svg);
    }
  assert.equal(arts.size, 56);
});

test('naipes se distinguem pela forma, não só pela cor', () => {
  const shapes = ['hearts', 'diamonds', 'clubs', 'spades'].map(
    (suit) =>
      cardSvg({ id: `${suit}-1`, suit, rank: 1 }).match(/href="#(s-\w+)"/)[1]
  );
  assert.equal(new Set(shapes).size, 4);
  for (const name of shapes)
    assert.ok(ART_SYMBOLS.includes(`id="${name}"`), `${name} existe no sprite`);
});

test('nomes acessíveis em português para cartas, peças e ocultos', () => {
  assert.equal(cardLabel({ suit: 'hearts', rank: 7 }), '7 de copas');
  assert.equal(cardLabel({ suit: 'spades', rank: 1 }), 'Ás de espadas');
  assert.equal(cardLabel({ suit: 'diamonds', rank: 12 }), 'Dama de ouros');
  assert.equal(cardLabel({ suit: 'joker', rank: 0 }), 'Curinga');
  assert.equal(tileLabel({ a: 6, b: 4 }), 'Peça seis e quatro');
  assert.equal(tileLabel({ a: 0, b: 1 }), 'Peça zero e um');
});

test('o verso e a peça virada não revelam nada da face', () => {
  const back = cardBackSvg();
  assert.doesNotMatch(back, /<text|#s-(hearts|clubs|spades|joker)/);
  assert.equal(back, cardBackSvg(), 'sempre idêntico');
  assert.doesNotMatch(hiddenTileSvg(), /art-pip/);
});

test('a manilha da arte segue a regra do motor do Truco', () => {
  const deck = fullDeck();
  for (const vira of deck) {
    const manilha = manilhaRank(vira);
    for (const card of deck)
      assert.equal(
        cardStrength(card, vira) >= 20,
        card.rank === manilha,
        `${card.id} com vira ${vira.id}`
      );
  }
});

test('o sprite do index.html é o mesmo que o módulo de arte define', () => {
  assert.ok(squash(html).includes(squash(ART_SYMBOLS)));
});

test('contraste: valor, naipe e pontos têm pelo menos 4,5:1 nos dois modos', () => {
  const checks = [
    ['.art-card', 'color', '.art-face', 'fill'],
    ['.art-card.red', 'color', '.art-face', 'fill'],
    ['.art-card.joker', 'color', '.art-face', 'fill'],
    ['.tile', 'color', '.art-tile-face', 'fill'],
    [
      "[data-contrast='true'] .art-card",
      'color',
      "[data-contrast='true'] .art-tile-face",
      'fill',
    ],
    [
      "[data-contrast='true'] .art-card.red",
      'color',
      "[data-contrast='true'] .art-tile-face",
      'fill',
    ],
    [
      "[data-contrast='true'] .art-card.joker",
      'color',
      "[data-contrast='true'] .art-tile-face",
      'fill',
    ],
    [
      "[data-contrast='true'] .tile",
      'color',
      "[data-contrast='true'] .art-tile-face",
      'fill',
    ],
  ];
  for (const [fgSel, fgProp, bgSel, bgProp] of checks) {
    const fg = colorOf(fgSel, fgProp);
    const bg = colorOf(bgSel, bgProp) ?? colorOf('.art-face', 'fill');
    assert.ok(fg && bg, `cores de ${fgSel}`);
    assert.ok(ratio(fg, bg) >= 4.5, `${fgSel}: ${ratio(fg, bg).toFixed(2)}`);
  }
  assert.ok(
    ratio(
      colorOf('.manilha-tag', 'color'),
      colorOf('.manilha-tag', 'background')
    ) >= 4.5
  );
});

test('a galeria mostra todo o baralho, as peças e os estados', () => {
  const page = galleryPage();
  assert.equal(page.split('class="playing-card').length - 1 >= 53, true);
  for (const tile of allTiles()) assert.ok(page.includes(tileLabel(tile)));
  assert.match(page, /data-font="normal"/);
  assert.match(
    galleryPage({ font: 'extra', contrast: true }),
    /data-font="extra"[^>]*data-contrast="true"/
  );
  assert.match(galleryPage({ font: '<x>' }), /data-font="normal"/);
});

async function get(app, path) {
  app.server.listen(0, '127.0.0.1');
  await new Promise((resolve) => app.server.once('listening', resolve));
  try {
    return await fetch(`http://127.0.0.1:${app.server.address().port}${path}`);
  } finally {
    await app.stop();
  }
}

test('/arte existe fora de produção e responde como inexistente em produção', async (t) => {
  const dev = createApplication({ databasePath: ':memory:', publicOrigin: '' });
  const ok = await get(dev, '/arte?font=large');
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Galeria de artes/);

  if (!existsSync('dist/index.html'))
    return t.skip('sem dist para subir em produção');
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const prod = createApplication({
      databasePath: ':memory:',
      publicOrigin: '',
    });
    assert.equal((await get(prod, '/arte')).status, 404);
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
});

test('movimento: só o que é novo anima, sem duplicar e dentro da janela de 300 ms', async () => {
  const { animateNew, ENTER_MS } = await import('../frontend/motion.mjs');
  const make = (key) => {
    const node = {
      dataset: { motion: key },
      classes: new Set(),
      style: { setProperty() {} },
    };
    node.classList = { add: (name) => node.classes.add(name) };
    return node;
  };
  const root = (...nodes) => ({ querySelectorAll: () => nodes });
  const a = make('b-1');
  animateNew(root(a), 'sala-1', 0);
  assert.equal(
    a.classes.has('enter'),
    false,
    'primeira renderização não anima'
  );
  const b = make('b-2');
  animateNew(root(make('b-1'), b), 'sala-1', 1000);
  assert.equal(b.classes.has('enter'), true, 'peça nova anima');
  const b2 = make('b-2');
  animateNew(root(make('b-1'), b2), 'sala-1', 1100);
  assert.equal(
    b2.classes.has('enter'),
    true,
    'segue marcada se outro estado chega'
  );
  const b3 = make('b-2');
  animateNew(root(make('b-1'), b3), 'sala-1', 1000 + ENTER_MS);
  assert.equal(b3.classes.has('enter'), false, 'a janela acaba em 300 ms');
  const other = make('b-9');
  animateNew(root(other), 'sala-2', 5000);
  assert.equal(
    other.classes.has('enter'),
    false,
    'outra mesa recomeça sem animar'
  );
});
