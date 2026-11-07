import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { issueWhatsappInvitation } from '../invitations/service.mjs';

function table(options = {}, gameId = 'domino') {
  const ctx = setup({ online: () => true });
  const ana = ctx.person('Ana');
  const beto = ctx.person('Beto');
  const room = ctx.rooms.createRoom(ana, {
    gameId,
    mode: 'online',
    turnSeconds: 0,
    ...options,
  });
  ctx.rooms.startRoom(room, beto);
  ctx.rooms.save(room);
  return { ...ctx, ana, beto, room };
}

test('mesa antiga sem lugares abre com todos presentes', () => {
  const { rooms, store, ana } = table();
  const stored = store.getRoom(rooms.listActive(ana.id)[0].id);
  delete stored.seats;
  delete stored.banned;
  rooms.normalizeRoom(stored);
  assert.deepEqual(
    stored.seats.map((seat) => seat.state),
    ['present', 'present']
  );
  const view = rooms.snapshot(stored, ana.id);
  assert.ok(view.players.every((player) => player.seat === 'present'));
});

test('sair em partida em andamento não encerra: um bot assume o lugar', () => {
  const { rooms, room, ana, beto } = table();
  rooms.perform(beto, room.id, 'leave');
  const current = rooms.roomFor(room.id, ana.id);
  assert.equal(current.status, 'PLAYING');
  assert.equal(rooms.stateOf(current, beto.id), 'away');
  assert.equal(current.game.currentPlayerId, ana.id, 'o bot já jogou por Beto');
  const view = rooms.snapshot(current, ana.id);
  assert.equal(view.players.find((p) => p.id === beto.id).seat, 'away');
  assert.match(view.notice.text, /Beto saiu/);
  assert.equal(current.game.playerIds.includes(beto.id), true);
  assert.equal(current.game.hands[beto.id].length <= 7, true);
});

test('sair de mesa que ainda espera amigos libera a vaga', () => {
  const { rooms, room, ana, beto } = table(
    { gameId: 'cards', capacity: 4 },
    'cards'
  );
  assert.equal(room.status, 'WAITING');
  rooms.perform(beto, room.id, 'leave');
  const current = rooms.roomFor(room.id, ana.id);
  assert.deepEqual(current.playerIds, [ana.id]);
  assert.equal(current.status, 'WAITING');
});

test('duas jogadas automáticas seguidas deixam o lugar ausente', () => {
  const ctx = setup({ online: () => true });
  const ana = ctx.person('Ana');
  const room = ctx.rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'bot',
    difficulty: 'easy',
    turnSeconds: 30,
  });
  ctx.advance(31000);
  ctx.rooms.sweep();
  assert.equal(
    ctx.rooms.stateOf(ctx.rooms.roomFor(room.id, ana.id), ana.id),
    'present'
  );
  ctx.advance(31000);
  ctx.rooms.sweep();
  const current = ctx.rooms.roomFor(room.id, ana.id);
  assert.equal(ctx.rooms.stateOf(current, ana.id), 'away');
  assert.match(current.notice.text, /ausente/);
});

test('quem volta retoma o lugar de onde o bot parou, com resumo', () => {
  const { rooms, room, ana, beto } = table();
  rooms.perform(beto, room.id, 'leave');
  const before = rooms.roomFor(room.id, ana.id);
  const handSize = before.game.hands[beto.id].length;
  const returned = rooms.resume(room.id, beto);
  assert.equal(rooms.stateOf(returned, beto.id), 'present');
  assert.match(returned.notice.text, /Beto voltou à mesa/);
  assert.equal(returned.game.hands[beto.id].length, handSize, 'mão preservada');
  assert.equal(returned.game.score[beto.id].wins, 0);
});

test('ausente que volta pelo próprio jogo reassume e o bot não joga mais por ele', () => {
  const { rooms, room, ana, beto } = table();
  rooms.perform(ana, room.id, 'leave'); // dono sai; a posse passa a Beto
  const current = rooms.resume(room.id, ana);
  assert.equal(rooms.stateOf(current, ana.id), 'present');
  assert.equal(current.ownerId, beto.id);
});

test('dono retira jogador: lugar vira bot, retirado não reentra e entra em outra mesa', () => {
  const { rooms, store, room, ana, beto, clock } = table();
  assert.throws(
    () => rooms.perform(beto, room.id, 'remove', { playerId: ana.id }),
    /Somente o dono/
  );
  assert.throws(
    () => rooms.perform(ana, room.id, 'remove', { playerId: ana.id }),
    /a si mesmo/
  );
  rooms.perform(ana, room.id, 'remove', { playerId: beto.id });
  const current = rooms.roomFor(room.id, ana.id);
  assert.equal(rooms.stateOf(current, beto.id), 'removed');
  assert.equal(current.status, 'PLAYING');
  assert.match(current.notice.text, /Beto foi retirado/);
  assert.throws(() => rooms.roomFor(room.id, beto.id), /retirou você/);
  assert.throws(
    () => rooms.perform(beto, room.id, 'action', { revision: 0 }),
    /retirou você/
  );
  assert.equal(rooms.listActive(beto.id).length, 0);
  // Uma mesa por vez: a nova mesa de Ana encerra a antiga e fica aberta para Beto.
  const other = rooms.createRoom(ana, { gameId: 'domino', mode: 'online' });
  const { code } = issueWhatsappInvitation(store, other, clock.time);
  assert.equal(rooms.joinByCode(beto, code).already, false);
  // E o convite da mesa antiga continua recusado.
  const { code: oldCode } = issueWhatsappInvitation(store, current, clock.time);
  assert.throws(
    () => rooms.joinByCode(beto, oldCode),
    /retirou você|encerrada|inválido/
  );
});

test('dono que sai passa a posse a um humano sorteado; só o dono encerra', () => {
  const ctx = setup({ online: () => true });
  const [ana, beto, caio] = ['Ana', 'Beto', 'Caio'].map(ctx.person);
  const room = ctx.rooms.createRoom(ana, {
    gameId: 'cards',
    mode: 'online',
    capacity: 4,
    turnSeconds: 0,
  });
  for (const guest of [beto, caio, ctx.person('Dia')])
    ctx.rooms.startRoom(room, guest);
  ctx.rooms.save(room);
  assert.equal(room.status, 'PLAYING');
  const owners = new Set();
  for (let i = 0; i < 25; i++) {
    const copy = structuredClone(room);
    ctx.rooms.leave(copy, ana);
    owners.add(copy.ownerId);
    assert.ok([beto.id, caio.id, room.playerIds[3]].includes(copy.ownerId));
    assert.match(copy.notice.text, /agora é o dono/);
    assert.equal(copy.status, 'PLAYING');
  }
  assert.ok(owners.size > 1, 'a escolha é aleatória entre os humanos');
  assert.throws(
    () => ctx.rooms.perform(beto, room.id, 'close'),
    /Somente o dono/
  );
  ctx.rooms.perform(ana, room.id, 'close');
  assert.equal(ctx.rooms.roomFor(room.id, ana.id).status, 'CLOSED');
});

test('dono sai e só restam bots: a mesa espera e a inatividade cancela', () => {
  const ctx = setup({ online: () => false });
  const ana = ctx.person('Ana');
  const room = ctx.rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'bot',
    difficulty: 'easy',
    turnSeconds: 0,
  });
  ctx.rooms.perform(ana, room.id, 'leave');
  const current = ctx.rooms.roomFor(room.id, ana.id);
  assert.equal(current.ownerId, ana.id);
  assert.equal(current.status, 'PLAYING');
  ctx.advance(5 * 60000 + 1000);
  const [closed] = ctx.rooms.sweep();
  assert.equal(closed.closedReason, 'inactive');
});

test('uma pessoa joga uma mesa por vez: criar outra encerra a antiga', () => {
  const ctx = setup({});
  const ana = ctx.person('Ana');
  const first = ctx.rooms.createRoom(ana, { gameId: 'cards', mode: 'bot' });
  const second = ctx.rooms.createRoom(ana, { gameId: 'domino', mode: 'bot' });
  const rooms = ctx.rooms.listActive(ana.id);
  assert.deepEqual(
    rooms.map((room) => room.id),
    [second.id]
  );
  const old = ctx.rooms.normalizeRoom(ctx.store.getRoom(first.id));
  assert.equal(old.status, 'CLOSED');
  assert.equal(old.closedReason, 'replaced');
  for (let i = 0; i < 5; i++)
    ctx.rooms.createRoom(ana, { gameId: 'cards', mode: 'bot' });
  assert.equal(ctx.rooms.listActive(ana.id).length, 1);
});
