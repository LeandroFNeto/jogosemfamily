import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBot, register, lastOf } from './helpers.mjs';
import { parseWebhook } from '../whatsapp/webhook.mjs';

const ANA = '5511911111111';
const stop = (bot) =>
  bot.app.server.listening ? bot.app.stop() : bot.app.store.close();

function clockedBot(options) {
  const clock = { time: Date.now() };
  const bot = startBot(options, { clock: () => clock.time });
  return { bot, clock };
}

async function startDomino(bot) {
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '1');
  await bot.say(ANA, '2');
  return bot.say(ANA, '1');
}

test('webhook entende toque em botão e em item de lista', () => {
  const base = { from: '5511@c.us', timestamp: Math.floor(Date.now() / 1000) };
  const button = parseWebhook({
    ...base,
    type: 'buttons_response',
    selectedButtonId: 'r4:0',
  });
  assert.equal(button.text, 'r4:0');
  const list = parseWebhook({
    ...base,
    type: 'list_response',
    listResponse: { singleSelectReply: { selectedRowId: 'r4:2' } },
  });
  assert.equal(list.text, 'r4:2');
});

test('partida cancelada por inatividade avisa, leva ao menu e exige nova partida', async (t) => {
  const { bot, clock } = clockedBot();
  t.after(() => stop(bot));
  await startDomino(bot);
  clock.time += 6 * 60000;
  bot.app.rooms.sweep();
  await bot.app.whatsapp.idle();
  const warning = bot.fake.take(ANA).join('\n');
  assert.equal(warning, '', 'cancelamento só aparece na web');
  assert.match(
    lastOf(
      await bot.say(ANA, 'estado', {
        timestamp: Math.floor(clock.time / 1000),
      })
    ),
    /não tem partida em andamento/
  );
});
