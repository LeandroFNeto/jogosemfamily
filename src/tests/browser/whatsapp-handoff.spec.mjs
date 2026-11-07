import { test, expect } from '@playwright/test';
import { once } from 'node:events';
import { startBot, register } from '../helpers.mjs';

const ANA = '5511911111111';
const LINK = /http:\/\/web\.test(\/m\/[\w-]{43})/;

async function withBot(use) {
  const bot = startBot();
  bot.app.server.listen(0, '127.0.0.1');
  await once(bot.app.server, 'listening');
  try {
    await use(bot, `http://127.0.0.1:${bot.app.server.address().port}`);
  } finally {
    await bot.app.stop();
  }
}

test('WhatsApp cria a partida contra bots e o link abre a mesa na web', async ({
  page,
}) => {
  await withBot(async (bot, origin) => {
    await register(bot, ANA, 'Ana');
    await bot.say(ANA, '1'); // Dominó
    await bot.say(ANA, '2'); // contra bots
    const started = (await bot.say(ANA, '3')).join('\n'); // difícil
    const path = LINK.exec(started)[1];
    expect(started).not.toMatch(/Suas peças/);

    await page.goto(`${origin}${path}`);
    await page.getByRole('button', { name: 'Abrir minha partida' }).click();
    await expect(page).toHaveURL(/\/mesa\/[\w-]+$/);
    await expect(page.locator('.hand .tile-button').first()).toBeVisible();

    // O mesmo link continua ativo; um link inventado não vale.
    await page.goto(`${origin}${path}`);
    await expect(
      page.getByRole('button', { name: 'Abrir minha partida' })
    ).toBeVisible();
    await page.goto(`${origin}/m/${'a'.repeat(43)}`);
    await expect(page.getByText('não vale mais')).toBeVisible();
  });
});

test('mesa com amigos aberta pelo link mostra quantos lugares faltam', async ({
  page,
}) => {
  await withBot(async (bot, origin) => {
    await register(bot, ANA, 'Ana');
    await bot.say(ANA, '1');
    await bot.say(ANA, '1');
    const created = (await bot.say(ANA, '1')).join('\n');
    const path = LINK.exec(created)[1];
    await page.goto(`${origin}${path}`);
    await page.getByRole('button', { name: 'Abrir minha partida' }).click();
    await expect(page.locator('#missing-seats')).toContainText('Falta 1 lugar');
  });
});
