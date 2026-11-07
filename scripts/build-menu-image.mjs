// Gera a imagem do menu do WhatsApp (PNG) a partir do SVG compacto.
// Uso: node scripts/build-menu-image.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const dir = new URL('../src/whatsapp/assets/', import.meta.url);
const svg = await readFile(new URL('menu-jogos.svg', dir), 'utf8');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 720, height: 560 },
  deviceScaleFactor: 2,
});
await page.setContent(
  `<body style="margin:0;background:#f8f6f0">${svg}</body>`
);
await writeFile(
  new URL('menu-jogos.png', dir),
  await page.screenshot({ clip: { x: 0, y: 0, width: 720, height: 560 } })
);
await browser.close();
console.log('menu-jogos.png gerado.');
