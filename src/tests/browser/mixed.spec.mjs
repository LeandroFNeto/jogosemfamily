import { test, expect } from './fixtures.mjs';

test('Truco 2 contra 2: o dono começa já e bots completam os lugares, marcados como bot', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Lia');
  await page.getByRole('button', { name: 'Vamos jogar' }).click();
  const form = page.locator('[data-create-game="cards"]');
  await expect(form.getByLabel('Participantes no total')).toHaveCount(0);
  await expect(form.getByLabel('Dificuldade dos bots')).toHaveCount(0);
  await expect(form.getByText(/2 contra 2/)).toBeVisible();
  await form.getByRole('button', { name: /Jogar Truco/ }).click();
  await expect(
    page.getByText('1 de 4 participantes confirmados')
  ).toBeVisible();
  await page.getByRole('button', { name: /Começar já, com bots/ }).click();
  await expect(page.locator('.player-card')).toHaveCount(4);
  await expect(page.locator('.player-card .bot-tag')).toHaveCount(3);
});

test('modo contra bots começa a partida na hora', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Lia');
  await page.getByRole('button', { name: 'Vamos jogar' }).click();
  const form = page.locator('[data-create-game="cards"]');
  await form.getByLabel('Modo de jogo').selectOption('bot');
  await form.getByRole('button', { name: /Jogar Truco/ }).click();
  await expect(page.locator('.playing-card').first()).toBeVisible();
});

test('palavras cruzadas, quebra-cabeça e caça-palavras não oferecem bot', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Lia');
  await page.getByRole('button', { name: 'Vamos jogar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Lia/ })).toBeVisible();
  for (const game of ['crossword', 'puzzle', 'wordsearch']) {
    const options = await page
      .locator(`[data-create-game="${game}"] [name="mode"] option`)
      .allTextContents();
    expect(options.join('|')).not.toMatch(/bot/i);
    expect(options).toHaveLength(2);
  }
});
