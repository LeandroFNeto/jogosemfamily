// Imagens de decisão do bot (modo, lugares, dificuldade, escolha de imagem).
// Só gera texto SVG: sem DOM e sem rede, para ser testada em Node. O script
// scripts/build-menu-image.mjs transforma cada uma em PNG (o menu de jogos,
// menu-jogos.svg, é desenhado à mão e segue o mesmo estilo).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(here, '../games/puzzle/images');

const GREEN = '#2f6b4f';
const DEEP = '#214e40';
const CREAM = '#fffefa';
const INK = '#233c34';
const WIDTH = 720;
const FONT = "'Segoe UI',Arial,sans-serif";

const escapeXml = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );

// Pessoa estilizada, centrada em (x, y) = base do corpo.
const person = (x, y, scale = 1) =>
  `<g transform="translate(${x} ${y}) scale(${scale})" fill="${CREAM}"><circle cx="0" cy="-34" r="11"/><path d="M-17 0c0-14 7-22 17-22s17 8 17 22z"/></g>`;

// Pictogramas em uma caixa de 150×80, em tons claros sobre o cartão escuro.
const ICONS = {
  people: () => person(35, 72) + person(75, 72, 1.15) + person(115, 72),
  solo: () => person(75, 74, 1.3),
  bots: () =>
    `<g fill="${CREAM}"><rect x="40" y="22" width="70" height="48" rx="12"/><rect x="72" y="8" width="6" height="16"/><circle cx="75" cy="7" r="6"/><rect x="28" y="38" width="10" height="18" rx="4"/><rect x="112" y="38" width="10" height="18" rx="4"/></g><g fill="${DEEP}"><circle cx="58" cy="42" r="7"/><circle cx="92" cy="42" r="7"/><rect x="60" y="56" width="30" height="5" rx="2.5"/></g>`,
};

function seats(count) {
  const step = 150 / count;
  return Array.from({ length: count }, (_, i) =>
    person(step * i + step / 2, 72, count > 3 ? 0.9 : 1.05)
  ).join('');
}

function grid(size, { hunt = false } = {}) {
  const side = 78;
  const cell = side / size;
  const lines = Array.from({ length: size - 1 }, (_, i) => {
    const o = cell * (i + 1);
    return `M${o} 0v${side}M0 ${o}h${side}`;
  }).join('');
  const mark = hunt
    ? `<rect x="3" y="${cell * Math.floor(size / 2) + 3}" width="${side - 6}" height="${cell - 6}" rx="${(cell - 6) / 2}" fill="none" stroke="#d9453b" stroke-width="4"/>`
    : '';
  return `<g transform="translate(36 1)"><rect width="${side}" height="${side}" rx="6" fill="${CREAM}"/><path d="${lines}" stroke="#c9ccbd" stroke-width="1.5" fill="none"/>${mark}</g>`;
}

const dice = () =>
  `<g transform="translate(40 4)"><rect width="70" height="70" rx="14" fill="${CREAM}"/><g fill="${INK}"><circle cx="20" cy="20" r="6"/><circle cx="50" cy="20" r="6"/><circle cx="35" cy="35" r="6"/><circle cx="20" cy="50" r="6"/><circle cx="50" cy="50" r="6"/></g></g>`;

function icon(name) {
  if (ICONS[name]) return ICONS[name]();
  const [kind, value] = name.split(':');
  if (kind === 'seats') return seats(Number(value));
  if (kind === 'grid') return grid(Number(value));
  if (kind === 'hunt') return grid(Number(value), { hunt: true });
  return '';
}

/** Menus simples: de 2 a 4 opções grandes, numeradas, com pictograma. */
export const MENUS = {
  'modo-grupo': {
    title: 'Como você quer jogar?',
    options: [
      {
        label: 'Em grupo',
        detail: 'Convide familiares e amigos',
        icon: 'people',
      },
      { label: 'Sozinho(a)', detail: 'Só você, no seu ritmo', icon: 'solo' },
    ],
  },
  'modo-mesa': {
    title: 'Como você quer jogar?',
    options: [
      {
        label: 'Com amigos',
        detail: 'Bots entram se faltar gente',
        icon: 'people',
      },
      {
        label: 'Contra bots',
        detail: 'Comece agora, sem esperar',
        icon: 'bots',
      },
    ],
  },
  lugares: {
    title: 'Quantos jogadores?',
    options: [
      { label: '2 jogadores', detail: 'Mesa pequena', icon: 'seats:2' },
      { label: '3 jogadores', detail: 'Mesa média', icon: 'seats:3' },
      { label: '4 jogadores', detail: 'Mesa cheia', icon: 'seats:4' },
    ],
  },
  'nivel-quebra-cabeca': {
    title: 'Qual a dificuldade?',
    options: [
      { label: 'Fácil', detail: '9 peças (3×3)', icon: 'grid:3' },
      { label: 'Média', detail: '16 peças (4×4)', icon: 'grid:4' },
      { label: 'Difícil', detail: '25 peças (5×5)', icon: 'grid:5' },
    ],
  },
  'nivel-caca-palavras': {
    title: 'Qual a dificuldade?',
    options: [
      { label: 'Fácil', detail: '8×8, 6 palavras', icon: 'hunt:4' },
      { label: 'Média', detail: '12×12, 10 palavras', icon: 'hunt:6' },
      { label: 'Difícil', detail: '15×15, 14 palavras', icon: 'hunt:8' },
    ],
  },
};

const SUBTITLE = 'Responda com o número';
const ROW_HEIGHT = 124;
const GAP = 16;
const TOP = 132;

function header(title) {
  return `<rect width="${WIDTH}" height="__H__" fill="#f8f6f0"/><text x="360" y="64" text-anchor="middle" font-size="40" font-weight="800" fill="${DEEP}" font-family="Georgia,serif">${escapeXml(title)}</text><text x="360" y="104" text-anchor="middle" font-size="24" font-weight="600" fill="#58675e">${SUBTITLE}</text>`;
}

function frame(title, label, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-label="${escapeXml(label)}" font-family="${FONT}">${header(title).replace('__H__', height)}${body}</svg>`;
}

/** SVG de um menu simples. */
export function menuSvg(menu) {
  const rows = menu.options
    .map((option, index) => {
      const y = TOP + index * (ROW_HEIGHT + GAP);
      const fill = index % 2 === 0 ? GREEN : DEEP;
      const label = escapeXml(option.label);
      const detail = escapeXml(option.detail ?? '');
      return `<g transform="translate(24 ${y})"><rect width="672" height="${ROW_HEIGHT}" rx="20" fill="${fill}"/><text x="28" y="82" font-size="64" font-weight="800" fill="#fff">${index + 1}</text><text x="100" y="${detail ? 58 : 74}" font-size="34" font-weight="700" fill="#fff">${label}</text>${detail ? `<text x="100" y="94" font-size="24" font-weight="500" fill="#d6e5dc">${detail}</text>` : ''}<g transform="translate(498 22)">${icon(option.icon)}</g></g>`;
    })
    .join('');
  const height = TOP + menu.options.length * (ROW_HEIGHT + GAP) + 8;
  const label = `${menu.title} ${menu.options.map((o, i) => `${i + 1} ${o.label}`).join(', ')}`;
  return frame(menu.title, label, height, rows);
}

/** Quebra-cabeça: imagens embutidas de cada dificuldade, na ordem do catálogo. */
export function puzzleCatalog() {
  return JSON.parse(readFileSync(join(IMAGES_DIR, 'catalog.json'), 'utf8'));
}
export const embeddedImageIds = (level) =>
  puzzleCatalog()
    .filter((entry) => entry.difficulty === level)
    .map((entry) => entry.id);

const TITLE_WRAP = 17;
function wrapTitle(title) {
  const words = title.split(' ');
  const lines = [''];
  for (const word of words) {
    const last = lines.length - 1;
    if (lines[last] && `${lines[last]} ${word}`.length > TITLE_WRAP)
      lines.push(word);
    else lines[last] = lines[last] ? `${lines[last]} ${word}` : word;
  }
  return lines.slice(0, 2);
}

/**
 * Folha de escolha de imagem: o 1 sorteia e os demais são as miniaturas.
 * `thumbnails` é { id: 'data:image/svg+xml;base64,...' }.
 */
export function imageSheetSvg(level, thumbnails) {
  const entries = puzzleCatalog().filter((entry) => entry.difficulty === level);
  const cardW = 208;
  const cardH = 186;
  const thumbH = 124;
  const cards = [{ title: 'Sortear uma imagem', draw: true }, ...entries];
  const body = cards
    .map((card, index) => {
      const x = 24 + (index % 3) * (cardW + 24);
      const y = TOP + Math.floor(index / 3) * (cardH + GAP);
      const lines = wrapTitle(card.title);
      const art = card.draw
        ? `<rect width="${cardW}" height="${thumbH}" rx="14" fill="${GREEN}"/><g transform="translate(36 27) scale(.9)">${dice()}</g>`
        : `<clipPath id="t${index}"><rect width="${cardW}" height="${thumbH}" rx="14"/></clipPath><g clip-path="url(#t${index})"><rect width="${cardW}" height="${thumbH}" fill="#e6e3d6"/><image href="${thumbnails[card.id]}" x="${(cardW - thumbH) / 2}" width="${thumbH}" height="${thumbH}"/></g>`;
      return `<g transform="translate(${x} ${y})"><rect width="${cardW}" height="${cardH}" rx="16" fill="${CREAM}" stroke="#c9ccbd" stroke-width="2"/><g transform="translate(0 0)">${art}</g><circle cx="30" cy="30" r="22" fill="${DEEP}" stroke="${CREAM}" stroke-width="3"/><text x="30" y="40" text-anchor="middle" font-size="28" font-weight="800" fill="#fff">${index + 1}</text>${lines.map((line, i) => `<text x="${cardW / 2}" y="${thumbH + 26 + i * 24}" text-anchor="middle" font-size="21" font-weight="700" fill="${INK}">${escapeXml(line)}</text>`).join('')}</g>`;
    })
    .join('');
  const rows = Math.ceil(cards.length / 3);
  const height = TOP + rows * (cardH + GAP) + 8;
  return frame(
    'Escolha a imagem',
    `Escolha a imagem: 1 sortear, ${entries.map((e, i) => `${i + 2} ${e.title}`).join(', ')}`,
    height,
    body
  );
}

/** Todas as imagens geradas por este módulo: nome do arquivo (sem extensão) e SVG. */
export function allMenus(thumbnailFor) {
  const files = Object.entries(MENUS).map(([name, menu]) => ({
    name,
    svg: menuSvg(menu),
  }));
  for (const level of ['easy', 'medium', 'hard']) {
    const thumbnails = Object.fromEntries(
      embeddedImageIds(level).map((id) => [id, thumbnailFor(id)])
    );
    files.push({
      name: `imagens-${level}`,
      svg: imageSheetSvg(level, thumbnails),
    });
  }
  return files;
}
