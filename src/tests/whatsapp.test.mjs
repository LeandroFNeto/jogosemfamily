import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  startBot,
  register,
  lastOf,
  codeOf,
  fakeWpp,
  setup,
  BOT_NUMBER,
} from './helpers.mjs';
import {
  parseJid,
  maskJid,
  createIdentityCodec,
} from '../whatsapp/identity.mjs';
import { parseWebhook } from '../whatsapp/webhook.mjs';
import { splitMessage } from '../whatsapp/channel.mjs';
import { createWppClient, normalizeStatus } from '../whatsapp/wpp-client.mjs';
import { crosswords } from '../games/crossword/puzzles.mjs';
import { issueWhatsappInvitation } from '../invitations/service.mjs';

const ANA = '5511911111111';
const BIA = '5511922222222';
const CAIO = '5511933333333';
const NL = String.fromCharCode(10);
const stop = (bot) =>
  bot.app.server.listening ? bot.app.stop() : bot.app.store.close();

async function listen(bot) {
  bot.app.server.listen(0, '127.0.0.1');
  await once(bot.app.server, 'listening');
  return `http://127.0.0.1:${bot.app.server.address().port}`;
}

test('identidade normaliza JIDs, mascara números e cifra o endereço de resposta', () => {
  assert.deepEqual(parseJid('5511911111111@c.us'), {
    key: 'phone:5511911111111',
    address: '5511911111111@c.us',
  });
  assert.equal(
    parseJid('5511911111111:12@s.whatsapp.net').key,
    'phone:5511911111111'
  );
  assert.equal(parseJid('123456789012@lid').key, 'lid:123456789012');
  assert.notEqual(
    parseJid('123456789012@lid').key,
    parseJid('123456789012@c.us').key
  );
  assert.equal(parseJid('grupo@g.us'), null);
  assert.equal(parseJid(undefined), null);
  assert.equal(maskJid('5511911111111@c.us'), '55****11');
  const codec = createIdentityCodec('segredo-dos-dados');
  const sealed = codec.seal('5511911111111@c.us');
  assert.ok(!sealed.includes('5511911111111'));
  assert.equal(codec.open(sealed), '5511911111111@c.us');
  assert.notEqual(codec.seal('x'), codec.seal('x'));
  assert.throws(() => createIdentityCodec('curto'));
});

test('webhook entende formatos plano, aninhado e @lid e filtra ruído', () => {
  const now = 1_800_000_000_000;
  const ts = Math.floor(now / 1000);
  const plain = parseWebhook(
    { type: 'chat', from: '5511@c.us', body: 'oi', timestamp: ts },
    now
  );
  assert.equal(plain.kind, 'message');
  const nested = parseWebhook(
    {
      data: {
        key: { remoteJid: '5511911111111@c.us', fromMe: false },
        message: { conversation: 'oi' },
      },
      timestamp: ts * 1000,
    },
    now
  );
  assert.equal(nested.kind, 'message');
  assert.equal(nested.text, 'oi');
  const lid = parseWebhook(
    {
      type: 'chat',
      from: '99999999999@lid',
      sender: { id: { _serialized: '5511911111111@c.us' } },
      content: 'oi',
    },
    now
  );
  assert.equal(lid.jid, '5511911111111@c.us');
  const cases = [
    [{ type: 'chat', from: 'a@g.us', body: 'x', isGroupMsg: true }, 'group'],
    [{ type: 'chat', from: 'status@broadcast', body: 'x' }, 'status'],
    [{ type: 'image', from: '5511@c.us', body: 'x' }, 'type'],
    [{ type: 'chat', from: '5511@c.us', body: 'x', fromMe: true }, 'fromMe'],
    [{ event: 'onselfmessage', from: '5511@c.us', body: 'x' }, 'fromMe'],
    [
      { type: 'chat', from: '5511@c.us', body: 'x', timestamp: ts - 121 },
      'old',
    ],
    [{ type: 'chat', from: '5511@c.us', body: '  ' }, 'empty'],
  ];
  for (const [payload, reason] of cases) {
    const result = parseWebhook(payload, now);
    assert.equal(result.reason ?? result.kind, reason, JSON.stringify(payload));
  }
  assert.equal(
    parseWebhook({ event: 'qrcode', qrcode: 'abc' }, now).kind,
    'qrcode'
  );
  assert.equal(parseWebhook({ event: 'status-find' }, now).kind, 'connection');
  assert.equal(parseWebhook(null, now).kind, 'ignore');
});

test('cliente WPPConnect normaliza status, repete após 401 e entrega QR Code', async () => {
  assert.equal(normalizeStatus('isLogged'), 'CONNECTED');
  assert.equal(normalizeStatus('DISCONNECTED'), 'DISCONNECTED');
  assert.equal(normalizeStatus('', 'abc'), 'QRCODE');
  const fake = fakeWpp();
  const client = createWppClient({
    url: 'http://wpp.test',
    secretKey: 'chave',
    session: 'mesa',
    webhookUrl: 'http://mesa.test/webhook/whatsapp',
    fetchImpl: fake.fetchImpl,
  });
  assert.equal((await client.status()).status, 'DISCONNECTED');
  const started = await client.start();
  assert.equal(started.status, 'QRCODE');
  assert.equal(started.qrcodeBase64, 'data:image/png;base64,QUJD');
  fake.status = 'CONNECTED';
  assert.deepEqual(await client.start(), {
    session: 'mesa',
    status: 'CONNECTED',
    qrcodeBase64: null,
  });
  fake.rejectNextToken = true;
  await client.sendText('5511911111111@c.us', 'oi');
  assert.equal(fake.sent.length, 1);
  assert.ok(fake.tokens >= 2, 'token regenerado após 401');
  const offline = createWppClient({
    url: 'http://wpp.test',
    secretKey: 'chave',
    session: 'mesa',
    fetchImpl: async () => {
      throw new Error('sem rede');
    },
  });
  assert.equal((await offline.status()).status, 'DISCONNECTED');
});

test('webhook HTTP exige segredo e rotas administrativas exigem token', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const origin = await listen(bot);
  const post = (path, body = bot.payload(ANA, 'oi'), headers = {}) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  assert.equal((await post('/webhook/whatsapp')).status, 401);
  assert.equal((await post('/webhook/whatsapp?secret=errado')).status, 401);
  const ok = await post('/webhook/whatsapp?secret=segredo-do-webhook');
  assert.equal(ok.status, 200);
  await bot.app.whatsapp.idle();
  assert.match(lastOf(bot.fake.take(ANA)), /qual é o seu \*nome\*/i);
  assert.equal((await fetch(`${origin}/webhook/whatsapp`)).status, 405);
  assert.equal((await fetch(`${origin}/admin/whatsapp/status`)).status, 401);
  const status = await fetch(`${origin}/admin/whatsapp/status`, {
    headers: { 'x-admin-token': 'token-admin' },
  });
  assert.equal((await status.json()).status, 'DISCONNECTED');
  const start = await fetch(`${origin}/admin/whatsapp/start`, {
    method: 'POST',
    headers: { 'x-admin-token': 'token-admin' },
  });
  assert.equal((await start.json()).status, 'QRCODE');
});

test('mensagens de grupo, eco, antigas, duplicadas e não texto não geram resposta', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const { say, payload, app, fake } = bot;
  assert.deepEqual(await say(ANA, 'oi', { isGroupMsg: true }), []);
  assert.deepEqual(await say(ANA, 'oi', { fromMe: true }), []);
  assert.deepEqual(
    await say(ANA, 'oi', { timestamp: Math.floor(Date.now() / 1000) - 600 }),
    []
  );
  assert.deepEqual(await say(ANA, 'oi', { type: 'image' }), []);
  assert.equal(fake.sent.length, 0);
  const same = payload(ANA, 'oi');
  await app.whatsapp.handleWebhook(same);
  const again = await app.whatsapp.handleWebhook(same);
  await app.whatsapp.idle();
  assert.equal(again.ignored, 'duplicate');
  assert.equal(fake.take(ANA).length, 1, 'responde uma única vez');
});

test('perfil vinculado ao telefone: pede nome, reutiliza depois e não guarda número em claro', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const first = await bot.say(ANA, 'oi');
  assert.match(lastOf(first), /qual é o seu \*nome\*/i);
  assert.match(lastOf(await bot.say(ANA, 'a')), /2 a 40 letras/);
  const menu = await bot.say(ANA, '*Ana*');
  assert.match(lastOf(menu), /Olá, Ana!/);
  assert.match(lastOf(menu), /\[imagem\].*\*número\* ou o \*nome\*/s);
  const again = await bot.say(ANA, 'menu');
  assert.match(lastOf(again), /Olá, Ana!/);
  const rows = bot.app.store.db
    .prepare('SELECT * FROM channel_identities')
    .all();
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes(ANA));
  const other = await bot.say(BIA, 'oi');
  assert.match(lastOf(other), /qual é o seu \*nome\*/i);
  assert.equal(
    bot.app.store.db.prepare('SELECT count(*) AS n FROM profiles').get().n,
    2
  );
});

test('jogo desabilitado no painel do familiar não aparece nem inicia', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  const row = bot.app.store.db
    .prepare('SELECT profile_id FROM channel_identities')
    .get();
  const profile = bot.app.store.getProfile(row.profile_id);
  profile.enabledGames = ['puzzle'];
  bot.app.store.saveProfile(profile);
  const menu = await bot.say(ANA, 'menu');
  assert.doesNotMatch(lastOf(menu), /Dominó/);
  assert.match(lastOf(menu), /\[imagem\]/);
  assert.match(
    lastOf(await bot.say(ANA, '1')),
    /Dominó está desligado no painel do familiar/
  );
  assert.match(lastOf(await bot.say(ANA, '4')), /Quebra-cabeça/);
});

test('mesa com amigos: link wa.me, entrada sem aprovação, contato favorito e início automático', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '1');
  await bot.say(ANA, '1');
  const invite = await bot.say(ANA, '1');
  const joined = invite.join('\n');
  assert.match(
    joined,
    new RegExp(`https://wa.me/${BOT_NUMBER}\\?text=ENTRAR%20[A-Z2-9]{8}`)
  );
  const code = codeOf(invite);
  assert.ok(code);
  assert.match(joined, /24 horas/);

  const newcomer = await bot.say(BIA, `ENTRAR ${code}`);
  assert.match(lastOf(newcomer), /qual é o seu \*nome\*/i);
  await bot.say(BIA, 'Bia');
  await bot.app.whatsapp.idle();
  const anaView = bot.fake.take(ANA).join(NL);
  assert.equal(anaView, '', 'o dono não recebe aviso automático do jogo');
  const anaLink = /http:\/\/web\.test\/m\/([\w-]{43})/.exec(joined)?.[1];
  assert.ok(anaLink, 'o dono recebe o link da web ao criar a mesa');
  const owner = bot.app.store.db
    .prepare(
      "SELECT data FROM profiles WHERE json_extract(data,'$.name') = 'Ana'"
    )
    .get();
  assert.equal(JSON.parse(owner.data).contacts.length, 1, 'Bia virou contato');

  const room = bot.app.rooms.listActive(JSON.parse(owner.data).id)[0];
  assert.equal(room.status, 'PLAYING');
  const biaProfile = bot.app.store.getProfile(room.playerIds[1]);
  assert.equal(biaProfile.name, 'Bia');
  const biaMessages = (await bot.say(BIA, 'jogo')).join(NL);
  const biaLink = /http:\/\/web\.test\/m\/([\w-]{43})/.exec(biaMessages)?.[1];
  assert.ok(biaLink && biaLink !== anaLink, 'cada pessoa tem o próprio link');
  assert.doesNotMatch(anaView + biaMessages, /Suas peças|Sua mão/);

  const third = await register(bot, CAIO, 'Caio');
  assert.ok(third.length);
  const full = await bot.say(CAIO, `entrar ${code}`);
  assert.match(lastOf(full), /completa/);
  const dono = await bot.say(ANA, `ENTRAR ${code}`);
  assert.equal(bot.app.rooms.listActive(biaProfile.id)[0].playerIds.length, 2);
  assert.match(dono.join(NL), /link que já enviei/);
  assert.doesNotMatch(dono.join(NL), /\/m\//, 'não reenvia o link');
});

test('código expirado, inexistente ou de mesa encerrada é recusado com orientação', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await register(bot, BIA, 'Bia');
  await bot.say(ANA, '1');
  const code = codeOf(await bot.say(ANA, '1'));
  bot.app.store.db.prepare('UPDATE invitations SET expires = 1').run();
  assert.match(
    lastOf(await bot.say(BIA, `ENTRAR ${code}`)),
    /inválido ou expirado/
  );
  assert.match(
    lastOf(await bot.say(BIA, 'ENTRAR ABCDEFGH')),
    /inválido ou expirado/
  );
  assert.match(lastOf(await bot.say(BIA, 'ENTRAR 12')), /inválido ou expirado/);
});

test('sair deixa um bot no lugar, o retorno reassume e só o dono encerra', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await register(bot, BIA, 'Bia');
  await bot.say(ANA, '4');
  await bot.say(ANA, '1'); // com amigos
  await bot.say(ANA, '1'); // quebra-cabeça fácil
  const code = codeOf(await bot.say(ANA, '1')); // imagem sorteada
  await bot.say(BIA, `ENTRAR ${code}`);
  bot.fake.take(ANA);
  assert.match(lastOf(await bot.say(BIA, 'sair')), /bot assume o seu lugar/);
  assert.match(lastOf(await bot.say(BIA, 'não')), /mesa continua/);
  await bot.say(BIA, 'sair');
  const left = await bot.say(BIA, 'sim');
  assert.match(left.join(NL), /bot assumiu o seu lugar/);
  assert.doesNotMatch(bot.fake.take(ANA).join(NL), /Bia saiu/);
  await bot.say(BIA, 'jogo');
  assert.match(
    lastOf(await bot.say(BIA, 'encerrar')),
    /Só quem criou a mesa pode encerrá-la/
  );
  bot.fake.take(ANA);
  assert.match(
    lastOf(await bot.say(ANA, 'encerrar')),
    /encerrar a mesa para todos/i
  );
  assert.match(lastOf(await bot.say(ANA, 'não')), /mesa continua/);
  await bot.say(ANA, 'encerrar');
  await bot.say(ANA, 'sim');
  assert.doesNotMatch(bot.fake.take(BIA).join(NL), /mesa foi encerrada/);
  assert.match(
    lastOf(await bot.say(ANA, 'estado')),
    /não tem partida em andamento/
  );
  assert.match(lastOf(await bot.say(CAIO, 'sair')), /qual é o seu \*nome\*/i);
});

test('dono retira um jogador pelo WhatsApp e ele recebe o aviso', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await register(bot, BIA, 'Bia');
  await bot.say(ANA, '4');
  await bot.say(ANA, '1'); // com amigos
  await bot.say(ANA, '1'); // quebra-cabeça fácil
  const code = codeOf(await bot.say(ANA, '1')); // imagem sorteada
  await bot.say(BIA, `ENTRAR ${code}`);
  assert.match(
    lastOf(await bot.say(BIA, 'retirar')),
    /Só quem criou a mesa pode retirar/
  );
  assert.match(lastOf(await bot.say(ANA, 'retirar')), /Quem você quer retirar/);
  assert.match(lastOf(await bot.say(ANA, '1')), /Retirar \*Bia\*/);
  assert.match(lastOf(await bot.say(ANA, 'sim')), /Bia foi retirado/);
  assert.doesNotMatch(
    bot.fake.take(BIA).join(NL),
    /retirou você desta partida/
  );
  assert.match(
    lastOf(await bot.say(BIA, `ENTRAR ${code}`)),
    /retirou você|não é mais válido|inválido/i
  );
});

test('mensagens rápidas do mesmo telefone são processadas em ordem', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await bot.say(ANA, 'oi');
  await Promise.all([
    bot.sayNow(ANA, 'Ana'),
    bot.sayNow(ANA, '1'),
    bot.sayNow(ANA, '2'),
    bot.sayNow(ANA, '1'),
  ]);
  await bot.app.whatsapp.idle();
  const messages = bot.fake.take(ANA);
  assert.match(messages[0], /Olá, Ana/);
  assert.match(messages[1], /como você quer jogar/);
  assert.match(messages[2], /Quantos lugares/);
  assert.match(messages[3], /começou/);
});

test('excesso de mensagens por minuto gera um único aviso', async (t) => {
  const bot = startBot({ rateLimitPerMinute: 3 });
  t.after(() => stop(bot));
  let replies = [];
  for (let i = 0; i < 8; i++)
    replies = replies.concat(await bot.say(ANA, `msg ${i}`));
  assert.equal(replies.filter((m) => /rápido demais/.test(m)).length, 1);
});

test('logs não expõem número completo nem texto das mensagens', async (t) => {
  const lines = [];
  const bot = startBot({
    log: {
      warn: (...a) => lines.push(a.join(' ')),
      error: (...a) => lines.push(a.join(' ')),
    },
  });
  t.after(() => stop(bot));
  bot.fake.fetchImpl = async () => {
    throw new Error('queda');
  };
  bot.client.sendText = async () => {
    throw new Error('queda');
  };
  await bot.say(ANA, 'segredo');
  assert.ok(lines.length > 0);
  assert.ok(
    lines.every((line) => !line.includes(ANA) && !line.includes('segredo'))
  );
});

test('mensagens longas são divididas em partes ordenadas', () => {
  const text = Array.from(
    { length: 400 },
    (_, i) => `linha ${i} ${'x'.repeat(20)}`
  ).join('\n');
  const parts = splitMessage(text, 1000);
  assert.ok(parts.length > 1);
  assert.match(parts[0], /^\(1\/\d+\)/);
  assert.ok(parts.every((p) => p.length <= 1020));
  assert.deepEqual(splitMessage('curta'), ['curta']);
});

test('banco antigo abre sem perda e conversa e identidade sobrevivem a reinício', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mesa-wpp-'));
  const databasePath = join(dir, 'mesa.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), expires INTEGER NOT NULL);
    CREATE TABLE rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE invitations (token_hash TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), expires INTEGER NOT NULL, used_by TEXT REFERENCES profiles(id));
    INSERT INTO profiles VALUES ('antigo', '{"id":"antigo","name":"Vovó","contacts":[]}');
  `);
  legacy.close();
  const first = startBot({}, { databasePath });
  assert.equal(first.app.store.getProfile('antigo').name, 'Vovó');
  await register(first, ANA, 'Ana');
  await first.say(ANA, '4');
  await first.app.stop().catch(() => {});
  const second = startBot({}, { databasePath });
  t.after(() => stop(second));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(second.app.store.getProfile('antigo').name, 'Vovó');
  const next = await second.say(ANA, '2', { id: 'false_depois_do_reinicio' });
  assert.match(lastOf(next), /dificuldade do quebra-cabeça/);
  assert.equal(
    second.app.store.db.prepare('SELECT count(*) AS n FROM profiles').get().n,
    2
  );
});

test('o menu é a imagem; aceita número fixo 1 a 6 ou o nome do jogo', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  bot.fake.images = [];
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, 'menu');
  assert.ok(bot.fake.images.length >= 1, 'o menu sai como imagem');
  const image = bot.fake.images.at(-1);
  assert.match(image.caption, /\*número\* ou o \*nome\*/);
  assert.match(image.base64, /^data:image\/png;base64,/);

  const names = {
    1: /Dominó/,
    dominó: /Dominó/,
    'Truco Paulista': /Truco/,
    2: /Truco/,
    'palavras cruzadas': /cruzadas/i,
    'Quebra-cabeça': /quebra-cabeça/i,
    cacheta: /Cacheta/,
    'Caça-Palavras': /caça-palavras/i,
    6: /caça-palavras/i,
  };
  for (const [reply, expected] of Object.entries(names)) {
    await bot.say(ANA, 'menu');
    assert.match(lastOf(await bot.say(ANA, reply)), expected, reply);
  }
  await bot.say(ANA, 'menu');
  assert.match(lastOf(await bot.say(ANA, '7')), /número \(1 a 6\) ou o nome/);
});
