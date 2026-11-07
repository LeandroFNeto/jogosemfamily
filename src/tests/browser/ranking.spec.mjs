import { test, expect } from './fixtures.mjs';

test('tela de ranking abre, filtra por jogo e não mostra telefones', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Lia');
  await page.getByRole('button', { name: 'Vamos jogar' }).click();
  await page.getByRole('button', { name: 'Ver ranking' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Ranking da família')).toBeVisible();
  await expect(
    dialog.getByText('Ainda não há partidas terminadas')
  ).toBeVisible();
  await dialog.getByLabel('Jogo').selectOption({ index: 1 });
  await expect(
    dialog.getByText('Ainda não há partidas terminadas')
  ).toBeVisible();
  expect(await dialog.innerText()).not.toMatch(/\d{10,}/);
});
