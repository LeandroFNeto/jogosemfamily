// Gera as imagens do bot no WhatsApp (PNG): o menu de jogos (SVG desenhado à
// mão) e as imagens de decisão (modo, lugares, dificuldade, escolha de imagem),
// montadas por src/whatsapp/menu-art.mjs.
// Uso: node scripts/build-menu-image.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { allMenus } from '../src/whatsapp/menu-art.mjs';

const dir = new URL('../src/whatsapp/assets/', import.meta.url);
const imagesDir = new URL('../src/games/puzzle/images/', import.meta.url);

const thumbs = new Map();
for (const { file, id } of JSON.parse(
  await readFile(new URL('catalog.json', imagesDir), 'utf8')
))
  thumbs.set(
    id,
    `data:image/svg+xml;base64,${(await readFile(new URL(file, imagesDir))).toString('base64')}`
  );

const files = [
  {
    name: 'menu-jogos',
    svg: await readFile(new URL('menu-jogos.svg', dir), 'utf8'),
  },
  ...allMenus((id) => thumbs.get(id)),
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const { name, svg } of files) {
  const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const page = await browser.newPage({
    viewport: { width: Number(width), height: Number(height) },
    deviceScaleFactor: 2,
  });
  await page.setContent(
    `<body style="margin:0;background:#f8f6f0">${svg}</body>`
  );
  await writeFile(
    new URL(`${name}.png`, dir),
    await page.screenshot({
      clip: { x: 0, y: 0, width: Number(width), height: Number(height) },
    })
  );
  await page.close();
  console.log(`${name}.png gerado.`);
}
await browser.close();
