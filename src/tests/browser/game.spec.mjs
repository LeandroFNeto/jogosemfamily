import { test, expect } from './fixtures.mjs';

async function identify(page, name, invited = false) {
  await page.getByLabel('Seu nome').fill(name);
  await page
    .getByRole('button', {
      name: invited ? 'Continuar para o convite' : 'Vamos jogar',
      exact: false,
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: invited ? /convidou você/ : new RegExp(`Olá, ${name}`),
    })
  ).toBeVisible();
}

async function pair(browser, baseURL) {
  const hostContext = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    baseURL,
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL,
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];
  for (const page of [host, guest]) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
  await host.goto('/');
  await identify(host, 'João');
  await host.getByRole('button', { name: /Jogar agora/ }).click();
  const link = await host.getByLabel('Link do convite').inputValue();
  await guest.goto(link);
  await identify(guest, 'Maria', true);
  await guest.getByRole('button', { name: /Entrar na partida/ }).click();
  await expect(
    guest.getByRole('heading', { name: 'Aguardando o familiar' })
  ).toBeVisible();
  await host.getByRole('button', { name: 'Sim, conheço. Começar' }).click();
  await expect(host.locator('.hand .tile-button')).toHaveCount(7);
  await expect(guest.locator('.hand .tile-button')).toHaveCount(7);
  return { hostContext, guestContext, host, guest, errors };
}

test('duas pessoas jogam até o resultado, reconectam e pedem revanche', async ({
  browser,
  baseURL,
}) => {
  const { hostContext, guestContext, host, guest, errors } = await pair(
    browser,
    baseURL
  );
  try {
    await guest.reload();
    await expect(guest.locator('.hand .tile-button')).toHaveCount(7);
    let moves = 0;
    while (!(await host.locator('#rematch').count()) && moves++ < 130) {
      await expect
        .poll(
          async () =>
            (await host.locator('.my-turn').count()) +
            (await guest.locator('.my-turn').count()) +
            (await host.locator('#rematch').count())
        )
        .toBeGreaterThan(0);
      if (await host.locator('#rematch').count()) break;
      const active = (await host.locator('.my-turn').count()) ? host : guest;
      const revision = await active.evaluate(
        async () =>
          (
            await (
              await fetch(`/api/rooms/${location.pathname.split('/')[2]}`)
            ).json()
          ).revision
      );
      const available = active.locator('.tile-button.playable');
      if (await available.count()) {
        await available.first().click();
        if (await active.locator('[data-side]').count())
          await active.locator('[data-side]').first().click();
      } else await active.locator('#draw-pass').click();
      await expect
        .poll(() =>
          active.evaluate(
            async () =>
              (
                await (
                  await fetch(`/api/rooms/${location.pathname.split('/')[2]}`)
                ).json()
              ).revision
          )
        )
        .toBeGreaterThan(revision);
    }
    await expect(host.locator('#rematch')).toBeVisible();
    await expect(guest.locator('#rematch')).toBeVisible();
    await host.getByRole('button', { name: 'Jogar novamente' }).click();
    await expect(host.locator('#rematch')).toBeDisabled();
    await guest.getByRole('button', { name: 'Jogar novamente' }).click();
    await expect(host.locator('.hand .tile-button')).toHaveCount(7);
    await expect(guest.locator('.hand .tile-button')).toHaveCount(7);
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('painel, foto, preferências, teclado e layout em celular com letra extra grande', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await identify(page, 'Ana');
  await page.screenshot({
    path: testInfo.outputPath('inicio-celular.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Painel do familiar', exact: true })
    .click();
  await page.getByLabel('Nome do jogador').fill('Ana Maria');
  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      canvas.getContext('2d').fillRect(0, 0, 16, 16);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64'
  );
  await page
    .getByLabel('Foto do jogador')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Salvar configuração' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Olá, Ana Maria/ })
  ).toBeVisible();
  await page.getByRole('button', { name: /Acessibilidade/ }).click();
  await page.getByLabel('Tamanho da letra').selectOption('extra');
  await page.getByLabel('Alto contraste').check();
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'extra');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'extra');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.getByRole('button', { name: /Jogar agora/ }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Sua mesa está pronta.' })
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Gerar convite para o familiar' })
    .click();
  await expect(page.getByLabel('Link do convite')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('mesa cabe no celular com fonte extra grande e mantém navegação por teclado', async ({
  browser,
  baseURL,
}, testInfo) => {
  const { hostContext, guestContext, host, guest, errors } = await pair(
    browser,
    baseURL
  );
  try {
    await host.screenshot({
      path: testInfo.outputPath('mesa-desktop.png'),
      fullPage: true,
    });
    await guest.setViewportSize({ width: 360, height: 800 });
    await guest.getByRole('button', { name: /Acessibilidade/ }).click();
    await guest.getByLabel('Tamanho da letra').selectOption('extra');
    await guest.getByLabel('Alto contraste').check();
    await guest.getByRole('button', { name: 'Salvar preferências' }).click();
    await expect(guest.getByRole('dialog')).not.toBeVisible();
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    // Cronômetro visível, sem balanço (alto contraste) e sem rolagem lateral.
    await expect(guest.locator('.turn-timer')).toBeVisible();
    await expect(guest.locator('.turn-timer').getByRole('timer')).toContainText(
      /\d+ s/
    );
    expect(
      await guest
        .locator('.turn-timer-clock')
        .evaluate((el) => getComputedStyle(el).animationName)
    ).toBe('none');
    await guest.screenshot({
      path: testInfo.outputPath('mesa-celular-acessivel.png'),
      fullPage: true,
    });
    const controls = await guest
      .locator('button:visible:not(:disabled)')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height)
      );
    expect(controls.every((height) => height >= 44)).toBe(true);
    await guest.getByRole('button', { name: 'Preciso de ajuda' }).focus();
    await guest.keyboard.press('Enter');
    await expect(guest.getByRole('dialog')).toBeVisible();
    await guest.keyboard.press('Escape');
    await expect(guest.getByRole('dialog')).not.toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('mesa expirada interrompe tentativas de reconexão e orienta criar outra', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(...args) {
        super(...args);
        window.testEvents = this;
      }
    };
  });
  await page.goto('/');
  await identify(page, 'Rosa');
  await page.getByRole('button', { name: /Jogar agora/ }).click();
  await expect(page.locator('.connection')).toHaveText('● Conectado à mesa');
  await page.route(/\/api\/rooms\/[\w-]+(?:\/events)?$/, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Esta mesa expirou. Crie uma nova partida.',
      }),
    })
  );
  await page.evaluate(() =>
    window.testEvents.dispatchEvent(new Event('error'))
  );
  await expect(
    page.getByRole('heading', { name: 'Esta mesa não está mais disponível.' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Voltar ao início' })
  ).toBeVisible();
  expect(await page.evaluate(() => window.testEvents.readyState)).toBe(2);
});
