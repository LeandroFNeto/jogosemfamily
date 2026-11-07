import { test, expect } from './fixtures.mjs';

async function open(page, query = '') {
  const violations = [];
  page.on('console', (message) => {
    if (/Content Security Policy|violates/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto(`/arte${query}`);
  await expect(page.locator('#gallery-cards .playing-card')).toHaveCount(53);
  return violations;
}

test('galeria mostra o baralho e as 28 peças sem violar a CSP', async ({
  page,
}) => {
  const violations = await open(page);
  await expect(page.locator('#gallery-tiles .tile')).toHaveCount(28);
  await expect(page.getByRole('img', { name: 'Sete de copas' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: '7 de copas' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Peça quatro e seis' })
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Carta virada' })).toBeVisible();
  // Todos os símbolos do sprite resolveram: cada carta desenha ao menos uma forma.
  const empty = await page.$$eval(
    '#gallery-cards .art-card',
    (cards) =>
      cards.filter((svg) => svg.getBoundingClientRect().width < 10).length
  );
  expect(empty).toBe(0);
  expect(violations).toEqual([]);
});

test('cartas e peças crescem com o tamanho da letra e reforçam o contraste', async ({
  page,
}) => {
  await open(page);
  const width = async () =>
    (await page.locator('#gallery-cards .playing-card').first().boundingBox())
      .width;
  const normal = await width();
  await open(page, '?font=large');
  const large = await width();
  await open(page, '?font=extra');
  const extra = await width();
  expect(large).toBeGreaterThan(normal);
  expect(extra).toBeGreaterThan(large);

  await open(page, '?contrast=1');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'true');
  const stroke = await page
    .locator('#gallery-cards .art-face')
    .first()
    .evaluate((node) => getComputedStyle(node).strokeWidth);
  expect(parseFloat(stroke)).toBeGreaterThanOrEqual(3);
});

test('em tela de 360 px a página não rola na horizontal e o toque tem 44 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page
    .getByRole('button', { name: 'Carta jogável' })
    .boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const tile = await page
    .getByRole('button', { name: 'Peça jogável' })
    .boundingBox();
  expect(tile.width).toBeGreaterThanOrEqual(44);
});

test('manilha e pontas abertas têm marca além da cor', async ({ page }) => {
  await open(page);
  await expect(page.locator('.manilha-tag')).toHaveText('manilha');
  const outline = await page
    .locator('.board.can-play .open-end .tile')
    .first()
    .evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(outline).toBe('dashed');
});

test('movimento reduzido troca a animação por destaque estático', async ({
  page,
}) => {
  await open(page);
  const probe = () =>
    page.evaluate(() => {
      const node = document.querySelector('#gallery-cards .playing-card');
      node.classList.add('enter');
      const style = getComputedStyle(node);
      return { animation: style.animationName, outline: style.outlineStyle };
    });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect((await probe()).animation).toBe('art-enter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await probe();
  expect(reduced.animation).toBe('none');
  expect(reduced.outline).toBe('solid');
});

test('na partida, a mão de dominó usa as peças desenhadas e a jogada anima só o novo', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Rita');
  await page.getByRole('button', { name: 'Vamos jogar' }).click();
  const form = page.locator('[data-create-game="domino"]').first();
  await form.getByLabel('Modo de jogo').selectOption('bot');
  await form.getByRole('button', { name: /Jogar/ }).click();
  const hand = page.locator('.hand .tile-button');
  await expect(hand).toHaveCount(7);
  await expect(hand.first().locator('svg.art-tile')).toBeVisible();
  await expect(hand.first()).toHaveAttribute('aria-label', /^Peça \S+ e \S+\./);
  // Nada entra animado na primeira renderização.
  await expect(page.locator('.enter')).toHaveCount(0);

  // Ao jogar, a peça nova entra com a marca de animação; a antiga não.
  await page.evaluate(() => {
    window.__entered = 0;
    new MutationObserver(() => {
      window.__entered = Math.max(
        window.__entered,
        document.querySelectorAll('.board-tile.enter').length
      );
    }).observe(document.querySelector('#main'), {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
  const playable = page.locator('.tile-button.playable').first();
  await expect(playable).toBeVisible();
  await playable.click();
  const side = page.locator('[data-side]').first();
  if (await side.isVisible().catch(() => false)) await side.click();
  await expect
    .poll(() => page.evaluate(() => window.__entered))
    .toBeGreaterThan(0);
  await expect(page.locator('.board-tile').first()).toBeAttached();
});

test('no celular de 375×667 a mão do dominó já aparece e sair fica depois dela', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Rita');
  await page.getByRole('button', { name: 'Vamos jogar' }).click();
  const form = page.locator('[data-create-game="domino"]').first();
  await form.getByLabel('Modo de jogo').selectOption('bot');
  await form.getByRole('button', { name: /Jogar/ }).click();
  await expect(page.locator('.hand .tile-button')).toHaveCount(7);
  const layout = await page.evaluate(() => {
    const top = (selector) =>
      document.querySelector(selector).getBoundingClientRect().top + scrollY;
    return {
      hand: top('.hand-section'),
      leave: top('#leave-room'),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(layout.hand).toBeLessThan(667);
  expect(layout.leave).toBeGreaterThan(layout.hand);
  expect(layout.overflow).toBeLessThanOrEqual(0);
  const tile = await page.locator('.tile-button').first().boundingBox();
  expect(tile.width).toBeGreaterThanOrEqual(44);
  expect(tile.height).toBeGreaterThanOrEqual(44);
});

for (const game of [
  'domino',
  'cards',
  'cacheta',
  'crossword',
  'puzzle',
  'wordsearch',
]) {
  test(`celular 375 px: a mesa de ${game} não rola na horizontal nem sai da tela`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByLabel('Seu nome').fill('Rita');
    await page.getByRole('button', { name: 'Vamos jogar' }).click();
    const form = page.locator(`[data-create-game="${game}"]`).first();
    await form
      .getByLabel('Modo de jogo')
      .selectOption(
        ['crossword', 'puzzle', 'wordsearch'].includes(game) ? 'solo' : 'bot'
      );
    await form.getByRole('button', { name: /Jogar/ }).click();
    await expect(page.locator('.game-page')).toBeVisible();
    const outside = await page.evaluate(() => {
      const bad = [];
      for (const node of document.querySelectorAll('.game-page *')) {
        // Elementos dentro de um SVG são recortados pelo próprio viewBox.
        if (node.closest('svg') && node.tagName.toLowerCase() !== 'svg')
          continue;
        const box = node.getBoundingClientRect();
        if (box.width > 0 && (box.right > innerWidth + 1 || box.left < -1))
          bad.push(`${node.tagName}.${node.className}`);
      }
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        bad: bad.slice(0, 5),
      };
    });
    expect(outside.overflow).toBeLessThanOrEqual(0);
    expect(outside.bad).toEqual([]);
  });
}
