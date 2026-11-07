import { test, expect } from './fixtures.mjs';

async function identify(page, name = 'Helena') {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill(name);
  await page.getByRole('button', { name: 'Vamos jogar', exact: false }).click();
  await expect(
    page.getByRole('heading', { name: new RegExp(`Olá, ${name}`) })
  ).toBeVisible();
}

// Procura a palavra na grade (nas 8 direções) para o teste clicar nas letras.
function locate(grid, word) {
  const size = grid.length;
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++)
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [-1, 1],
        [0, -1],
        [-1, 0],
        [-1, -1],
        [1, -1],
      ]) {
        let ok = true;
        for (let i = 0; i < word.length && ok; i++) {
          const r = row + dr * i;
          const c = col + dc * i;
          ok = grid[r]?.[c] === word[i];
        }
        if (ok)
          return {
            start: { row, col },
            end: {
              row: row + dr * (word.length - 1),
              col: col + dc * (word.length - 1),
            },
          };
      }
  throw new Error(`Palavra ${word} não encontrada`);
}

// Espera a jogada anterior terminar de atualizar a tela.
const settle = (page) =>
  expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');

const cell = (page, { row, col }) =>
  page.locator(`[data-cell][data-row="${row}"][data-col="${col}"]`);

test('Cacheta contra o bot: comprar, descartar e a vez volta a você', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await identify(page);
  const form = page.locator('[data-create-game="cacheta"]');
  await form.getByLabel('Modo de jogo').selectOption('bot');
  await form.getByLabel('Participantes no total').selectOption('2');
  await form.getByRole('button', { name: /Jogar Cacheta/ }).click();
  await expect(page.locator('.card-button')).toHaveCount(9);
  await expect(
    page.getByRole('button', { name: /Comprar do monte/ })
  ).toBeEnabled();
  await page.getByRole('button', { name: /Comprar do monte/ }).click();
  await expect(page.locator('.card-button')).toHaveCount(10);
  await expect(
    page.getByText('Agora descarte uma carta ou bata.')
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Comprar do monte/ })
  ).toBeDisabled();
  await page.locator('.card-button:not([disabled])').first().click();
  await expect(page.locator('.card-button')).toHaveCount(9);
  await expect(page.getByText('É a sua vez: compre uma carta.')).toBeVisible();
  // As cartas do bot não aparecem na página.
  await expect(page.getByText(/Bot 1: 9 carta/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Cacheta: ajuda explica as regras', async ({ page }) => {
  await identify(page);
  const form = page.locator('[data-create-game="cacheta"]');
  await form.getByLabel('Modo de jogo').selectOption('bot');
  await form.getByRole('button', { name: /Jogar Cacheta/ }).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.locator('#game-help').click();
  await expect(page.getByText(/9 cartas/).first()).toBeVisible();
});

test('caça-palavras: toque, arrasto, teclado e palavra digitada até concluir', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await identify(page);
  await page
    .locator('[data-create-game="wordsearch"] button[type="submit"]')
    .click();
  await expect(page.locator('.ws-grid.ws-8')).toBeVisible();
  await expect(page.locator('[data-cell]')).toHaveCount(64);
  const state = await (
    await page.request.get(`/api/rooms/${page.url().split('/').at(-1)}`)
  ).json();
  const words = state.game.words;
  expect(words).toHaveLength(6);
  expect(words.every((word) => word.start === null)).toBe(true);
  const spots = words.map((word) => locate(state.game.grid, word.text));
  const list = page.locator('.ws-words li.done');

  // 1) toque na primeira e na última letra
  await cell(page, spots[0].start).click();
  await expect(cell(page, spots[0].start)).toHaveClass(/start/);
  await cell(page, spots[0].end).click();
  await expect(list).toHaveCount(1);

  // 2) arrastar sobre a palavra
  await settle(page);
  await cell(page, spots[1].start).hover();
  await page.mouse.down();
  await cell(page, spots[1].end).hover();
  await page.mouse.up();
  await expect(list).toHaveCount(2);

  // 3) teclado: Enter na primeira e na última letra
  await settle(page);
  await cell(page, spots[2].start).focus();
  await page.keyboard.press('Enter');
  await cell(page, spots[2].end).focus();
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(3);

  // um trecho errado não marca nada
  await settle(page);
  const wrongA = { row: 0, col: 0 };
  const wrongB = { row: 0, col: 1 };
  await cell(page, wrongA).click();
  await cell(page, wrongB).click();
  await expect(list).toHaveCount(3);

  // 4) palavras digitadas
  await settle(page);
  for (const [i, word] of words.slice(3).entries()) {
    await page
      .getByLabel('Ou digite uma palavra')
      .fill(word.text.toLowerCase());
    await page.getByRole('button', { name: 'Marcar palavra' }).click();
    await expect(list).toHaveCount(4 + i);
    await settle(page);
  }
  await expect(page.locator('#rematch')).toBeVisible();
  await expect(
    page.getByText('Desafio concluído. Vocês conseguiram!').first()
  ).toBeVisible();
  await expect(page.locator('#harder')).toContainText('Aumentar dificuldade');
  expect(errors).toEqual([]);
});

test('caça-palavras difícil usa grade 15×15 e a solução não chega ao navegador', async ({
  page,
}) => {
  await identify(page);
  const form = page.locator('[data-create-game="wordsearch"]');
  await form.getByLabel('Dificuldade do caça-palavras').selectOption('hard');
  await form.getByRole('button', { name: /Jogar Caça-palavras/ }).click();
  await expect(page.locator('.ws-grid.ws-15')).toBeVisible();
  await expect(page.locator('[data-cell]')).toHaveCount(225);
  const state = await (
    await page.request.get(`/api/rooms/${page.url().split('/').at(-1)}`)
  ).json();
  expect(state.game.words).toHaveLength(14);
  expect(JSON.stringify(state)).not.toContain('placements');
});
