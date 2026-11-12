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
  const mode = lastOf(await bot.say(ANA, '5'));
  assert.match(mode, /como você quer jogar/);
  assert.equal(bot.fake.images.at(-1).filename, 'modo-mesa.png');
  const asked = lastOf(await bot.say(ANA, '2'));
  assert.match(asked, /Quantos lugares na mesa de Cacheta/);
  assert.equal(bot.fake.images.at(-1).filename, 'lugares.png');
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

test('WhatsApp: cada decisão do quebra-cabeça e do caça-palavras vai como imagem', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  const lastImage = () => bot.fake.images.at(-1).filename;
  await bot.say(ANA, '4');
  assert.equal(lastImage(), 'modo-grupo.png');
  await bot.say(ANA, '2');
  assert.equal(lastImage(), 'nivel-quebra-cabeca.png');
  await bot.say(ANA, '2');
  assert.equal(lastImage(), 'imagens-medium.png');
  assert.match(bot.fake.images.at(-1).base64, /^data:image\/png;base64,/);
  await bot.say(ANA, 'menu');
  await bot.say(ANA, '6');
  await bot.say(ANA, '2');
  assert.equal(lastImage(), 'nivel-caca-palavras.png');
});

test('WhatsApp: as imagens de decisão existem e as folhas cobrem o acervo', async () => {
  const { MENUS, embeddedImageIds } = await import('../whatsapp/menu-art.mjs');
  const { existsSync } = await import('node:fs');
  const assets = new URL('../whatsapp/assets/', import.meta.url);
  const names = [
    ...Object.keys(MENUS),
    ...['easy', 'medium', 'hard'].map((level) => `imagens-${level}`),
  ];
  for (const name of names)
    assert.ok(existsSync(new URL(`${name}.png`, assets)), `${name}.png existe`);
  for (const level of ['easy', 'medium', 'hard'])
    assert.ok(embeddedImageIds(level).length <= 8);
});

test('WhatsApp: confirmações de sair e encerrar usam botões Sim e Não', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '4');
  await bot.say(ANA, '2');
  await bot.say(ANA, '1');
  await bot.say(ANA, '1');
  bot.fake.interactive.length = 0;
  const asked = lastOf(await bot.say(ANA, 'sair'));
  assert.match(asked, /Sair da mesa\?.*SIM.*NÃO/s);
  assert.equal(bot.fake.interactive.at(-1).kind, 'buttons');
});
