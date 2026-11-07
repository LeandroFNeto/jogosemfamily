import { test as base, expect } from '@playwright/test';
import { once } from 'node:events';
import { createApplication } from '../../backend/server.mjs';

// Com pausa dos bots, como em produção: o pedido fica pendente na tela.
const test = base.extend({
  baseURL: async ({}, use) => {
    const app = createApplication({
      databasePath: ':memory:',
      publicOrigin: '',
      botDelayMs: 1200,
    });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    try {
      await use(`http://127.0.0.1:${app.server.address().port}`);
    } finally {
      await app.stop();
    }
  },
});

test('pedir truco mostra o letreiro grande e o bot fica em dúvida', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByLabel('Seu nome').fill('Helena');
  await page.getByRole('button', { name: 'Vamos jogar', exact: false }).click();
  await expect(
    page.getByRole('heading', { name: /Olá, Helena/ })
  ).toBeVisible();
  await page
    .locator('[data-create-game="cards"] select[name="mode"]')
    .selectOption('bot');
  await page
    .locator('[data-create-game="cards"] button[type="submit"]')
    .click();
  await page.waitForURL(/\/mesa\//);
  await expect(page.locator('.truco-call')).toBeVisible({ timeout: 30000 });
  await page.locator('.truco-call').click();
  await expect(page.locator('.call-sign')).toContainText('TRUCO!');
  await expect(page.locator('.truco-seat .doubt').first()).toBeVisible({
    timeout: 6000,
  });
});
