import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng, shuffle } from '../games/core/rng.mjs';
import { chooseBotAction } from '../games/core/bots.mjs';
import * as domino from '../games/domino/engine.mjs';
import * as cards from '../games/cards/engine.mjs';
import { dominoView, unseenTiles } from '../games/bots/domino.mjs';
import { playDomino, playCards } from './bots/harness.mjs';

const LEVELS = ['easy', 'medium', 'hard'];
const RESULTS = ['A', 'B', 'draw'];

test('a mesma semente repete a mesma partida (dominó e Truco)', () => {
  for (const level of LEVELS) {
    assert.equal(
      playDomino(11, level, 'medium'),
      playDomino(11, level, 'medium')
    );
    assert.equal(
      playCards(11, level, 'medium'),
      playCards(11, level, 'medium')
    );
  }
  const first = domino.createGame(['a', 'b'], {}, { rng: seededRng(5) });
  const again = domino.createGame(['a', 'b'], {}, { rng: seededRng(5) });
  assert.deepEqual(first, again);
  const other = domino.createGame(['a', 'b'], {}, { rng: seededRng(6) });
  assert.notDeepEqual(first.hands, other.hands);
  assert.deepEqual(
    cards.createGame(['a', 'b'], {}, { rng: seededRng(9) }),
    cards.createGame(['a', 'b'], {}, { rng: seededRng(9) })
  );
});

test('jogadas dos bots são sempre aceitas pelas regras, em todos os níveis', () => {
  for (const a of LEVELS)
    for (const b of LEVELS)
      for (let seed = 1; seed <= 6; seed++) {
        assert.ok(RESULTS.includes(playDomino(seed, a, b)));
        assert.ok(RESULTS.includes(playCards(seed, a, b)));
        assert.ok(RESULTS.includes(playCards(seed, a, b, { seats: 4 })));
      }
});

// Troca as mãos adversárias por outras possíveis, mantendo o resto do estado.
function swapDominoHands(game, me) {
  const copy = structuredClone(game);
  const other = copy.playerIds.find((id) => id !== me);
  const pool = shuffle([...copy.hands[other], ...copy.stock], seededRng(99));
  const count = copy.hands[other].length;
  copy.hands[other] = pool.slice(0, count);
  copy.stock = pool.slice(count);
  return copy;
}

function swapCardsHands(game, me) {
  const copy = structuredClone(game);
  const known = new Set(
    [...copy.hands[me], copy.vira, ...copy.played].map((card) => card.id)
  );
  const pool = shuffle(
    cards.fullDeck().filter((card) => !known.has(card.id)),
    seededRng(7)
  );
  for (const id of copy.playerIds.filter((other) => other !== me))
    copy.hands[id] = pool.splice(0, copy.hands[id].length);
  return copy;
}

test('bots só usam informação pública: trocar mãos adversárias não muda a jogada', () => {
  for (const level of LEVELS) {
    const game = domino.createGame(['a', 'b'], {}, { rng: seededRng(3) });
    for (let step = 0; step < 14 && game.status === 'PLAYING'; step++) {
      const id = game.currentPlayerId;
      const options = () => ({ rng: seededRng(step), samples: 12 });
      const real = chooseBotAction('domino', game, id, level, options());
      const swapped = chooseBotAction(
        'domino',
        swapDominoHands(game, id),
        id,
        level,
        options()
      );
      assert.deepEqual(swapped, real, `dominó ${level} passo ${step}`);
      domino.processAction(game, id, real);
    }
  }
  for (const level of LEVELS) {
    const rng = seededRng(4);
    const game = cards.createGame(['a', 'b'], {}, { rng });
    for (let step = 0; step < 24 && game.status === 'PLAYING'; step++) {
      if (game.phase === 'between') {
        cards.processAction(game, 'a', { type: 'next-hand' }, { rng });
        continue;
      }
      const id =
        game.decisionPlayerId ||
        game.pendingRaise?.responderId ||
        game.currentPlayerId;
      const options = () => ({ rng: seededRng(step), samples: 12 });
      const real = chooseBotAction('cards', game, id, level, options());
      const swapped = chooseBotAction(
        'cards',
        swapCardsHands(game, id),
        id,
        level,
        options()
      );
      assert.deepEqual(swapped, real, `truco ${level} passo ${step}`);
      cards.processAction(game, id, real, { rng });
    }
  }
});

const tile = (a, b) => ({ id: `${a}-${b}`, a, b });

test('fácil joga qualquer peça que encaixa; médio prefere soma alta', () => {
  const game = {
    status: 'PLAYING',
    playerIds: ['a', 'b'],
    hands: {
      a: [tile(0, 1), tile(1, 6), tile(4, 5)],
      b: [tile(0, 0)],
    },
    stock: [],
    board: [tile(2, 1)],
    currentPlayerId: 'a',
    passes: 0,
    history: [],
  };
  const medium = chooseBotAction('domino', game, 'a', 'medium', {
    rng: seededRng(1),
  });
  assert.equal(medium.tileId, '1-6', 'maior soma entre as que encaixam');
  // Dupla que a mão ainda cobre sai antes de uma peça solta de soma parecida.
  const doubles = {
    ...game,
    hands: { a: [tile(3, 3), tile(3, 4)], b: [tile(0, 0)] },
    board: [tile(5, 3)],
  };
  assert.equal(chooseBotAction('domino', doubles, 'a', 'medium').tileId, '3-3');
  const picks = new Set();
  for (let seed = 1; seed < 40; seed++)
    picks.add(
      chooseBotAction('domino', game, 'a', 'easy', { rng: seededRng(seed) })
        .tileId
    );
  assert.ok(picks.size >= 2, 'fácil varia');
  for (const id of picks) assert.ok(['0-1', '1-6'].includes(id));
});

test('difícil deixa de contar com números que já saíram', () => {
  // A mão e a mesa cobrem todas as peças com 6: nenhuma pode estar no adversário.
  const withSix = [0, 1, 2, 3, 4, 5, 6].map((n) => tile(n, 6));
  const unseen = unseenTiles({
    hand: withSix.slice(0, 4),
    board: withSix.slice(4),
  });
  assert.ok(unseen.length > 0);
  assert.ok(unseen.every((item) => item.a !== 6 && item.b !== 6));
  const game = domino.createGame(['a', 'b'], {}, { rng: seededRng(8) });
  assert.equal(
    unseenTiles(dominoView(game, 'a')).length,
    28 - 7,
    'no início só a própria mão é conhecida'
  );
});

test('Truco: médio joga a carta mais fraca que vence e responde pela mão', () => {
  const vira = { id: 'clubs-4', suit: 'clubs', rank: 4 };
  const card = (suit, rank) => ({ id: `${suit}-${rank}`, suit, rank });
  const base = {
    status: 'PLAYING',
    playerIds: ['a', 'b'],
    vira,
    teamPoints: [0, 0],
    stake: 1,
    phase: 'play',
    pendingRaise: null,
    raiseAllowedTeam: null,
    elevenTeam: null,
    decisionPlayerId: null,
    trickWinners: [],
    lastTrick: [],
    played: [],
    currentPlayerId: 'a',
    currentTrickLeaderId: 'b',
  };
  const game = {
    ...base,
    hands: {
      a: [card('hearts', 6), card('spades', 13), card('clubs', 1)],
      b: [card('hearts', 7), card('hearts', 11)],
    },
    trick: [{ playerId: 'b', card: card('diamonds', 12) }],
  };
  const action = chooseBotAction('cards', game, 'a', 'medium', {
    rng: seededRng(1),
  });
  assert.equal(action.type, 'play');
  assert.equal(action.cardId, 'spades-13', 'a mais fraca que ainda vence');
  const weak = {
    ...base,
    hands: {
      a: [card('hearts', 6), card('hearts', 7)],
      b: [card('hearts', 5)],
    },
    trick: [],
    currentPlayerId: 'b',
    pendingRaise: { team: 1, value: 6, requesterId: 'b', responderId: 'a' },
  };
  assert.equal(chooseBotAction('cards', weak, 'a', 'medium').type, 'fold');
  const strong = {
    ...weak,
    hands: { a: [card('clubs', 5), card('spades', 5)], b: [card('hearts', 5)] },
  };
  assert.notEqual(chooseBotAction('cards', strong, 'a', 'medium').type, 'fold');
});

test('bot difícil decide dentro de 200 ms, mesmo com oito jogadores', () => {
  const rng = seededRng(21);
  const names = Array.from({ length: 8 }, (_, i) => `p${i}`);
  const game = cards.createGame(names, {}, { rng });
  const took = [];
  for (let step = 0; step < 24 && game.status === 'PLAYING'; step++) {
    if (game.phase === 'between') {
      cards.processAction(game, names[0], { type: 'next-hand' }, { rng });
      continue;
    }
    const id =
      game.decisionPlayerId ||
      game.pendingRaise?.responderId ||
      game.currentPlayerId;
    const started = performance.now();
    const action = chooseBotAction('cards', game, id, 'hard', { rng });
    took.push(performance.now() - started);
    cards.processAction(game, id, action, { rng });
  }
  assert.ok(Math.max(...took) <= 200, `maior decisão: ${Math.max(...took)} ms`);
  // Orçamento zerado: ainda devolve uma jogada válida.
  const fresh = domino.createGame(['a', 'b'], {}, { rng: seededRng(2) });
  const id = fresh.currentPlayerId;
  const action = chooseBotAction('domino', fresh, id, 'hard', {
    budgetMs: 0,
    rng: seededRng(2),
  });
  domino.processAction(fresh, id, action);
});
