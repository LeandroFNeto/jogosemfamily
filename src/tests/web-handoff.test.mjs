import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startBot, register, lastOf, codeOf } from './helpers.mjs';
import { openStore } from '../backend/store.mjs';
import {
  issueWebLink,
  hasWebLink,
  redeemWebLink,
  WEB_LINK_TTL,
} from '../invitations/web-links.mjs';
import { AppError } from '../shared/errors.mjs';

const ANA = '5511911111111';
const BIA = '5511922222222';
const NL = String.fromCharCode(10);
const LINK = /http:\/\/web\.test\/m\/([\w-]{43})/;
const stop = (bot) =>
  bot.app.server.listening ? bot.app.stop() : bot.app.store.close();

const open = (origin, token) =>
  fetch(`${origin}/m/${token}`, { method: 'POST', redirect: 'manual' });

const linkOf = (messages) => LINK.exec([messages].flat().join(NL))?.[1];

async function listen(bot) {
  bot.app.server.listen(0, '127.0.0.1');
  await once(bot.app.server, 'listening');
  return `http://127.0.0.1:${bot.app.server.address().port}`;
}

function profileAndRoom(store) {
  const profile = {
    id: 'perfil-1',
    name: 'Ana',
    photo: '',
    preferences: {},
    contacts: [],
  };
  store.saveProfile(profile);
  return { profile, roomId: 'mesa-1' };
}

test('link pessoal: guardado só como hash, reutilizável e vale 24 horas', () => {
  const store = openStore(':memory:');
  const { profile, roomId } = profileAndRoom(store);
  const now = 1_800_000_000_000;
  const { token } = issueWebLink(store, profile.id, roomId, now);
  assert.match(token, /^[\w-]{43}$/);
  const stored = store.db.prepare('SELECT * FROM web_links').all();
  assert.equal(stored.length, 1);
  assert.ok(!JSON.stringify(stored).includes(token), 'o token não é guardado');
  assert.equal(stored[0].expires, now + WEB_LINK_TTL);
  assert.deepEqual(redeemWebLink(store, token, now + 1000), {
    profileId: profile.id,
    roomId,
  });
  assert.equal(
    redeemWebLink(store, token, now + 2000).roomId,
    roomId,
    'o mesmo link abre de novo'
  );
  assert.ok(hasWebLink(store, profile.id, roomId, now + 3000));
  assert.ok(!hasWebLink(store, profile.id, roomId, now + WEB_LINK_TTL + 1));

  const late = issueWebLink(store, profile.id, roomId, now).token;
  assert.throws(
    () => redeemWebLink(store, late, now + WEB_LINK_TTL + 1),
    /não vale mais/
  );
  assert.throws(() => redeemWebLink(store, 'x'.repeat(43), now), AppError);
  assert.throws(() => redeemWebLink(store, 'curto', now), AppError);
  store.close();
});

test('um link novo invalida os anteriores da mesma pessoa e mesa', () => {
  const store = openStore(':memory:');
  const { profile, roomId } = profileAndRoom(store);
  const now = 1_800_000_000_000;
  const first = issueWebLink(store, profile.id, roomId, now).token;
  const second = issueWebLink(store, profile.id, roomId, now + 10).token;
  assert.throws(() => redeemWebLink(store, first, now + 20), AppError);
  assert.equal(redeemWebLink(store, second, now + 20).roomId, roomId);
  store.close();
});

test('/m/<token> abre a sessão do perfil, leva à mesa e continua ativo', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const origin = await listen(bot);
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '1');
  await bot.say(ANA, '1');
  const invite = await bot.say(ANA, '1');
  const token = linkOf(invite);
  assert.ok(token, 'o dono recebe o link ao criar a mesa');
  const roomId = bot.app.store.db.prepare('SELECT id FROM rooms').get().id;

  // Prévia de link (GET) mostra o botão e não gasta o acesso.
  for (let i = 0; i < 2; i++) {
    const preview = await fetch(`${origin}/m/${token}`);
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /Abrir minha partida/);
  }
  const opened = await open(origin, token);
  assert.equal(opened.status, 303);
  assert.equal(opened.headers.get('location'), `/mesa/${roomId}`);
  const cookie = opened.headers.get('set-cookie');
  assert.match(cookie, /^mesa_session=[\w-]{43}; HttpOnly; SameSite=Lax/);

  const me = await (
    await fetch(`${origin}/api/me`, {
      headers: { cookie: cookie.split(';')[0] },
    })
  ).json();
  assert.equal(me.name, 'Ana', 'a sessão é do perfil que pediu o link');

  const again = await open(origin, token);
  assert.equal(again.status, 303, 'o link segue ativo');
  assert.ok(again.headers.get('set-cookie'));
  const gone = await open(origin, 'b'.repeat(43));
  assert.equal(gone.status, 404);
  assert.match(await gone.text(), /não vale mais/);
  assert.equal(
    (await open(origin, 'a'.repeat(43))).status,
    404,
    'token desconhecido recebe a mesma resposta'
  );
});

test('o link preserva sessões antigas e recusa mesa encerrada', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const origin = await listen(bot);
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '1');
  await bot.say(ANA, '1');
  const first = linkOf(await bot.say(ANA, '1'));
  const one = await open(origin, first);
  const oldCookie = one.headers.get('set-cookie').split(';')[0];
  const second = linkOf(await bot.say(ANA, 'jogo'));
  const two = await open(origin, second);
  const newCookie = two.headers.get('set-cookie').split(';')[0];
  assert.notEqual(oldCookie, newCookie);
  for (const cookie of [oldCookie, newCookie]) {
    const me = await (
      await fetch(`${origin}/api/me`, { headers: { cookie } })
    ).json();
    assert.equal(me.name, 'Ana');
  }

  const third = linkOf(await bot.say(ANA, 'jogo'));
  await bot.say(ANA, 'encerrar');
  await bot.say(ANA, 'sim');
  const closed = await open(origin, third);
  assert.equal(closed.status, 410);
  assert.match(await closed.text(), /já terminou/);
});

test('criar mesa contra bots define o jogo e envia o link', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '1');
  await bot.say(ANA, '2');
  const started = await bot.say(ANA, '1');
  const room = JSON.parse(
    bot.app.store.db.prepare('SELECT data FROM rooms').get().data
  );
  assert.equal(room.gameId, 'domino');
  assert.equal(room.difficulty, 'medium');
  assert.ok(room.botIds.length >= 1);
  const text = started.join(NL);
  assert.match(text, /A partida de \*Dominó\* começou/);
  assert.ok(linkOf(started));
  // O link vai sozinho na última mensagem, separado do texto de apoio.
  const last = started.at(-1);
  assert.match(last, /^http:\/\/web\.test\/m\/[\w-]{43}$/);
  assert.equal(started.filter((m) => m.includes('/m/')).length, 1);
  assert.doesNotMatch(text, /Suas peças|Sua mão/, 'nada do jogo vai ao chat');
});

test('sem origem web configurada o bot avisa e não envia link', async (t) => {
  const bare = startBot({ webBaseUrl: '' });
  t.after(() => stop(bare));
  await register(bare, ANA, 'Ana');
  await bare.say(ANA, '1');
  await bare.say(ANA, '2');
  const started = (await bare.say(ANA, '1')).join(NL);
  assert.match(started, /não está disponível/);
  assert.doesNotMatch(started, /\/m\//);
});

test('mensagem de jogada durante a partida não reenvia o link nem mexe no jogo', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '1');
  await bot.say(ANA, '2');
  const first = linkOf(await bot.say(ANA, '1'));
  bot.fake.take(ANA);
  const before = bot.app.store.db.prepare('SELECT data FROM rooms').get().data;
  const reply = await bot.say(ANA, '3');
  const after = bot.app.store.db.prepare('SELECT data FROM rooms').get().data;
  assert.equal(after, before, 'a jogada por texto não altera a mesa');
  const text = reply.join(NL);
  assert.match(text, /O jogo é na web/);
  assert.match(text, /\*jogo\*/);
  assert.equal(linkOf(reply), undefined, 'o link não é reenviado');
  // Só *jogo* pede o link de novo, e o antigo deixa de valer.
  const again = linkOf(await bot.say(ANA, 'jogo'));
  assert.ok(again);
  assert.notEqual(again, first);
  assert.throws(() => redeemWebLink(bot.app.store, first), AppError);
  assert.match(
    lastOf(await bot.say(ANA, 'revanche')),
    /só abre quando a rodada terminar/
  );
});

test('convidado que entra recebe o próprio link e a partida avisa os dois', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await register(bot, BIA, 'Bia');
  await bot.say(ANA, '1');
  await bot.say(ANA, '1');
  const invite = await bot.say(ANA, '1');
  const code = codeOf(invite);
  const ownerLink = linkOf(invite);
  const joined = await bot.say(BIA, `ENTRAR ${code}`);
  const guestLink = linkOf(bot.fake.take(BIA).concat(joined));
  assert.ok(ownerLink && guestLink && ownerLink !== guestLink);
  const anaStart = bot.fake.take(ANA).join(NL);
  assert.equal(anaStart, '', 'o dono não recebe aviso automático do jogo');

  const redeemGuest = redeemWebLink(bot.app.store, guestLink);
  const bia = bot.app.store.getProfile(redeemGuest.profileId);
  assert.equal(bia.name, 'Bia', 'o link do convidado é do perfil dele');
});

test('lembrete de tempo não vai para o WhatsApp', async (t) => {
  const clock = { time: Date.now() };
  const bot = startBot({}, { clock: () => clock.time });
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '1');
  await bot.say(ANA, '2');
  await bot.say(ANA, '1');
  const room = bot.app.rooms.listActive(
    bot.app.store.db
      .prepare(
        "SELECT id FROM profiles WHERE json_extract(data,'$.name')='Ana'"
      )
      .get().id
  )[0];
  const snapshot = bot.app.rooms.snapshot(room, room.playerIds[0]);
  if (snapshot.turn?.playerId !== room.playerIds[0]) return; // bot começa: sem lembrete
  bot.fake.take(ANA);
  clock.time += snapshot.turn.seconds * 1000 - 10_000;
  bot.app.whatsapp.tick();
  await bot.app.whatsapp.idle();
  assert.deepEqual(bot.fake.take(ANA), [], 'o tempo é avisado só na web');
});
