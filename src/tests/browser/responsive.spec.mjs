import { mkdirSync } from 'node:fs';
import { test, expect } from './fixtures.mjs';

// Tamanhos reais: celular pequeno, celular, celular deitado, tablet, notebook, monitor largo.
const viewports = [
  { name: 'cel-320', width: 320, height: 640 },
  { name: 'cel-360', width: 360, height: 740 },
  { name: 'cel-412', width: 412, height: 915 },
  { name: 'cel-deitado', width: 740, height: 360 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'notebook', width: 1280, height: 720 },
  { name: 'monitor', width: 1920, height: 1080 },
];

const games = [
  { id: 'domino', mode: 'bot', table: '.board, .domino-table' },
  { id: 'cards', mode: 'bot', table: '.card-table, .truco-table' },
  { id: 'cacheta', mode: 'bot', table: '.card-table, .cacheta-table' },
  { id: 'crossword', mode: 'solo', table: '.crossword-grid' },
  { id: 'puzzle', mode: 'solo', table: '.puzzle-board, .puzzle-grid' },
  { id: 'wordsearch', mode: 'solo', table: '.wordsearch-grid, .word-grid' },
];

const outDir = process.env.RESPONSIVE_SHOTS;

async function overflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const limit = root.clientWidth;
    const culprits = [];
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width && box.right > limit + 1 && !el.closest('[hidden]')) {
        const style = getComputedStyle(el);
        if (style.position === 'fixed') continue;
        // Elementos com rolagem própria não contam como estouro da página.
        let parent = el.parentElement;
        let scrolls = false;
        while (parent && parent !== document.body) {
          const overflowX = getComputedStyle(parent).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') scrolls = true;
          parent = parent.parentElement;
        }
        if (!scrolls)
          culprits.push(
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`
          );
      }
    }
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: limit,
      culprits: [...new Set(culprits)].slice(0, 6),
    };
  });
}

async function shot(page, name) {
  if (!outDir) return;
  mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
}

for (const viewport of viewports) {
  test(`telas e mesas sem estouro lateral em ${viewport.name}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const problems = [];
    const check = async (label) => {
      const result = await overflow(page);
      if (result.scrollWidth > result.clientWidth || result.culprits.length)
        problems.push(`${label}: ${JSON.stringify(result)}`);
    };
    await page.goto('/');
    await shot(page, `${viewport.name}-boas-vindas`);
    await check('boas-vindas');
    await page.getByLabel('Seu nome').fill('Helena');
    await page
      .getByRole('button', { name: 'Vamos jogar', exact: false })
      .click();
    await expect(
      page.getByRole('heading', { name: /Olá, Helena/ })
    ).toBeVisible();
    await shot(page, `${viewport.name}-inicio`);
    await check('inicio');
    for (const game of games) {
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: /Olá, Helena/ })
      ).toBeVisible();
      const form = page.locator(`[data-create-game="${game.id}"]`);
      await form.locator('select[name="mode"]').selectOption(game.mode);
      await form.locator('button[type="submit"]').click();
      await page.waitForURL(/\/mesa\//);
      await page.waitForTimeout(900);
      await shot(page, `${viewport.name}-${game.id}`);
      await check(game.id);
      // A mesa precisa caber inteira na janela útil, sem rolar para o lado.
      const table = page.locator(game.table).first();
      if (await table.count()) {
        const box = await table.boundingBox();
        if (box && (box.x < -1 || box.x + box.width > viewport.width + 1))
          problems.push(
            `${game.id}: mesa fora da tela (${Math.round(box.x)}..${Math.round(box.x + box.width)})`
          );
      }
    }
    expect(problems).toEqual([]);
  });
}
