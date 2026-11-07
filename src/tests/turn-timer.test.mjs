import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { createRoomsService } from '../backend/rooms-service.mjs';

function onlineTable(gameId, options = {}) {
  const ctx = setup({ online: () => true });
  const ana = ctx.person('Ana');
  const beto = ctx.person('Beto');
  const room = ctx.rooms.createRoom(ana, {
    gameId,
    mode: 'online',
    ...options,
  });
  ctx.rooms.startRoom(room, beto);
  ctx.rooms.save(room);
  return { ...ctx, ana, beto, room };
}

test('só jogos com vez recebem prazo e o tempo é configurável', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  const solo = rooms.createRoom(ana, { gameId: 'puzzle', mode: 'solo' });
  assert.equal(solo.turn, null, 'individual não tem cronômetro');
  assert.throws(
    () =>
      rooms.createRoom(ana, {
        gameId: 'domino',
        mode: 'bot',
        difficulty: 'easy',
        turnSeconds: 45,
      }),
    /tempo da vez/
  );
  const { room, rooms: r, ana: a } = onlineTable('domino', { turnSeconds: 30 });
  const view = r.snapshot(room, a.id);
  assert.equal(view.turn.seconds, 30);
  assert.ok(view.turn.deadline > view.serverNow);
  const off = onlineTable('domino', { turnSeconds: 0 });
  assert.equal(off.room.turn, null, 'tempo desligado não tem prazo');
});

test('prazo vencido dispara a jogada automática e avisa a mesa', () => {
  const { rooms, room, advance, ana, beto } = onlineTable('domino');
  const first = room.turn.playerId;
  const before = room.revision;
  advance(59000);
  assert.equal(rooms.sweep().length, 0, 'antes do prazo nada acontece');
  advance(2000);
  const changed = rooms.sweep();
  assert.equal(changed.length, 1);
  const after = changed[0];
  assert.ok(after.revision > before);
  assert.equal(after.notice.type, 'auto');
  assert.equal(after.notice.playerId, first);
  assert.ok(after.game.history.some((entry) => entry.type === 'auto'));
  assert.equal(after.autoPlays[first], 1);
  assert.notEqual(after.turn.playerId, first, 'a vez passou ao outro jogador');
  const view = rooms.snapshot(after, first === ana.id ? beto.id : ana.id);
  assert.equal(view.notice.name.length > 0, true);
});

test('ação que chega depois do prazo é recusada e a jogada automática vale', () => {
  const { rooms, room, advance, ana, beto } = onlineTable('domino');
  const first = room.turn.playerId;
  const player = first === ana.id ? ana : beto;
  const view = rooms.snapshot(room, first);
  const tile = view.game.hand[0];
  advance(61000);
  assert.throws(
    () =>
      rooms.perform(player, room.id, 'action', {
        revision: room.revision,
        type: 'play',
        tileId: tile.id,
        side: 'left',
      }),
    /tempo da sua vez acabou/
  );
  const current = rooms.roomFor(room.id, first);
  assert.ok(current.game.history.some((entry) => entry.type === 'auto'));
});

for (const [gameId, extra] of [
  ['domino', {}],
  ['cards', { capacity: 4 }],
]) {
  test(`jogada automática funciona no jogo ${gameId}`, () => {
    const ctx = setup({ online: () => true });
    const ana = ctx.person('Ana');
    const room = ctx.rooms.createRoom(ana, {
      gameId,
      mode: 'bot',
      difficulty: 'easy',
      ...extra,
    });
    assert.equal(room.turn?.playerId, ana.id, 'o bot joga e a vez é humana');
    ctx.advance(61000);
    const changed = ctx.rooms.sweep();
    assert.equal(changed.length, 1);
    assert.equal(changed[0].notice.type, 'auto');
  });
}

test('ação normal limpa o aviso e zera o contador de jogadas automáticas', () => {
  const { rooms, room, advance, ana, beto } = onlineTable('domino');
  advance(61000);
  rooms.sweep();
  const current = rooms.roomFor(room.id, ana.id);
  const next = current.turn.playerId;
  const player = next === ana.id ? ana : beto;
  const view = rooms.snapshot(current, next);
  const move = view.game.hand
    .flatMap((tile) => ['left', 'right'].map((side) => ({ tile, side })))
    .find(({ tile, side }) => {
      try {
        const copy = structuredClone(current);
        rooms.act(copy, player, 'action', {
          revision: copy.revision,
          type: 'play',
          tileId: tile.id,
          side,
        });
        return true;
      } catch {
        return false;
      }
    });
  if (!move) return; // sem jogada possível a regra é comprar/passar, coberta em outro teste
  rooms.perform(player, room.id, 'action', {
    revision: current.revision,
    type: 'play',
    tileId: move.tile.id,
    side: move.side,
  });
  const after = rooms.roomFor(room.id, ana.id);
  assert.equal(after.notice, null);
  assert.equal(after.autoPlays[next], 0);
});

test('índice de prazos é reconstruído do banco após reinício', () => {
  const ctx = onlineTable('domino');
  ctx.advance(61000);
  // Novo serviço sobre o mesmo banco, como após reiniciar o servidor.
  const restarted = createRoomsService({
    store: ctx.store,
    now: () => ctx.clock.time,
    isOnline: () => true,
  });
  const changed = restarted.sweep();
  assert.equal(changed.length, 1, 'sala persistida é encontrada');
  assert.equal(changed[0].notice.type, 'auto');
});

test('presença: conexão, ação e mensagem contam como presente', () => {
  let connected = false;
  const ctx = setup({ online: () => connected });
  const ana = ctx.person('Ana');
  const beto = ctx.person('Beto');
  const room = ctx.rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'online',
    turnSeconds: 0,
  });
  ctx.rooms.startRoom(room, beto);
  ctx.rooms.save(room);
  // Conexão aberta mantém a mesa viva além de 5 minutos.
  connected = true;
  ctx.advance(10 * 60000);
  assert.equal(ctx.rooms.sweep().length, 0);
  // Sem conexão e sem sinal por 5 minutos: cancela.
  connected = false;
  ctx.advance(5 * 60000 + 1000);
  const [closed] = ctx.rooms.sweep();
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.closedReason, 'inactive');
});

test('mensagem recente do WhatsApp (touchProfile) conta como presença', () => {
  const ctx = setup();
  const ana = ctx.person('Ana');
  const beto = ctx.person('Beto');
  const room = ctx.rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'online',
    turnSeconds: 0,
  });
  ctx.rooms.startRoom(room, beto);
  ctx.rooms.save(room);
  ctx.advance(4 * 60000);
  ctx.rooms.touchProfile(beto.id);
  ctx.advance(2 * 60000);
  assert.equal(ctx.rooms.sweep().length, 0, 'Beto falou há 2 minutos');
  ctx.advance(4 * 60000);
  assert.equal(ctx.rooms.sweep()[0].closedReason, 'inactive');
});

test('mesa aguardando amigos não é cancelada por inatividade', () => {
  const ctx = setup();
  const ana = ctx.person('Ana');
  const room = ctx.rooms.createRoom(ana, {
    gameId: 'crossword',
    mode: 'online',
  });
  ctx.advance(60 * 60000);
  assert.equal(ctx.rooms.sweep().length, 0, 'jogo individual não recebe bots');
  assert.equal(ctx.rooms.roomFor(room.id, ana.id).status, 'WAITING');
});

test('cancelamento revoga convites e a mesa cancelada informa o motivo', () => {
  const ctx = setup();
  const ana = ctx.person('Ana');
  const beto = ctx.person('Beto');
  const room = ctx.rooms.createRoom(ana, {
    gameId: 'domino',
    mode: 'online',
    turnSeconds: 0,
  });
  ctx.rooms.startRoom(room, beto);
  ctx.rooms.save(room);
  ctx.store.db
    .prepare('INSERT INTO invitations VALUES (?, ?, ?, NULL)')
    .run('hash-x', room.id, ctx.clock.time + 100000);
  ctx.advance(5 * 60000 + 1000);
  ctx.rooms.sweep();
  assert.equal(
    ctx.store.db.prepare('SELECT count(*) AS n FROM invitations').get().n,
    0
  );
  const view = ctx.rooms.snapshot(ctx.rooms.roomFor(room.id, ana.id), ana.id);
  assert.equal(view.status, 'CLOSED');
  assert.equal(view.closedReason, 'inactive');
});
