import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';

function finishedRoom(gameId) {
  const ctx = setup();
  const ana = ctx.person('Ana');
  const room = ctx.rooms.createRoom(ana, { gameId, mode: 'solo' });
  const stored = ctx.rooms.normalizeRoom(ctx.store.getRoom(room.id));
  stored.game.status = 'FINISHED';
  stored.status = 'FINISHED';
  ctx.rooms.save(stored);
  return { ...ctx, ana, id: room.id };
}
const fresh = (ctx) => ctx.rooms.normalizeRoom(ctx.store.getRoom(ctx.id));

test('quebra-cabeça: aumentar dificuldade começa a rodada com mais peças', () => {
  const ctx = finishedRoom('puzzle');
  const before = fresh(ctx);
  ctx.rooms.perform(ctx.ana, ctx.id, 'rematch', {
    revision: before.revision,
    level: 'medium',
  });
  const room = fresh(ctx);
  assert.equal(room.game.status, 'PLAYING');
  assert.equal(room.game.size, 4);
  assert.equal(room.game.pieces.length, 16);
});

test('caça-palavras: sobe o nível e não aceita descer', () => {
  const ctx = finishedRoom('wordsearch');
  const before = fresh(ctx);
  assert.throws(
    () =>
      ctx.rooms.perform(ctx.ana, ctx.id, 'rematch', {
        revision: before.revision,
        level: 'easy',
      }),
    /maior que a atual/
  );
  ctx.rooms.perform(ctx.ana, ctx.id, 'rematch', {
    revision: fresh(ctx).revision,
    level: 'hard',
  });
  const room = fresh(ctx);
  assert.equal(room.game.level, 'hard');
  assert.equal(room.game.status, 'PLAYING');
});

test('palavras cruzadas não têm níveis', () => {
  const ctx = finishedRoom('crossword');
  assert.throws(
    () =>
      ctx.rooms.perform(ctx.ana, ctx.id, 'rematch', {
        revision: fresh(ctx).revision,
        level: 'hard',
      }),
    /não tem níveis/
  );
});
