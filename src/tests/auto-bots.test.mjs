import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { teamOf } from '../games/cards/engine.mjs';
import { gameCatalog } from '../shared/games.mjs';

const WAIT = 3 * 60000;

test('Truco só tem mesa de 4 lugares (2 contra 2)', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  assert.deepEqual(
    gameCatalog.find((game) => game.id === 'cards').capacities,
    [4]
  );
  for (const capacity of [2, 6, 8])
    assert.throws(
      () =>
        rooms.createRoom(ana, { gameId: 'cards', mode: 'online', capacity }),
      /Truco tem mesa de 4 lugares/
    );
  const room = rooms.createRoom(ana, { gameId: 'cards', mode: 'online' });
  assert.equal(room.capacity, 4);
});

test('palavras cruzadas, quebra-cabeça e caça-palavras não aceitam bots', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  for (const gameId of ['crossword', 'puzzle', 'wordsearch']) {
    assert.throws(
      () => rooms.createRoom(ana, { gameId, mode: 'bot', difficulty: 'easy' }),
      /sem bots/,
      gameId
    );
    assert.equal(rooms.createRoom(ana, { gameId, mode: 'solo' }).mode, 'solo');
    const group = rooms.createRoom(ana, { gameId, mode: 'online' });
    assert.equal(group.status, 'WAITING', `${gameId} em grupo espera gente`);
  }
});

test('mesa de vários jogadores sem gente suficiente recebe bots depois da espera', () => {
  const { rooms, person, advance } = setup();
  const ana = person('Ana');
  const room = rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'online',
  });
  advance(WAIT - 1000);
  assert.equal(rooms.sweep().length, 0, 'ainda dentro do prazo');
  advance(2000);
  const [filled] = rooms.sweep();
  assert.equal(filled.id, room.id);
  const current = rooms.roomFor(room.id, ana.id);
  assert.equal(current.status, 'PLAYING');
  assert.equal(current.playerIds.length, 2);
  assert.equal(current.botIds.length, 1);
  const view = rooms.snapshot(current, ana.id);
  assert.equal(view.players.filter((player) => player.bot).length, 1);
  assert.match(view.players.find((player) => player.bot).name, /^Bot \d$/);
  assert.equal(view.notice.type, 'fill');
});

test('Truco com poucas pessoas é completado com bots, 2 contra 2', () => {
  const { rooms, person, advance } = setup();
  const [ana, bia] = [person('Ana'), person('Bia')];
  const room = rooms.createRoom(ana, { gameId: 'cards', mode: 'online' });
  rooms.joinRoom(bia, room);
  advance(WAIT + 1000);
  rooms.sweep();
  const current = rooms.roomFor(room.id, ana.id);
  assert.equal(current.status, 'PLAYING');
  assert.equal(current.playerIds.length, 4);
  assert.equal(current.botIds.length, 2);
  for (const team of [0, 1])
    assert.equal(
      current.playerIds.filter((id) => teamOf(current.game, id) === team)
        .length,
      2
    );
});

test('o dono pode começar já, com bots; os outros não', () => {
  const { rooms, person } = setup();
  const [ana, bia] = [person('Ana'), person('Bia')];
  const room = rooms.createRoom(ana, { gameId: 'cards', mode: 'online' });
  rooms.joinRoom(bia, room);
  assert.throws(() => rooms.perform(bia, room.id, 'fill'), /Somente o dono/);
  const started = rooms.perform(ana, room.id, 'fill');
  assert.equal(started.status, 'PLAYING');
  assert.equal(started.botIds.length, 2);
  assert.throws(() => rooms.perform(ana, room.id, 'fill'), /não aceita bots/);
});

test('jogos individuais nunca recebem bots de preenchimento', () => {
  const { rooms, person, advance } = setup();
  const ana = person('Ana');
  const room = rooms.createRoom(ana, { gameId: 'wordsearch', mode: 'online' });
  advance(WAIT * 10);
  assert.equal(rooms.sweep().length, 0);
  assert.throws(() => rooms.perform(ana, room.id, 'fill'), /não aceita bots/);
});

test('quem sai no meio da partida vira bot na mesa e aparece marcado', () => {
  const { rooms, person } = setup();
  const [ana, bia] = [person('Ana'), person('Bia')];
  const room = rooms.createRoom(ana, { gameId: 'domino', mode: 'online' });
  rooms.joinRoom(bia, room);
  const playing = rooms.roomFor(room.id, ana.id);
  assert.equal(playing.status, 'PLAYING');
  rooms.perform(bia, room.id, 'leave');
  const view = rooms.snapshot(rooms.roomFor(room.id, ana.id), ana.id);
  const left = view.players.find((player) => player.id === bia.id);
  assert.notEqual(left.seat, 'present', 'o lugar de quem saiu é de bot');
  assert.match(view.notice.text, /um bot assume o lugar/);
});
