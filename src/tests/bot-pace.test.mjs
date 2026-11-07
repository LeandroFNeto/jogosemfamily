import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';

test('bots jogam um de cada vez, com pausa, depois da jogada da pessoa', () => {
  const { rooms, person, advance, store } = setup({ botDelayMs: 2000 });
  const ana = person('Ana');
  let room = rooms.createRoom(ana, { gameId: 'cards', mode: 'bot' });
  const load = () => rooms.normalizeRoom(store.getRoom(room.id));
  // Se um bot abre a mão, ele também espera a pausa.
  while (load().game.currentPlayerId !== ana.id) {
    assert.equal(rooms.sweep().length, 0, 'nada antes da pausa');
    advance(2100);
    assert.equal(rooms.sweep().length, 1, 'um bot por vez');
  }
  room = load();
  const card = rooms.snapshot(room, ana.id).game.hand[0];
  rooms.perform(ana, room.id, 'action', {
    type: 'play',
    cardId: card.id,
    revision: room.revision,
  });
  room = load();
  assert.equal(room.game.currentPlayerId === ana.id, false);
  assert.equal(rooms.sweep().length, 0, 'bot ainda está "pensando"');
  advance(1000);
  assert.equal(rooms.sweep().length, 0);
  advance(1100);
  assert.equal(rooms.sweep().length, 1, 'um bot jogou');
  assert.equal(rooms.sweep().length, 0, 'o próximo bot espera a própria pausa');
});

test('só bots jogando: a mesa é encerrada na próxima varredura', () => {
  const { rooms, person, store } = setup({ botDelayMs: 2000 });
  const ana = person('Ana');
  const room = rooms.createRoom(ana, { gameId: 'cards', mode: 'bot' });
  rooms.perform(ana, room.id, 'leave', {});
  const [closed] = rooms.sweep();
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.closedReason, 'inactive');
  assert.equal(rooms.normalizeRoom(store.getRoom(room.id)).status, 'CLOSED');
  assert.equal(rooms.sweep().length, 0, 'nada mais a fazer');
});
