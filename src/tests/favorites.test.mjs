import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../backend/store.mjs';
import { startBot, register, lastOf } from './helpers.mjs';

const NUMBERS = {
  Ana: '5511911111111',
  Bia: '5511922222222',
  Caio: '5511933333333',
  Dede: '5511944444444',
  Eva: '5511955555555',
};
const MIN = 60000;
const stop = (bot) =>
  bot.app.server.listening ? bot.app.stop() : bot.app.store.close();

async function boot(names = ['Ana', 'Bia', 'Caio']) {
  const clock = { time: Date.now() };
  const bot = startBot({}, { clock: () => clock.time });
  const say = (who, text) =>
    bot.say(NUMBERS[who] ?? who, text, {
      timestamp: Math.floor(clock.time / 1000),
    });
  const profile = (name) =>
    bot.app.store.db
      .prepare(
        "SELECT data FROM profiles WHERE json_extract(data,'$.name') = ?"
      )
      .all(name)
      .map((row) => JSON.parse(row.data))[0];
  for (const name of names) {
    await say(name, 'oi');
    await say(name, name);
  }
  const { rooms } = bot.app;
  const ctx = { bot, clock, say, profile, rooms, favorites: rooms.favorites };
  // Amizade pelo link: entra numa mesa de dominó do dono e a encerra.
  ctx.befriend = (ownerName, guestName) => {
    const owner = profile(ownerName);
    const room = rooms.createRoom(owner, { gameId: 'domino', mode: 'online' });
    rooms.joinRoom(profile(guestName), room);
    rooms.perform(owner, room.id, 'close');
  };
  // Mesa de Truco esperando amigos, já como mesa atual da conversa do dono.
  ctx.waitingTable = (ownerName, gameId = 'cards', capacity = 4) => {
    const owner = profile(ownerName);
    const room = rooms.createRoom(owner, { gameId, mode: 'online', capacity });
    bot.app.store.saveConversation(owner.id, {
      state: 'IN_ROOM',
      roomId: room.id,
    });
    return room;
  };
  ctx.drain = () => {
    for (const who of Object.keys(NUMBERS)) bot.fake.take(NUMBERS[who]);
  };
  return ctx;
}

const buttonsOf = (bot, number) =>
  bot.fake.interactive.filter((item) => item.phone === `${number}@c.us`).at(-1)
    ?.body.options.buttons;

test('migração dos contatos é idempotente e a lista persiste após reinício', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesa-fav-'));
  const file = join(dir, 'mesa.sqlite');
  try {
    const first = openStore(file);
    first.db
      .prepare('INSERT INTO profiles VALUES (?, ?)')
      .run('ana', '{"id":"ana","name":"Ana","contacts":["bia","caio"]}');
    first.close();
    for (let i = 0; i < 2; i++) {
      const again = openStore(file);
      const rows = again.db
        .prepare('SELECT * FROM favorites ORDER BY friend_id')
        .all();
      assert.deepEqual(
        rows.map((row) => [row.owner_id, row.friend_id, row.state]),
        [
          ['ana', 'bia', 'accepted'],
          ['ana', 'caio', 'accepted'],
        ]
      );
      again.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contatos e favoritos ficam em sincronia e remover revoga convites direcionados', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const ana = ctx.profile('Ana');
  const bia = ctx.profile('Bia');
  ctx.bot.app.store.saveProfile({ ...ana, contacts: [bia.id] });
  assert.equal(ctx.favorites.get(ana.id, bia.id).state, 'accepted');
  const directed = ctx.rooms.createRoom(ctx.profile('Ana'), {
    gameId: 'domino',
    mode: 'online',
    targetId: bia.id,
  });
  ctx.rooms.removeFavorite(ana, bia.id);
  assert.equal(ctx.favorites.get(ana.id, bia.id), null);
  assert.equal(ctx.bot.app.store.getProfile(ana.id).contacts.length, 0);
  assert.equal(ctx.bot.app.store.getRoom(directed.id).status, 'CLOSED');
});

test('comandos favoritos, remover e parar convites', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  assert.match(
    lastOf(await ctx.say('Ana', 'favoritos')),
    /ainda não tem favoritos/
  );
  ctx.befriend('Ana', 'Bia');
  ctx.befriend('Ana', 'Caio');
  const list = lastOf(await ctx.say('Ana', 'favoritos'));
  assert.match(list, /Bia/);
  assert.match(list, /Caio/);
  assert.match(
    lastOf(await ctx.say('Ana', 'remover 1')),
    /saiu dos seus favoritos/
  );
  assert.equal(ctx.favorites.list(ctx.profile('Ana').id).length, 1);
  assert.match(lastOf(await ctx.say('Ana', 'remover 9')), /favoritos/);
  assert.match(
    lastOf(await ctx.say('Bia', 'parar convites')),
    /ninguém mais chama você/
  );
  assert.equal(ctx.profile('Bia').noInvites, true);
  assert.match(
    lastOf(await ctx.say('Bia', 'receber convites')),
    /podem chamar/
  );
});

test('entrar pelo link aceita nos dois sentidos, sem pergunta extra', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const room = ctx.waitingTable('Ana', 'domino', 2);
  const { code } = (
    await import('../invitations/service.mjs')
  ).issueWhatsappInvitation(ctx.bot.app.store, room, ctx.clock.time);
  ctx.drain();
  const answer = await ctx.say('Bia', `ENTRAR ${code}`);
  assert.ok(!answer.join(' ').includes('Aceita receber'));
  const ana = ctx.profile('Ana');
  const bia = ctx.profile('Bia');
  assert.equal(ctx.favorites.get(ana.id, bia.id).state, 'accepted');
  assert.equal(ctx.favorites.get(bia.id, ana.id).state, 'accepted');
});

test('chamado a quem não aceitou só entrega depois do Sim', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const ana = ctx.profile('Ana');
  const caio = ctx.profile('Caio');
  ctx.favorites.set(ana.id, caio.id, 'pending');
  const room = ctx.waitingTable('Ana');
  ctx.drain();
  await ctx.say('Ana', 'chamar');
  const asked = ctx.bot.fake.take(NUMBERS.Caio).join('\n');
  assert.match(asked, /Ana quer chamar você para jogar/);
  assert.match(asked, /Aceita receber convites de Ana/);
  assert.ok(!/quer jogar/.test(asked), 'nada é entregue antes do Sim');
  assert.deepEqual(
    buttonsOf(ctx.bot, NUMBERS.Caio).map((b) => b.text),
    ['Sim', 'Não', 'Bloquear']
  );
  const after = (await ctx.say('Caio', `c:${ana.id}:y`)).join('\n');
  assert.match(after, /pode chamar você/);
  assert.match(after, /Ana quer jogar \*Truco paulista\*\. Entrar\?/);
  assert.equal(ctx.favorites.get(ana.id, caio.id).state, 'accepted');
  assert.equal(ctx.favorites.get(ana.id, caio.id).call_payload, null);
  assert.doesNotMatch(
    ctx.bot.fake.take(NUMBERS.Ana).join('\n'),
    /Caio aceitou/
  );
  assert.ok(room.id);
});

test('responder Não espera 7 dias sem revelar o motivo e Bloquear é definitivo', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const ana = ctx.profile('Ana');
  const bia = ctx.profile('Bia');
  const caio = ctx.profile('Caio');
  ctx.favorites.set(ana.id, bia.id, 'pending');
  ctx.favorites.set(ana.id, caio.id, 'pending');
  ctx.waitingTable('Ana');
  ctx.drain();
  await ctx.say('Ana', 'chamar');
  await ctx.say('Bia', `c:${ana.id}:n`);
  await ctx.say('Caio', `c:${ana.id}:b`);
  assert.equal(ctx.favorites.get(ana.id, bia.id).state, 'declined');
  assert.equal(ctx.favorites.get(ana.id, caio.id).state, 'blocked');
  ctx.drain();

  ctx.clock.time += 6 * MIN;
  const retry = (await ctx.say('Ana', 'chamar')).join('\n');
  assert.match(retry, /Nenhum favorito está disponível/);
  assert.ok(!/recus|bloque|não quis/i.test(retry), 'sem revelar o motivo');
  assert.equal(ctx.bot.fake.take(NUMBERS.Bia).length, 0);
  assert.equal(ctx.bot.fake.take(NUMBERS.Caio).length, 0);

  ctx.clock.time += 7 * 24 * 60 * MIN;
  ctx.waitingTable('Ana');
  await ctx.say('Ana', 'chamar');
  assert.match(ctx.bot.fake.take(NUMBERS.Bia).join('\n'), /Aceita receber/);
  assert.equal(ctx.bot.fake.take(NUMBERS.Caio).length, 0, 'bloqueio permanece');
});

test('chamado respeita parar convites, quem está jogando e o limite de tempo', async (t) => {
  const ctx = await boot(['Ana', 'Bia', 'Caio', 'Dede', 'Eva']);
  t.after(() => stop(ctx.bot));
  for (const name of ['Bia', 'Caio', 'Dede', 'Eva']) ctx.befriend('Ana', name);
  await ctx.say('Bia', 'parar convites');
  ctx.rooms.createRoom(ctx.profile('Dede'), {
    gameId: 'domino',
    mode: 'bot',
    difficulty: 'easy',
  });
  ctx.favorites.set(ctx.profile('Ana').id, ctx.profile('Eva').id, 'blocked');
  const room = ctx.waitingTable('Ana');
  ctx.drain();

  const first = (await ctx.say('Ana', 'chamar')).join('\n');
  assert.match(first, /Chamei 1 favorito/);
  assert.match(first, /2 não está\(ão\) disponível/);
  const call = ctx.bot.fake.take(NUMBERS.Caio).join('\n');
  assert.match(call, /Ana quer jogar \*Truco paulista\*\. Entrar\?/);
  assert.deepEqual(
    buttonsOf(ctx.bot, NUMBERS.Caio).map((b) => b.text),
    ['Entrar', 'Agora não']
  );
  for (const who of ['Bia', 'Dede', 'Eva'])
    assert.ok(
      !ctx.bot.fake.take(NUMBERS[who]).join('').includes('quer jogar'),
      `${who} não recebe`
    );

  // Repetir antes de 5 minutos pede para aguardar e informa o tempo.
  ctx.clock.time += MIN;
  assert.match(lastOf(await ctx.say('Ana', 'chamar')), /Aguarde 4 min/);

  // Três chamados por hora por pessoa.
  ctx.clock.time += 5 * MIN;
  assert.match(lastOf(await ctx.say('Ana', 'chamar')), /Chamei/);
  ctx.clock.time += 6 * MIN;
  assert.match(lastOf(await ctx.say('Ana', 'chamar')), /Chamei/);
  ctx.clock.time += 6 * MIN;
  assert.match(
    lastOf(await ctx.say('Ana', 'chamar')),
    /3 chamados na última hora/
  );
  ctx.clock.time += 60 * MIN;
  assert.match(lastOf(await ctx.say('Ana', 'chamar')), /Chamei/);
  assert.ok(room.id);
});

test('no máximo 20 destinatários por chamado', async (t) => {
  const ctx = await boot(['Ana']);
  t.after(() => stop(ctx.bot));
  for (let i = 0; i < 22; i++) {
    const number = `55119500000${String(i).padStart(2, '0')}`;
    await register(ctx.bot, number, `Amigo ${i}`);
  }
  const ana = ctx.profile('Ana');
  for (const row of ctx.bot.app.store.db
    .prepare(
      "SELECT data FROM profiles WHERE json_extract(data,'$.name') LIKE 'Amigo%'"
    )
    .all())
    ctx.favorites.set(ana.id, JSON.parse(row.data).id, 'accepted');
  ctx.waitingTable('Ana', 'cards', 4);
  ctx.bot.fake.sent = [];
  const answer = (await ctx.say('Ana', 'chamar')).join('\n');
  assert.match(answer, /Chamei 20 favorito/);
  const calls = ctx.bot.fake.sent.filter((m) => /quer jogar/.test(m.message));
  assert.equal(calls.length, 20);
});

test('Entrar com lugar, sala cheia com botão Criar outra sala e mesa que sumiu', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  ctx.befriend('Ana', 'Bia');
  ctx.befriend('Ana', 'Caio');
  const room = ctx.waitingTable('Ana', 'domino', 2);
  ctx.drain();
  await ctx.say('Ana', 'chamar');
  assert.match(ctx.bot.fake.take(NUMBERS.Bia).join('\n'), /quer jogar/);
  assert.match(ctx.bot.fake.take(NUMBERS.Caio).join('\n'), /quer jogar/);

  // Há lugar: Bia entra e a partida começa.
  const joined = (await ctx.say('Bia', `j:${room.id}`)).join('\n');
  assert.match(joined, /Você entrou na mesa de Ana/);
  assert.equal(ctx.bot.app.store.getRoom(room.id).status, 'PLAYING');

  // Chegou tarde: sala cheia + botão.
  const late = (await ctx.say('Caio', `j:${room.id}`)).join('\n');
  assert.match(late, /Infelizmente a sala está cheia\./);
  assert.deepEqual(buttonsOf(ctx.bot, NUMBERS.Caio), [
    { id: 'n:domino', text: 'Criar outra sala' },
  ]);
  const created = lastOf(await ctx.say('Caio', 'n:domino'));
  assert.match(created, /como você quer jogar/);
});

test('Entrar em mesa encerrada avisa e mostra o menu; Agora não responde sem entrar', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  ctx.befriend('Ana', 'Bia');
  ctx.befriend('Ana', 'Caio');
  const room = ctx.waitingTable('Ana', 'domino', 2);
  ctx.drain();
  await ctx.say('Ana', 'chamar');
  ctx.drain();
  assert.match(
    lastOf(await ctx.say('Bia', `x:${room.id}`)),
    /Fica para a próxima/
  );
  ctx.rooms.perform(ctx.profile('Ana'), room.id, 'close');
  const gone = (await ctx.say('Caio', `j:${room.id}`)).join('\n');
  assert.match(gone, /Essa mesa não existe mais/);
  assert.match(gone, /\[imagem\]/);
  // Quem nunca foi chamado não consegue entrar por um toque forjado.
  assert.match(
    lastOf(
      await ctx.say('Bia', `j:${ctx.waitingTable('Caio', 'domino', 2).id}`)
    ),
    /não é mais válido/
  );
});

test('texto sem botões: SIM e ENTRAR respondem ao pedido pendente', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const ana = ctx.profile('Ana');
  ctx.favorites.set(ana.id, ctx.profile('Bia').id, 'pending');
  ctx.befriend('Ana', 'Caio');
  const room = ctx.waitingTable('Ana', 'domino', 2);
  ctx.drain();
  await ctx.say('Ana', 'chamar');
  ctx.drain();
  assert.match(lastOf(await ctx.say('Bia', 'sim')), /Ana quer jogar/);
  const joined = await ctx.say('Caio', 'entrar');
  assert.match(joined.join('\n'), /Você entrou|partida/);
  assert.match(lastOf(joined), /^http:\/\/web\.test\/m\/[\w-]{43}$/);
  assert.equal(ctx.bot.app.store.getRoom(room.id).status, 'PLAYING');
});

function seedResults(ctx) {
  const ana = ctx.profile('Ana').id;
  const bia = ctx.profile('Bia').id;
  const caio = ctx.profile('Caio').id;
  ctx.favorites.set(ana, bia, 'accepted');
  ctx.favorites.set(ana, caio, 'accepted');
  const insert = ctx.bot.app.store.db.prepare(
    'INSERT INTO match_results VALUES (?, ?, 1, ?, ?, ?, ?, ?)'
  );
  const add = (id, game, humans, winners) =>
    insert.run(
      id,
      id,
      game,
      1,
      JSON.stringify(humans),
      JSON.stringify(winners),
      '{}'
    );
  add('r1', 'domino', [ana, bia], [ana]);
  add('r2', 'domino', [ana, bia], [bia]);
  add('r3', 'domino', [ana, bia], [bia]);
  add('r4', 'cards', [ana, caio], [caio]);
  add('r5', 'domino', [ana, bia, 'desconhecido'], [ana]);
  return { ana, bia, caio };
}

test('ranking ordena por vitórias, taxa e partidas, filtra por jogo e ignora desconhecidos', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const { ana, bia, caio } = seedResults(ctx);
  const all = ctx.favorites.ranking(ana);
  assert.deepEqual(
    all.map((row) => [row.id, row.wins, row.games, row.rate]),
    [
      [bia, 2, 3, 67],
      [caio, 1, 1, 100],
      [ana, 1, 4, 25],
    ]
  );
  const domino = ctx.favorites.ranking(ana, 'domino');
  assert.deepEqual(
    domino.map((row) => row.id),
    [bia, ana, caio]
  );
  const text = (await ctx.say('Ana', 'ranking')).join('\n');
  assert.match(text, /1\. Bia — 2 vitória\(s\) em 3 partida\(s\) \(67%\)/);
  assert.match(text, /Ana \(você\)/);
  assert.ok(!/55\d{9}/.test(text), 'sem telefones');
  assert.match(lastOf(await ctx.say('Ana', 'ranking truco')), /Truco/);
});

test('resultado é gravado uma vez por rodada, ignora bots e partidas canceladas', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  const ana = ctx.profile('Ana');
  const room = ctx.rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'bot',
    difficulty: 'easy',
  });
  const count = () =>
    ctx.bot.app.store.db
      .prepare('SELECT count(*) AS n FROM match_results')
      .get().n;
  // Partida cancelada (não terminou): nada gravado.
  ctx.rooms.perform(ana, room.id, 'close');
  assert.equal(count(), 0);

  const second = ctx.rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'bot',
    difficulty: 'easy',
  });
  const stored = ctx.rooms.normalizeRoom(ctx.bot.app.store.getRoom(second.id));
  stored.game.status = 'FINISHED';
  stored.game.result = { winnerId: ana.id, reason: 'x', points: 10 };
  ctx.rooms.save(stored);
  ctx.rooms.save(stored);
  assert.equal(count(), 1, 'sem duplicar');
  const row = ctx.bot.app.store.db.prepare('SELECT * FROM match_results').get();
  assert.deepEqual(JSON.parse(row.humans), [ana.id], 'bots ignorados');
  assert.deepEqual(JSON.parse(row.winners), [ana.id]);

  // Revanche: nova rodada, novo resultado.
  stored.round = 2;
  ctx.rooms.save(stored);
  assert.equal(count(), 2);
});

test('tela do site: ranking por API só com nomes e números', async (t) => {
  const ctx = await boot();
  t.after(() => stop(ctx.bot));
  ctx.bot.app.server.listen(0, '127.0.0.1');
  await once(ctx.bot.app.server, 'listening');
  const origin = `http://127.0.0.1:${ctx.bot.app.server.address().port}`;
  const first = await fetch(`${origin}/api/me`);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const me = await first.json();
  const bia = ctx.profile('Bia');
  ctx.favorites.set(me.id, bia.id, 'accepted');
  ctx.bot.app.store.db
    .prepare('INSERT INTO match_results VALUES (?, ?, 1, ?, ?, ?, ?, ?)')
    .run(
      's1',
      's1',
      'domino',
      1,
      JSON.stringify([me.id, bia.id]),
      JSON.stringify([bia.id]),
      '{}'
    );
  const res = await fetch(`${origin}/api/ranking`, {
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.deepEqual(
    rows.map((row) => [row.name, row.me, row.wins, row.games, row.rate]),
    [
      ['Bia', false, 1, 1, 100],
      ['Jogador', true, 0, 1, 0],
    ]
  );
  assert.ok(!JSON.stringify(rows).match(/55\d{9}/));
});
