import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBot, register, lastOf, codeOf } from './helpers.mjs';
import * as cacheta from '../games/cacheta/engine.mjs';
import * as wordsearch from '../games/wordsearch/engine.mjs';
import { seededRng } from '../games/core/rng.mjs';

const ANA = '5511911111111';
const BIA = '5511922222222';
const CAIO = '5511933333333';
const stop = (bot) =>
  bot.app.server.listening ? bot.app.stop() : bot.app.store.close();

function roomOf(bot) {
  const row = bot.app.store.db.prepare('SELECT data FROM rooms').get();
  return JSON.parse(row.data);
}

test('WhatsApp: menu lista os seis jogos e a Cacheta contra bots pergunta os lugares', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const menu = await register(bot, ANA, 'Ana');
  assert.match(menu.join('\n'), /\[imagem\]/);
  assert.equal(bot.fake.images.at(-1).filename, 'menu-jogos.png');
  const seats = lastOf(await bot.say(ANA, '5'));
  assert.match(seats, /Com amigos/);
  const asked = lastOf(await bot.say(ANA, '2'));
  assert.match(asked, /Quantos lugares na mesa de Cacheta/);
  assert.match(asked, /2 jogadores/);
  assert.match(asked, /4 jogadores/);
  assert.match(lastOf(await bot.say(ANA, '9')), /Não entendi/);
  const started = (await bot.say(ANA, '2')).join('\n');
  assert.match(started, /Cacheta/);
  assert.match(started, /http:\/\/web\.test\/m\//);
  assert.doesNotMatch(started, /Suas cartas|Comprar do monte|Pegar o descarte/);
  const room = roomOf(bot);
  assert.equal(room.gameId, 'cacheta');
  assert.equal(room.playerIds.length, 3);
  assert.equal(room.botIds.length, 2);
});
