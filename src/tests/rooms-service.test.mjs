import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { issueWhatsappInvitation } from '../invitations/service.mjs';

test('serviço de mesas cria partida contra bots sem HTTP nem cookie', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  const room = rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'bot',
    difficulty: 'easy',
  });
  assert.equal(room.status, 'PLAYING');
  assert.equal(room.botIds.length, 1);
  const view = rooms.snapshot(room, ana.id);
  assert.equal(view.game.hand.length, 7);
  assert.equal(view.game.hands, undefined);
});

test('evento de mudança dispara uma vez por revisão salva', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  const seen = [];
  const off = rooms.onRoomChanged((room) => seen.push(room.revision));
  const room = rooms.createRoom(ana, {
    gameId: 'puzzle',
    mode: 'solo',
  });
  assert.deepEqual(seen, [], 'criar não notifica');
  rooms.perform(ana, room.id, 'action', {
    revision: room.revision,
    type: 'swap',
    from: 0,
    to: 1,
  });
  assert.deepEqual(seen, [1]);
  off();
  rooms.perform(ana, room.id, 'leave');
  assert.deepEqual(seen, [1], 'ouvinte removido não recebe mais');
});

test('ação com revisão antiga é recusada e quem não joga não acessa', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  const intruso = person('Intruso');
  const room = rooms.createRoom(ana, { gameId: 'puzzle', mode: 'solo' });
  assert.throws(
    () =>
      rooms.perform(ana, room.id, 'action', {
        revision: 99,
        type: 'swap',
        from: 0,
        to: 1,
      }),
    /mesa foi atualizada/
  );
  assert.throws(() => rooms.perform(intruso, room.id, 'leave'), /acesso/);
});

test('entrada por código inicia a partida, favorita o convidado e respeita vagas', () => {
  const { store, rooms, person } = setup();
  const ana = person('Ana');
  const bia = person('Bia');
  const caio = person('Caio');
  const room = rooms.createRoom(ana, { gameId: 'domino', mode: 'online' });
  const { code } = issueWhatsappInvitation(store, room);
  const joined = rooms.joinByCode(bia, code);
  assert.equal(joined.room.status, 'PLAYING');
  assert.deepEqual(store.getProfile(ana.id).contacts, [bia.id]);
  assert.equal(rooms.joinByCode(bia, code).already, true);
  assert.deepEqual(store.getProfile(ana.id).contacts, [bia.id]);
  assert.throws(() => rooms.joinByCode(caio, code), /completa/);
  assert.throws(() => rooms.joinByCode(caio, 'ZZZZZZZZ'), /inválido/);
});

test('Truco com quatro lugares só começa quando a última vaga é ocupada', () => {
  const { store, rooms, person } = setup();
  const dono = person('Dono');
  const amigos = [1, 2, 3].map((n) => person(`Amigo ${n}`));
  const room = rooms.createRoom(dono, {
    gameId: 'cards',
    mode: 'online',
    capacity: 4,
  });
  const { code } = issueWhatsappInvitation(store, room);
  amigos.slice(0, 2).forEach((amigo) => {
    const { room: current } = rooms.joinByCode(amigo, code);
    assert.equal(current.status, 'WAITING');
  });
  const { room: full } = rooms.joinByCode(amigos[2], code);
  assert.equal(full.status, 'PLAYING');
  assert.equal(full.playerIds.length, 4);
});

test('convite direcionado a outro contato é recusado e dono não ocupa duas vagas', () => {
  const { store, rooms, person } = setup();
  const ana = person('Ana');
  const bia = person('Bia');
  const caio = person('Caio');
  ana.contacts.push(bia.id);
  store.saveProfile(ana);
  const room = rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'online',
    targetId: bia.id,
  });
  const { code } = issueWhatsappInvitation(store, room);
  assert.throws(() => rooms.joinByCode(caio, code), /outro contato/);
  assert.equal(rooms.joinByCode(ana, code).already, true);
  assert.equal(store.getRoom(room.id).playerIds.length, 1);
});
