import { test, expect } from './fixtures.mjs';

async function startBotGame(page, name) {
  await page.goto('/');
  await page.getByLabel('Seu nome').fill(name);
  await page.getByRole('button', { name: 'Vamos jogar' }).click();
  await expect(
    page.getByRole('heading', { name: `Olá, ${name}` })
  ).toBeVisible();
  const form = page.locator('[data-create-game="domino"]').first();
  await form.getByLabel('Modo de jogo').selectOption('bot');
  await form.getByLabel('Tempo para cada jogada').selectOption('60');
  await form.getByRole('button', { name: /Jogar/ }).click();
  await expect(page.locator('.hand .tile-button').first()).toBeVisible();
}

test('linha de tempo muda de verde para laranja e vermelho e o relógio balança', async ({
  page,
}) => {
  await page.clock.install();
  await startBotGame(page, 'Lia');
  const timer = page.locator('.turn-timer');
  await expect(timer).toBeVisible();
  await expect(timer).toHaveAttribute('data-band', 'green');
  await expect(timer.getByRole('timer')).toContainText(/\d+ s/);
  await expect(timer.locator('.turn-timer-clock')).not.toHaveClass(/shaking/);

  await page.clock.runFor(35000); // sobram ~25 s de 60 (abaixo de 50%)
  await expect(timer).toHaveAttribute('data-band', 'orange');
  await expect(timer.locator('.turn-timer-clock')).toHaveClass(/shaking/);
  const slow = await timer
    .locator('.turn-timer-clock')
    .evaluate((el) => parseFloat(el.style.getPropertyValue('--shake')));

  await page.clock.runFor(25000); // sobram ~0-1 s (abaixo de 20%)
  await expect(timer).toHaveAttribute('data-band', 'red');
  const fast = await timer
    .locator('.turn-timer-clock')
    .evaluate((el) => parseFloat(el.style.getPropertyValue('--shake')));
  expect(fast).toBeLessThan(slow);
});

test('com menos movimento o relógio não balança e os segundos continuam em texto', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await startBotGame(page, 'Teo');
  await page.clock.runFor(40000);
  const clock = page.locator('.turn-timer-clock');
  await expect(clock).toHaveClass(/shaking/);
  expect(await clock.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none'
  );
  await expect(page.locator('.turn-timer').getByRole('timer')).toContainText(
    /\d+ s/
  );
});

test('na vez dos outros o botão fica desativado e a mesa mostra quem joga', async ({
  browser,
  baseURL,
}) => {
  const hostContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await host.goto('/');
    await host.getByLabel('Seu nome').fill('João');
    await host.getByRole('button', { name: 'Vamos jogar' }).click();
    await host.getByRole('button', { name: /Jogar agora/ }).click();
    const link = await host.getByLabel('Link do convite').inputValue();
    await guest.goto(link);
    await guest.getByLabel('Seu nome').fill('Maria');
    await guest
      .getByRole('button', { name: 'Continuar para o convite' })
      .click();
    await guest.getByRole('button', { name: /Entrar na partida/ }).click();
    await host.getByRole('button', { name: 'Sim, conheço. Começar' }).click();
    await expect(host.locator('.hand .tile-button')).toHaveCount(7);
    const waiting = [host, guest].map((page) => page.locator('.wait-button'));
    const visible = await Promise.all(waiting.map((l) => l.isVisible()));
    expect(visible.filter(Boolean)).toHaveLength(1);
    const button = visible[0] ? waiting[0] : waiting[1];
    await expect(button).toBeDisabled();
    await expect(button).toContainText(/Aguarde a vez de/);
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('sair deixa um bot no lugar, o dono retira jogadores e só ele encerra', async ({
  browser,
  baseURL,
}) => {
  const hostContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await host.goto('/');
    await host.getByLabel('Seu nome').fill('João');
    await host.getByRole('button', { name: 'Vamos jogar' }).click();
    await host.getByRole('button', { name: /Jogar agora/ }).click();
    const link = await host.getByLabel('Link do convite').inputValue();
    await guest.goto(link);
    await guest.getByLabel('Seu nome').fill('Maria');
    await guest
      .getByRole('button', { name: 'Continuar para o convite' })
      .click();
    await guest.getByRole('button', { name: /Entrar na partida/ }).click();
    await host.getByRole('button', { name: 'Sim, conheço. Começar' }).click();
    await expect(host.locator('.hand .tile-button')).toHaveCount(7);
    await expect(guest.locator('.hand .tile-button')).toHaveCount(7);
    // Quem não é dono não vê as ferramentas do dono.
    await expect(guest.locator('#close-room')).toHaveCount(0);
    await expect(host.locator('#close-room')).toBeVisible();

    // Maria sai: um bot assume e a mesa de João continua.
    await guest
      .getByRole('button', { name: 'Sair (um bot assume)', exact: true })
      .click();
    await guest.getByRole('button', { name: 'Sim, sair', exact: true }).click();
    await expect(
      guest.getByRole('heading', { name: /Olá, Maria/ })
    ).toBeVisible();
    await expect(host.locator('.seat-info')).toContainText('Maria');
    await expect(host.locator('.seat-info')).toContainText('ausente');

    // Maria volta pelo endereço da mesa e retoma o lugar.
    const mesa = await host.evaluate(() => location.pathname);
    await guest.goto(mesa);
    await expect(guest.locator('.hand .tile-button').first()).toBeVisible();
    await expect(host.locator('.seat-info')).toContainText('voltou à mesa');

    // João retira Maria: ela é avisada e não volta.
    host.once('dialog', (dialog) => dialog.accept());
    await host.getByRole('button', { name: 'Retirar jogador' }).click();
    await host.getByRole('button', { name: 'Retirar', exact: true }).click();
    await expect(
      guest.getByRole('heading', { name: /retirou você/ })
    ).toBeVisible();
    await expect(host.locator('.seat-info')).toContainText('retirado');

    // Só o dono encerra.
    await host.getByRole('button', { name: 'Encerrar mesa' }).click();
    await host
      .getByRole('button', { name: 'Sim, encerrar para todos' })
      .click();
    await expect(
      host.getByRole('heading', { name: /Olá, João/ })
    ).toBeVisible();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
