// Gera as 12 imagens originais do catálogo do quebra-cabeça (obra própria,
// CC0). Rodar com `node scripts/build-images.mjs` recria os arquivos e o
// catálogo em src/games/puzzle/images/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededRng } from '../src/games/core/rng.mjs';

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/games/puzzle/images'
);
mkdirSync(out, { recursive: true });

const svg = (body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const gradient = (id, a, b, vertical = true) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const hsl = (h, s = 70, l = 55) => `hsl(${Math.round(h) % 360} ${s}% ${l}%)`;

const images = [];
const add = (id, title, category, difficulty, file, content) => {
  writeFileSync(join(out, file), content);
  images.push({
    id,
    title,
    category,
    difficulty,
    file,
    license: 'CC0 1.0',
    attribution: 'Mesa em Família (obra original)',
  });
};

// ---- fáceis: poucas formas grandes e cores bem diferentes
add(
  'por-do-sol',
  'Pôr do sol na colina',
  'paisagem',
  'easy',
  'por-do-sol.svg',
  svg(
    `<rect width="600" height="600" fill="url(#sky)"/><circle cx="420" cy="250" r="90" fill="#ffd54f"/>
     <path d="M0 400 Q150 300 300 400 T600 380 V600 H0Z" fill="#43a047"/>
     <path d="M0 470 Q200 380 360 470 T600 460 V600 H0Z" fill="#2e7d32"/>
     <circle cx="110" cy="130" r="14" fill="#fff8e1"/><circle cx="180" cy="80" r="9" fill="#fff8e1"/>`,
    gradient('sky', '#5c6bc0', '#ff8a65')
  )
);
add(
  'casa-no-campo',
  'Casa no campo',
  'paisagem',
  'easy',
  'casa-no-campo.svg',
  svg(
    `<rect width="600" height="600" fill="#81d4fa"/><rect y="400" width="600" height="200" fill="#7cb342"/>
     <rect x="170" y="270" width="260" height="200" fill="#ffcc80"/><path d="M150 280 L300 160 L450 280Z" fill="#c62828"/>
     <rect x="270" y="360" width="60" height="110" fill="#6d4c41"/><rect x="195" y="310" width="50" height="50" fill="#4fc3f7"/>
     <rect x="355" y="310" width="50" height="50" fill="#4fc3f7"/><circle cx="520" cy="90" r="50" fill="#fdd835"/>
     <rect x="500" y="370" width="24" height="100" fill="#5d4037"/><circle cx="512" cy="340" r="60" fill="#2e7d32"/>`
  )
);
add(
  'barco-no-mar',
  'Barco no mar',
  'mar',
  'easy',
  'barco-no-mar.svg',
  svg(
    `<rect width="600" height="600" fill="#b3e5fc"/><rect y="330" width="600" height="270" fill="#0288d1"/>
     <path d="M130 380 H470 L420 450 H180Z" fill="#d84315"/><rect x="295" y="170" width="10" height="210" fill="#4e342e"/>
     <path d="M305 180 L430 330 H305Z" fill="#fff"/><path d="M295 210 L190 330 H295Z" fill="#ffee58"/>
     <path d="M0 500 Q75 470 150 500 T300 500 T450 500 T600 500 V600 H0Z" fill="#01579b"/><circle cx="90" cy="90" r="45" fill="#fff59d"/>`
  )
);
add(
  'jardim-de-flores',
  'Jardim de flores',
  'natureza',
  'easy',
  'jardim-de-flores.svg',
  svg(
    [
      '<rect width="600" height="600" fill="#e8f5e9"/>',
      ...[
        [150, 170, '#e53935'],
        [430, 150, '#8e24aa'],
        [300, 330, '#fb8c00'],
        [130, 470, '#1e88e5'],
        [470, 450, '#d81b60'],
      ].map(
        ([x, y, color]) =>
          `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((angle) => `<ellipse cx="0" cy="-42" rx="26" ry="44" fill="${color}" transform="rotate(${angle})"/>`).join('')}<circle r="22" fill="#fdd835"/></g>`
      ),
    ].join('')
  )
);

// ---- médias: mais elementos e detalhes
{
  const rng = seededRng(11);
  const towers = Array.from({ length: 9 }, (_, i) => {
    const width = 58;
    const height = 150 + rng.int(240);
    const x = i * 66 + 4;
    const windows = [];
    for (let wy = 600 - height + 14; wy < 580; wy += 28)
      for (let wx = x + 8; wx < x + width - 14; wx += 20)
        if (rng.int(3))
          windows.push(
            `<rect x="${wx}" y="${wy}" width="10" height="14" fill="#ffee58"/>`
          );
    return `<rect x="${x}" y="${600 - height}" width="${width}" height="${height}" fill="${hsl(220 + rng.int(40), 30, 22 + rng.int(8))}"/>${windows.join('')}`;
  });
  add(
    'cidade-a-noite',
    'Cidade à noite',
    'cidade',
    'medium',
    'cidade-a-noite.svg',
    svg(
      `<rect width="600" height="600" fill="url(#night)"/><circle cx="500" cy="100" r="42" fill="#fff9c4"/>${towers.join('')}`,
      gradient('night', '#0d1b4c', '#5c4a8a')
    )
  );
}
{
  const rng = seededRng(23);
  const trees = [];
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 6; i++) {
      const x = 50 + i * 100 + (row % 2) * 40 + rng.int(14);
      const y = 170 + row * 110;
      trees.push(
        `<rect x="${x - 6}" y="${y + 40}" width="12" height="30" fill="#5d4037"/><path d="M${x} ${y - 40} L${x + 36} ${y + 20} H${x - 36}Z" fill="${hsl(120 + rng.int(30), 55, 24 + row * 5)}"/><path d="M${x} ${y - 10} L${x + 44} ${y + 50} H${x - 44}Z" fill="${hsl(125 + rng.int(25), 55, 28 + row * 5)}"/>`
      );
    }
  add(
    'floresta-de-pinheiros',
    'Floresta de pinheiros',
    'natureza',
    'medium',
    'floresta-de-pinheiros.svg',
    svg(
      `<rect width="600" height="600" fill="url(#mist)"/><circle cx="470" cy="90" r="38" fill="#fff"/>${trees.join('')}`,
      gradient('mist', '#b2dfdb', '#e0f2f1')
    )
  );
}
{
  const rng = seededRng(37);
  const fishes = Array.from({ length: 10 }, () => {
    const x = 60 + rng.int(420);
    const y = 50 + rng.int(500);
    const color = hsl(rng.int(360), 80, 55);
    const scale = 0.7 + rng.next();
    return `<g transform="translate(${x} ${y}) scale(${scale.toFixed(2)})"><ellipse rx="52" ry="28" fill="${color}"/><path d="M48 0 L84 -26 V26Z" fill="${color}"/><circle cx="-26" cy="-6" r="6" fill="#fff"/><circle cx="-26" cy="-6" r="3" fill="#212121"/></g>`;
  });
  add(
    'peixes-coloridos',
    'Peixes coloridos',
    'mar',
    'medium',
    'peixes-coloridos.svg',
    svg(
      `<rect width="600" height="600" fill="url(#deep)"/>${fishes.join('')}<path d="M0 560 Q60 500 120 560 T240 560 T360 560 T480 560 T600 560 V600 H0Z" fill="#2e7d32"/>`,
      gradient('deep', '#4dd0e1', '#01579b')
    )
  );
}
{
  const rng = seededRng(41);
  const balloons = Array.from({ length: 7 }, (_, i) => {
    const x = 70 + (i % 4) * 140 + rng.int(30);
    const y = 90 + Math.floor(i / 4) * 230 + rng.int(40);
    const a = hsl(rng.int(360), 75, 55);
    const b = hsl(rng.int(360), 75, 60);
    return `<g transform="translate(${x} ${y})"><ellipse rx="52" ry="64" fill="${a}"/><path d="M-26 -58 Q0 20 -8 62 H8 Q0 20 26 -58Z" fill="${b}"/><path d="M-24 60 L-14 100 M24 60 L14 100" stroke="#5d4037" stroke-width="3"/><rect x="-18" y="100" width="36" height="24" fill="#8d6e63"/></g>`;
  });
  add(
    'baloes-no-ceu',
    'Balões no céu',
    'céu',
    'medium',
    'baloes-no-ceu.svg',
    svg(
      `<rect width="600" height="600" fill="url(#air)"/><ellipse cx="120" cy="520" rx="110" ry="26" fill="#fff" opacity=".8"/><ellipse cx="460" cy="540" rx="140" ry="30" fill="#fff" opacity=".8"/>${balloons.join('')}`,
      gradient('air', '#64b5f6', '#e3f2fd')
    )
  );
}

// ---- difíceis: padrões densos, parecidos entre si
{
  const petals = [];
  for (let ring = 6; ring >= 1; ring--)
    for (let i = 0; i < 6 + ring * 2; i++) {
      const count = 6 + ring * 2;
      petals.push(
        `<ellipse cx="300" cy="${300 - ring * 40}" rx="${12 + ring * 3}" ry="${28 + ring * 4}" fill="${hsl(ring * 55 + i * 4, 75, 45 + ring * 3)}" transform="rotate(${(360 / count) * i} 300 300)" opacity=".92"/>`
      );
    }
  add(
    'mandala',
    'Mandala de pétalas',
    'padrão',
    'hard',
    'mandala.svg',
    svg(
      `<rect width="600" height="600" fill="#1a1033"/>${petals.join('')}<circle cx="300" cy="300" r="20" fill="#fff59d"/>`
    )
  );
}
{
  const rng = seededRng(53);
  const tiles = [];
  for (let row = 0; row < 10; row++)
    for (let col = 0; col < 10; col++) {
      const x = col * 60;
      const y = row * 60;
      const hue = rng.int(360);
      tiles.push(
        `<rect x="${x}" y="${y}" width="60" height="60" fill="${hsl(hue, 55, 38)}"/><circle cx="${x + 30}" cy="${y + 30}" r="${14 + rng.int(10)}" fill="${hsl(hue + 40, 70, 62)}"/><path d="M${x} ${y} L${x + 18} ${y} L${x} ${y + 18}Z" fill="${hsl(hue + 180, 60, 70)}"/>`
      );
    }
  add(
    'mosaico-de-azulejos',
    'Mosaico de azulejos',
    'padrão',
    'hard',
    'mosaico-de-azulejos.svg',
    svg(tiles.join(''))
  );
}
{
  const rng = seededRng(61);
  const triangles = [];
  for (let row = 0; row < 12; row++)
    for (let col = 0; col < 12; col++) {
      const x = col * 50;
      const y = row * 50;
      const hue = (row * 18 + col * 11 + rng.int(25)) % 360;
      triangles.push(
        `<path d="M${x} ${y} H${x + 50} L${x} ${y + 50}Z" fill="${hsl(hue, 65, 45)}"/><path d="M${x + 50} ${y} V${y + 50} H${x}Z" fill="${hsl(hue + 25, 65, 60)}"/>`
      );
    }
  add(
    'triangulos',
    'Triângulos em degradê',
    'padrão',
    'hard',
    'triangulos.svg',
    svg(triangles.join(''))
  );
}
{
  const rng = seededRng(73);
  const stars = Array.from({ length: 70 }, () => ({
    x: 20 + rng.int(560),
    y: 20 + rng.int(560),
    r: 1.5 + rng.next() * 4,
  }));
  const lines = stars
    .slice(0, 28)
    .map((star, i) => {
      const next = stars[(i * 7 + 3) % stars.length];
      return `<line x1="${star.x}" y1="${star.y}" x2="${next.x}" y2="${next.y}" stroke="#90caf9" stroke-opacity=".35" stroke-width="1.5"/>`;
    })
    .join('');
  add(
    'constelacoes',
    'Constelações',
    'céu',
    'hard',
    'constelacoes.svg',
    svg(
      `<rect width="600" height="600" fill="url(#space)"/>${lines}${stars.map((star) => `<circle cx="${star.x}" cy="${star.y}" r="${star.r.toFixed(1)}" fill="#fffde7"/>`).join('')}`,
      gradient('space', '#050816', '#2a1b5c')
    )
  );
}

writeFileSync(
  join(out, 'catalog.json'),
  `${JSON.stringify(images, null, 2)}\n`
);
console.log(`${images.length} imagens criadas em ${out}`);
