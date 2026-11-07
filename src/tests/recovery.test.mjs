import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startBot, register, lastOf } from './helpers.mjs';

const ANA = '5511911111111';
const CAIO = '5511933333333';
const stop = (bot) =>
  bot.app.server.listening ? bot.app.stop() : bot.app.store.close();

async function boot() {
  const clock = { time: Date.now() };
  const bot = startBot({}, { clock: () => clock.time });
  bot.app.server.listen(0, '127.0.0.1');
  await once(bot.app.server, 'listening');
  const origin = `http://127.0.0.1:${bot.app.server.address().port}`;
  const browser = () => {
    let cookie = '';
    return {
      async call(path, method = 'GET', body, expected = 200) {
        const res = await fetch(`${origin}/api${path}`, {
          method,
          headers: {
            Cookie: cookie,
            ...(body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0];
        const data = await res.json();
        assert.equal(res.status, expected, JSON.stringify(data));
        return data;
      },
    };
  };
  const say = (number, text) =>
    bot.say(number, text, { timestamp: Math.floor(clock.time / 1000) });
  return { bot, clock, browser, say };
}

// Perfil do site (com nome) já vinculado ao número do Caio.
async function linkedSiteProfile(ctx) {
  const site = ctx.browser();
  const me = await site.call('/me');
  await site.call('/me', 'PUT', { ...me, name: 'Dona Lia' });
  const { code } = await site.call('/link-code', 'POST', {});
  await ctx.say(CAIO, 'oi'); // cria o perfil vazio do WhatsApp
  const reply = await ctx.say(CAIO, `VINCULAR ${code}`);
  return { site, me, reply };
}

const sixDigits = (messages) => messages.join(' ').match(/\*(\d{6})\*/)?.[1];

test('perfil do site registra o número enviando o código ao bot', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const { site, reply } = await linkedSiteProfile(ctx);
  assert.match(reply.join(' '), /Número registrado/);
  assert.equal((await site.call('/me')).phoneLinked, true);
  assert.equal((await site.call('/me')).name, 'Dona Lia');
  // Perfil que já tem número não gera novo código.
  await site.call('/link-code', 'POST', {}, 409);
  // A mensagem seguinte do número abre o menu do perfil do site.
  assert.match(lastOf(await ctx.say(CAIO, 'menu')), /Olá, Dona Lia/);
});

test('número que já tem perfil com nome no WhatsApp não é mesclado', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  await register(ctx.bot, ANA, 'Ana');
  const site = ctx.browser();
  const me = await site.call('/me');
  await site.call('/me', 'PUT', { ...me, name: 'Lia' });
  const { code } = await site.call('/link-code', 'POST', {});
  const answer = await ctx.say(ANA, `VINCULAR ${code}`);
  assert.match(answer.join(' '), /Não é possível vincular/);
  assert.equal((await site.call('/me')).phoneLinked, false);
  const wrong = await ctx.say(ANA, 'VINCULAR ABCDEFGH');
  assert.match(wrong.join(' '), /inválido ou expirado/);
});

test('código de vínculo expira em 10 minutos', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const site = ctx.browser();
  const me = await site.call('/me');
  await site.call('/me', 'PUT', { ...me, name: 'Lia' });
  const { code } = await site.call('/link-code', 'POST', {});
  await ctx.say(CAIO, 'oi');
  ctx.clock.time += 11 * 60000;
  assert.match(
    (await ctx.say(CAIO, `VINCULAR ${code}`)).join(' '),
    /inválido ou expirado/
  );
});

test('recuperação: código no WhatsApp devolve o perfil e revoga sessões antigas', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const { site } = await linkedSiteProfile(ctx);
  ctx.bot.fake.take(CAIO);
  const novo = ctx.browser();
  const asked = await novo.call(
    '/recovery/request',
    'POST',
    { phone: CAIO },
    202
  );
  await ctx.bot.app.whatsapp.idle();
  const messages = ctx.bot.fake.take(CAIO);
  const code = sixDigits(messages);
  assert.ok(code, 'o código chega por WhatsApp');
  assert.deepEqual(asked, { ok: true });
  // O banco guarda só o hash, nunca o código.
  const rows = ctx.bot.app.store.db
    .prepare('SELECT * FROM recovery_codes')
    .all();
  assert.ok(!JSON.stringify(rows).includes(code));
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  await novo.call(
    '/recovery/verify',
    'POST',
    { phone: CAIO, code: wrong },
    400
  );
  await novo.call('/recovery/verify', 'POST', { phone: CAIO, code }, 200);
  assert.equal((await novo.call('/me')).name, 'Dona Lia');
  // O cookie antigo deixou de valer: a sessão antiga vira um perfil novo, vazio.
  assert.equal((await site.call('/me')).name, '');
  await ctx.bot.app.whatsapp.idle();
  assert.match(ctx.bot.fake.take(CAIO).join(' '), /acessada em outro aparelho/);
  // Uso único.
  await ctx
    .browser()
    .call('/recovery/verify', 'POST', { phone: CAIO, code }, 400);
});

test('número desconhecido recebe a mesma resposta e nada é enviado', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  await linkedSiteProfile(ctx);
  ctx.bot.fake.take(CAIO);
  const browser = ctx.browser();
  const unknown = await browser.call(
    '/recovery/request',
    'POST',
    { phone: '5511977777777' },
    202
  );
  const known = await browser.call(
    '/recovery/request',
    'POST',
    { phone: CAIO },
    202
  );
  assert.deepEqual(unknown, known);
  await ctx.bot.app.whatsapp.idle();
  assert.equal(ctx.bot.fake.take('5511977777777').length, 0);
  const failed = await browser.call(
    '/recovery/verify',
    'POST',
    { phone: '5511977777777', code: '123456' },
    400
  );
  assert.match(failed.error, /inválido ou expirado/);
});

test('cinco tentativas erradas invalidam o código', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  await linkedSiteProfile(ctx);
  ctx.bot.fake.take(CAIO);
  const browser = ctx.browser();
  await browser.call('/recovery/request', 'POST', { phone: CAIO }, 202);
  await ctx.bot.app.whatsapp.idle();
  const code = sixDigits(ctx.bot.fake.take(CAIO));
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  for (let i = 0; i < 5; i++)
    await browser.call(
      '/recovery/verify',
      'POST',
      { phone: CAIO, code: wrong },
      400
    );
  await browser.call('/recovery/verify', 'POST', { phone: CAIO, code }, 400);
});

test('código expira em 10 minutos', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  await linkedSiteProfile(ctx);
  ctx.bot.fake.take(CAIO);
  const browser = ctx.browser();
  await browser.call('/recovery/request', 'POST', { phone: CAIO }, 202);
  await ctx.bot.app.whatsapp.idle();
  const code = sixDigits(ctx.bot.fake.take(CAIO));
  ctx.clock.time += 10 * 60000 + 1000;
  await browser.call('/recovery/verify', 'POST', { phone: CAIO, code }, 400);
});

test('no máximo três pedidos por hora por número e por origem', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const browser = ctx.browser();
  for (let i = 0; i < 3; i++)
    await browser.call(
      '/recovery/request',
      'POST',
      { phone: `551190000000${i}` },
      202
    );
  const blocked = await browser.call(
    '/recovery/request',
    'POST',
    { phone: '5511966666666' },
    429
  );
  assert.match(blocked.error, /Muitos pedidos/);
  ctx.clock.time += 61 * 60000;
  await browser.call(
    '/recovery/request',
    'POST',
    { phone: '5511966666666' },
    202
  );
});

test('número inválido é recusado antes de qualquer envio', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  await ctx.browser().call('/recovery/request', 'POST', { phone: '123' }, 400);
});
