import { test, expect } from './fixtures.mjs';

test('quebra-cabeça difícil usa grade 5×5 e a imagem escolhida', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Lia');
  await page.getByRole('button', { name: 'Vamos jogar' }).click();
  const form = page.locator('[data-create-game="puzzle"]');
  await form.getByLabel('Dificuldade do quebra-cabeça').selectOption('hard');
  const image = form.locator('select[name="imageId"]');
  await expect(image.locator('option')).toHaveCount(5);
  const value = await image.locator('option').nth(1).getAttribute('value');
  await image.selectOption(value);
  await form.getByRole('button', { name: /Jogar/ }).click();
  await expect(page.locator('.puzzle-piece')).toHaveCount(25);
  await expect(page.locator('.puzzle-grid')).toHaveClass(/size-5/);
  await expect(page.locator('.puzzle-reference')).toHaveAttribute(
    'src',
    `/images/${value}`
  );
});
