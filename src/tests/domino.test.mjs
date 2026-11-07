import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  processAction,
  playableSides,
  publicGame,
  requestRematch,
} from '../games/domino/engine.mjs';
import { getGameEngine } from '../games/core/registry.mjs';

const tile = (a, b) => ({ id: `${Math.min(a, b)}-${Math.max(a, b)}`, a, b });
function fixture() {
  return {
    status: 'PLAYING',
    playerIds: ['a', 'b'],
    currentPlayerId: 'a',
    hands: { a: [tile(2, 3), tile(1, 1)], b: [tile(4, 6)] },
    board: [tile(3, 4)],
    stock: [],
    passes: 0,
    history: [],
    rematch: [],
    result: null,
    score: { a: { wins: 0, points: 0 }, b: { wins: 0, points: 0 } },
  };
}

test('distribui 28 peças únicas, 7 por jogador, sem vazar mão ou monte', () => {
  const game = createGame(['a', 'b']);
  assert.equal(game.hands.a.length, 7);
  assert.equal(game.hands.b.length, 7);
  assert.equal(game.stock.length, 14);
  assert.equal(
    new Set(
      [...game.hands.a, ...game.hands.b, ...game.stock].map((piece) => piece.id)
    ).size,
    28
  );
  const visible = publicGame(game, 'a');
  assert.equal(visible.hand.length, 7);
  assert.equal(visible.hands, undefined);
  assert.equal(visible.stock, undefined);
  assert.throws(() => createGame(['a', 'a']));
  assert.equal(getGameEngine('domino').name, 'Dominó');
  assert.equal(getGameEngine('cards').name, 'Truco paulista');
  assert.throws(() => getGameEngine('unknown'));
});

test('encaixa e orienta peças em ambas as pontas', () => {
  const game = fixture();
  assert.deepEqual(playableSides(game.board, tile(2, 3)), ['left']);
  processAction(game, 'a', { type: 'play', tileId: '2-3', side: 'left' });
  assert.equal(game.board[0].b, game.board[1].a);
  processAction(game, 'b', { type: 'play', tileId: '4-6', side: 'right' });
  assert.equal(game.board.at(-2).b, game.board.at(-1).a);
  const reverse = fixture();
  reverse.hands.a = [tile(3, 5), tile(1, 1)];
  processAction(reverse, 'a', { type: 'play', tileId: '3-5', side: 'left' });
  assert.deepEqual([reverse.board[0].a, reverse.board[0].b], [5, 3]);
});

test('rejeita fora de turno, peça alheia, ponta inválida e compra ou passe indevidos', () => {
  const game = fixture();
  const before = structuredClone(game);
  for (const [id, action] of [
    ['b', { type: 'play', tileId: '4-6', side: 'right' }],
    ['a', { type: 'play', tileId: '4-6', side: 'right' }],
    ['a', { type: 'play', tileId: '2-3', side: 'right' }],
    ['a', { type: 'draw' }],
    ['a', { type: 'pass' }],
    ['a', { type: 'score', points: 999 }],
  ])
    assert.throws(() => processAction(game, id, action));
  assert.deepEqual(game, before);
});

test('compra uma peça sem mudar turno; não pode passar com monte disponível', () => {
  const game = fixture();
  game.hands.a = [tile(0, 0)];
  game.stock = [tile(4, 5)];
  assert.throws(() => processAction(game, 'a', { type: 'pass' }));
  processAction(game, 'a', { type: 'draw' });
  assert.equal(game.currentPlayerId, 'a');
  assert.equal(game.hands.a.length, 2);
  assert.throws(() => processAction(game, 'a', { type: 'draw' }));
});

test('mão vazia termina rodada, pontua e exige acordo dos dois para revanche', () => {
  const game = fixture();
  game.hands.a = [tile(2, 3)];
  processAction(game, 'a', { type: 'play', tileId: '2-3', side: 'left' });
  assert.equal(game.result.winnerId, 'a');
  assert.equal(game.result.points, 10);
  assert.deepEqual(game.score.a, { wins: 1, points: 10 });
  assert.throws(() => processAction(game, 'b', { type: 'pass' }));
  requestRematch(game, 'a');
  requestRematch(game, 'a');
  assert.equal(game.rematch.length, 1);
  assert.throws(() => requestRematch(game, 'intruso'));
  const next = requestRematch(game, 'b');
  assert.equal(next.status, 'PLAYING');
  assert.equal(next.score.a.points, 10);
  assert.equal(next.board.length, 0);
});

test('dois passes encerram mesa fechada pela menor soma e tratam empate', () => {
  const game = fixture();
  game.hands = { a: [tile(0, 0)], b: [tile(1, 1)] };
  processAction(game, 'a', { type: 'pass' });
  processAction(game, 'b', { type: 'pass' });
  assert.equal(game.result.winnerId, 'a');
  assert.equal(game.result.points, 2);
  const tie = fixture();
  tie.hands = { a: [tile(0, 2)], b: [tile(1, 1)] };
  processAction(tie, 'a', { type: 'pass' });
  processAction(tie, 'b', { type: 'pass' });
  assert.equal(tie.result.winnerId, null);
  assert.equal(tie.result.points, 0);
});

test('50 partidas completas preservam 28 peças e conexões válidas', () => {
  for (let round = 0; round < 50; round++) {
    const game = createGame(['a', 'b']);
    let actions = 0;
    while (game.status === 'PLAYING' && actions++ < 150) {
      const id = game.currentPlayerId;
      const piece = game.hands[id].find(
        (piece) => playableSides(game.board, piece).length
      );
      const action = piece
        ? {
            type: 'play',
            tileId: piece.id,
            side: playableSides(game.board, piece)[0],
          }
        : { type: game.stock.length ? 'draw' : 'pass' };
      processAction(game, id, action);
      const all = [
        ...game.hands.a,
        ...game.hands.b,
        ...game.stock,
        ...game.board,
      ];
      assert.equal(all.length, 28);
      assert.equal(new Set(all.map((piece) => piece.id)).size, 28);
      game.board
        .slice(1)
        .forEach((piece, i) => assert.equal(game.board[i].b, piece.a));
    }
    assert.equal(game.status, 'FINISHED');
  }
});

test('dominó com quatro jogadores: ordem de vez circular, mesa fechada e pontos', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const game = createGame(ids);
  assert.equal(game.stock.length, 0, '4 × 7 peças usam o baralho todo');
  for (const id of ids) assert.equal(game.hands[id].length, 7);
  const first = game.currentPlayerId;
  const tile = game.hands[first][0];
  processAction(game, first, { type: 'play', tileId: tile.id, side: 'right' });
  assert.equal(game.currentPlayerId, ids[(ids.indexOf(first) + 1) % 4]);

  // Mesa fechada: ganha quem tem menos pontos na mão.
  const blocked = createGame(ids);
  blocked.stock = [];
  blocked.board = [{ id: '0-0', a: 0, b: 0 }];
  blocked.hands = {
    a: [{ id: '1-1', a: 1, b: 1 }],
    b: [{ id: '2-2', a: 2, b: 2 }],
    c: [{ id: '3-3', a: 3, b: 3 }],
    d: [{ id: '4-4', a: 4, b: 4 }],
  };
  blocked.currentPlayerId = 'a';
  for (const id of ids) processAction(blocked, id, { type: 'pass' });
  assert.equal(blocked.status, 'FINISHED');
  assert.equal(blocked.result.reason, 'blocked');
  assert.equal(blocked.result.winnerId, 'a');
  assert.equal(blocked.result.points, 4 + 6 + 8 - 2);
});
