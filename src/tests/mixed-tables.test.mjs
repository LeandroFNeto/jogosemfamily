import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { teamOf } from '../games/cards/engine.mjs';

const truco = (extra) => ({
  gameId: 'cards',
  mode: 'online',
  capacity: 4,
  ...extra,
});

test('Truco com duas pessoas e dois bots: bots entram na criação e a partida começa na segunda pessoa', () => {
  const { rooms, person, store } = setup();
  const [ana, bia] = ['Ana', 'Bia'].map(person);
  const room = rooms.createRoom(ana, truco({ botSeats: 2 }));
  assert.equal(room.status, 'WAITING');
  assert.equal(room.botIds.length, 2);
  assert.equal(room.humanSeats, 2);
  assert.equal(room.playerIds.length, 3, 'dono + 2 bots já na mesa');
  rooms.joinRoom(bia, room);
  const started = rooms.normalizeRoom(store.getRoom(room.id));
  assert.equal(started.status, 'PLAYING');
  assert.equal(started.playerIds.length, 4);
  // Truco é sempre 2 contra 2.
  for (const team of [0, 1])
    assert.equal(
      started.playerIds.filter((id) => teamOf(started.game, id) === team)
        .length,
      2
    );
});

test('Truco com três pessoas e um bot: o bot fica na equipe com menos pessoas', () => {
  const { rooms, person, store } = setup();
  const people = ['Ana', 'Bia', 'Caio'].map(person);
  const room = rooms.createRoom(people[0], truco({ botSeats: 1 }));
  assert.equal(room.playerIds.length, 2);
  rooms.joinRoom(people[1], rooms.normalizeRoom(store.getRoom(room.id)));
  assert.equal(rooms.normalizeRoom(store.getRoom(room.id)).status, 'WAITING');
  rooms.joinRoom(people[2], rooms.normalizeRoom(store.getRoom(room.id)));
  const started = rooms.normalizeRoom(store.getRoom(room.id));
  assert.equal(started.status, 'PLAYING');
  const humansByTeam = [0, 1].map(
    (team) =>
      started.playerIds.filter(
        (id) =>
          teamOf(started.game, id) === team && !started.botIds.includes(id)
      ).length
  );
  assert.deepEqual(humansByTeam.toSorted(), [1, 2]);
  const botTeam = teamOf(started.game, started.botIds[0]);
  assert.equal(
    humansByTeam[botTeam],
    1,
    'o bot completa a equipe que tem menos pessoas'
  );
});

test('configuração sem pessoas é recusada e explica o motivo', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  assert.throws(
    () => rooms.createRoom(ana, truco({ botSeats: 4 })),
    /pelo menos uma pessoa/
  );
  assert.throws(
    () => rooms.createRoom(ana, truco({ humanSeats: 0 })),
    /pelo menos uma pessoa/
  );
  assert.throws(
    () => rooms.createRoom(ana, truco({ botSeats: -1 })),
    /inválida/
  );
});

test('todos os bots têm o mesmo nível e aparecem marcados como bot', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  const room = rooms.createRoom(ana, truco({ humanSeats: 2 }));
  const view = rooms.snapshot(room, ana.id);
  const bots = view.players.filter((player) => player.bot);
  assert.equal(bots.length, 2);
  assert.ok(bots.every((bot) => /^Bot \d$/.test(bot.name)));
  assert.equal(view.difficulty, 'medium');
  assert.equal(view.humanSeats, 2);
  assert.equal(view.botSeats, 2);
});

test('bots pedidos na criação viram as mesas de sempre', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  const half = rooms.createRoom(ana, truco({ botSeats: 2 }));
  assert.equal(half.mode, 'online');
  const all = rooms.createRoom(ana, truco({ botSeats: 3 }));
  assert.equal(all.mode, 'bot', 'só um humano: joga contra bots');
  assert.equal(all.status, 'PLAYING');
  const alone = rooms.createRoom(ana, truco({ mode: 'bot' }));
  assert.equal(alone.botSeats, 3);
});

test('bots não entram no ranking de uma partida mista', () => {
  const { rooms, person, store } = setup();
  const [ana, bia] = ['Ana', 'Bia'].map(person);
  const room = rooms.createRoom(ana, truco({ botSeats: 2 }));
  rooms.joinRoom(bia, room);
  const started = rooms.normalizeRoom(store.getRoom(room.id));
  started.game.status = 'FINISHED';
  started.game.result = {
    winnerId: started.botIds[0],
    winnerIds: [started.botIds[0], started.playerIds[0]],
    winnerTeam: 0,
    points: 12,
  };
  rooms.save(started);
  const row = store.db.prepare('SELECT * FROM match_results').get();
  const humans = JSON.parse(row.humans);
  assert.equal(humans.length, 2);
  assert.ok(humans.every((id) => !started.botIds.includes(id)));
  assert.ok(
    JSON.parse(row.winners).every((id) => !started.botIds.includes(id))
  );
  const ranking = rooms.favorites.ranking(ana.id);
  assert.ok(ranking.every((entry) => !started.botIds.includes(entry.id)));
});

test('mesa salva no formato anterior continua abrindo', () => {
  const { rooms, person, store } = setup();
  const ana = person('Ana');
  const room = rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'bot',
    difficulty: 'easy',
  });
  const legacy = JSON.parse(JSON.stringify(store.getRoom(room.id)));
  delete legacy.botSeats;
  delete legacy.humanSeats;
  store.saveRoom(legacy);
  const reopened = rooms.normalizeRoom(store.getRoom(room.id));
  assert.equal(reopened.botSeats, 1);
  assert.equal(reopened.humanSeats, 1);
  assert.ok(rooms.snapshot(reopened, ana.id).game);
});

test('WhatsApp: Truco é sempre 2 contra 2 e não pergunta lugares nem dificuldade', async () => {
  const { startBot, register, lastOf } = await import('./helpers.mjs');
  const bot = startBot();
  try {
    await register(bot, '5511911111111', 'Ana');
    await bot.say('5511911111111', 'menu');
    const ask = async (text) => lastOf(await bot.say('5511911111111', text));
    await ask('2'); // Truco
    await ask('1'); // com amigos: cria a mesa na hora
    const ana = bot.app.store.db
      .prepare(
        "SELECT data FROM profiles WHERE json_extract(data,'$.name') = 'Ana'"
      )
      .get();
    const [room] = bot.app.rooms.listActive(JSON.parse(ana.data).id);
    assert.equal(room.mode, 'online');
    assert.equal(room.capacity, 4);
    assert.equal(room.status, 'WAITING');

    // Contra bots também começa na hora, sem perguntar dificuldade.
    await ask('menu');
    await ask('2');
    await ask('2');
    const rooms = bot.app.rooms.listActive(JSON.parse(ana.data).id);
    assert.ok(
      rooms.some((item) => item.mode === 'bot' && item.status === 'PLAYING')
    );
  } finally {
    bot.app.store.close();
  }
});
