import { request } from '@playwright/test';
import { test, expect } from './fixtures.mjs';
import { crosswords } from '../../games/crossword/puzzles.mjs';

async function identify(page, name = 'Helena') {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill(name);
  await page.getByRole('button', { name: 'Vamos jogar', exact: false }).click();
  await expect(
    page.getByRole('heading', { name: new RegExp(`Olá, ${name}`) })
  ).toBeVisible();
}

test('palavras cruzadas individual conclui as seis pistas e reinicia pelo teclado', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await identify(page);
  await page
    .locator('[data-create-game="crossword"] button[type="submit"]')
    .click();
  await expect(page.locator('.crossword-grid')).toBeVisible();
  const state = await (
    await page.request.get(`/api/rooms/${page.url().split('/').at(-1)}`)
  ).json();
  const board = crosswords.find((board) => board.title === state.game.title);
  for (const [i, word] of board.words.entries()) {
    await page.locator('#word-choice').selectOption(word.id);
    await page.getByLabel('Sua resposta').fill(word.answer.toLowerCase());
    // Ao completar as letras a resposta é enviada sozinha.
    await expect(page.locator('.solved-words li')).toHaveCount(i + 1);
  }
  await expect(page.locator('#rematch')).toBeVisible();
  await page.locator('#rematch').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#answer-form')).toBeVisible();
  expect(errors).toEqual([]);
});

test('quebra-cabeça conclui com toque ou teclado e funciona com letra extra grande', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 800 });
  await identify(page);
  await page.getByRole('button', { name: /Acessibilidade/ }).click();
  await page.getByLabel('Tamanho da letra').selectOption('extra');
  await page.getByLabel('Alto contraste').check();
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await page
    .locator('[data-create-game="puzzle"] button[type="submit"]')
    .click();
  await expect(page.locator('.puzzle-piece')).toHaveCount(9);
  await page.getByLabel('Mostrar números de ajuda').check();
  await page.screenshot({
    path: testInfo.outputPath('quebra-cabeca-acessivel.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  for (let position = 0; position < 9; position++) {
    const labels = await page
      .locator('.puzzle-piece')
      .evaluateAll((buttons) =>
        buttons.map(
          (button) =>
            Number(button.getAttribute('aria-label').match(/Parte (\d+)/)[1]) -
            1
        )
      );
    if (labels[position] === position) continue;
    await page.locator(`#piece-${position}`).focus();
    await page.keyboard.press('Enter');
    await page.locator(`#piece-${labels.indexOf(position)}`).click();
    await expect(page.locator(`#piece-${position}`)).toHaveAttribute(
      'aria-label',
      new RegExp(`Parte ${position + 1} da imagem`)
    );
  }
  await expect(page.locator('#rematch')).toBeVisible();
  await page.locator('#rematch').click();
  await expect(page.locator('.puzzle-piece:enabled')).toHaveCount(9);
  expect(errors).toEqual([]);
});

for (const difficulty of ['medium']) {
  test(`os jogos de vários jogadores iniciam contra bot ${difficulty} e executam uma jogada`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await identify(page, 'Paulo');
    for (const gameId of ['domino', 'cards']) {
      if (gameId !== 'domino') await page.goto('/');
      const form = page.locator(`[data-create-game="${gameId}"]`);
      await form.locator('[name="mode"]').selectOption('bot');
      await form.locator('button[type="submit"]').click();
      await expect(page.locator('.connection')).toHaveText('● Mesa conectada');
      const id = page.url().split('/').at(-1);
      const before = await (await page.request.get(`/api/rooms/${id}`)).json();
      expect(before.mode).toBe('bot');
      expect(before.difficulty).toBe(difficulty);
      if (gameId === 'domino') {
        const available = page.locator('.tile-button.playable');
        if (await available.count()) {
          await available.first().click();
          if (await page.locator('[data-side]').count())
            await page.locator('[data-side]').first().click();
        } else await page.locator('#draw-pass').click();
      } else if (gameId === 'cards') {
        await expect(page.locator('.player-card')).toHaveCount(4);
        await page.locator('[data-card]:enabled').first().click();
        if (difficulty === 'hard')
          await page.screenshot({
            path: testInfo.outputPath('truco-seis-participantes.png'),
            fullPage: true,
          });
      }
      await expect
        .poll(
          async () =>
            (await (await page.request.get(`/api/rooms/${id}`)).json()).revision
        )
        .toBeGreaterThan(before.revision);
      await page
        .getByRole('button', { name: 'Sair (um bot assume)', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Sim, sair', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: /Olá, Paulo/ })
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test('Truco online completa quatro lugares confirmados e mostra as duas equipes', async ({
  page,
  baseURL,
}) => {
  await identify(page, 'Joana');
  const form = page.locator('[data-create-game="cards"]');
  await form.locator('button[type="submit"]').click();
  const guests = [];
  try {
    for (let i = 1; i < 4; i++) {
      if (i > 1)
        await page
          .getByRole('button', { name: 'Gerar convite para o familiar' })
          .click();
      const token = (await page.getByLabel('Link do convite').inputValue())
        .split('/')
        .at(-1);
      const guest = await request.newContext({ baseURL });
      guests.push(guest);
      const me = await (await guest.get('/api/me')).json();
      expect(
        (
          await guest.put('/api/me', { data: { ...me, name: `Familiar ${i}` } })
        ).ok()
      ).toBe(true);
      expect(
        (await guest.post(`/api/invitations/${token}/join`, { data: {} })).ok()
      ).toBe(true);
      await page.getByRole('button', { name: 'Sim, conheço. Começar' }).click();
      if (i < 3)
        await expect(page.locator('.lobby-players > span')).toHaveCount(i + 1);
    }
    await expect(page.locator('.player-card')).toHaveCount(4);
    await expect(page.locator('[data-card]')).toHaveCount(3);
    await page.locator('[data-card]').first().click();
    await expect(page.locator('.played-cards > div')).toHaveCount(1);
    await expect(page.locator('.truco-summary')).toContainText('Equipe A: 0');
  } finally {
    for (const guest of guests) await guest.dispose();
  }
});
