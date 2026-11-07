import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as truco from '../games/cards/engine.mjs';
import * as crossword from '../games/crossword/engine.mjs';
import * as puzzle from '../games/puzzle/engine.mjs';
import { crosswords } from '../games/crossword/puzzles.mjs';
import { chooseBotAction } from '../games/core/bots.mjs';
import { getGameEngine } from '../games/core/registry.mjs';
import { validateProfile } from '../family-panel/profile.mjs';

const card = (rank, suit = 'clubs') => ({ id: `${suit}-${rank}`, rank, suit });
const actor = (game) =>
  game.decisionPlayerId ||
  game.pendingRaise?.responderId ||
  game.currentPlayerId;

test('Truco distribui três cartas privadas por pessoa em mesas de 2, 4, 6 e 8', () => {
  for (const count of [2, 4, 6, 8]) {
    const ids = Array.from({ length: count }, (_, i) => `p${i}`);
    const game = truco.createGame(ids);
    assert.equal(
      new Set(
        [...Object.values(game.hands).flat(), game.vira].map((card) => card.id)
      ).size,
      count * 3 + 1
    );
    assert.equal(truco.publicGame(game, ids[0]).hand.length, 3);
    assert.equal(truco.publicGame(game, ids[0]).hands, undefined);
    assert.equal(truco.publicGame(game, ids[0]).partnerHands, null);
    assert.throws(() => truco.publicGame(game, 'stranger'));
  }
  assert.throws(() => truco.createGame(['a', 'b', 'c']));
  assert.throws(() =>
    truco.createGame(Array.from({ length: 10 }, (_, i) => String(i)))
  );
});

test('Truco respeita ordem, manilhas e naipes', () => {
  const vira = card(3);
  assert.ok(
    truco.cardStrength(card(4, 'diamonds'), vira) >
      truco.cardStrength(card(3), vira)
  );
  assert.ok(
    truco.cardStrength(card(4, 'clubs'), vira) >
      truco.cardStrength(card(4, 'hearts'), vira)
  );
  assert.equal(
    truco.cardStrength(card(2, 'clubs'), vira),
    truco.cardStrength(card(2, 'diamonds'), vira)
  );
});

test('aumentos exigem decisão correta; correr entrega o valor aceito e não o pedido', () => {
  const game = truco.createGame(['a', 'b']);
  const before = structuredClone(game);
  assert.throws(() =>
    truco.processAction(game, 'b', { type: 'play', cardId: game.hands.b[0].id })
  );
  assert.throws(() =>
    truco.processAction(game, 'a', { type: 'play', cardId: game.hands.b[0].id })
  );
  assert.deepEqual(game, before);
  truco.processAction(game, 'a', { type: 'raise' });
  assert.equal(game.pendingRaise.value, 3);
  assert.throws(() => truco.processAction(game, 'a', { type: 'accept' }));
  truco.processAction(game, 'b', { type: 'raise' });
  assert.equal(game.stake, 3);
  assert.equal(game.pendingRaise.value, 6);
  truco.processAction(game, 'a', { type: 'fold' });
  assert.deepEqual(game.teamPoints, [0, 3]);
  assert.equal(game.phase, 'between');
});

test('duas primeiras vazas empatadas exigem terceira; empates totais não pontuam', () => {
  const game = truco.createGame(['a', 'b']);
  game.vira = card(4, 'hearts');
  game.hands = {
    a: [card(3, 'clubs'), card(2, 'clubs'), card(1, 'clubs')],
    b: [card(3, 'hearts'), card(2, 'hearts'), card(1, 'hearts')],
  };
  for (let round = 0; round < 3; round++) {
    for (let turn = 0; turn < 2; turn++) {
      const id = game.currentPlayerId;
      truco.processAction(game, id, {
        type: 'play',
        cardId: game.hands[id][0].id,
      });
    }
    if (round < 2) assert.equal(game.phase, 'play');
  }
  assert.deepEqual(game.trickWinners, [null, null, null]);
  assert.deepEqual(game.teamPoints, [0, 0]);
  assert.equal(game.phase, 'between');
});

test('mão de onze permite ver só os parceiros e não permite truco', () => {
  const game = truco.createGame(['a', 'b', 'c', 'd']);
  game.teamPoints = [11, 4];
  game.phase = 'between';
  truco.processAction(game, 'a', { type: 'next-hand' });
  assert.equal(game.phase, 'eleven');
  assert.deepEqual(Object.keys(truco.publicGame(game, 'a').partnerHands), [
    'c',
  ]);
  assert.equal(truco.publicGame(game, 'b').partnerHands, null);
  assert.throws(() => truco.processAction(game, 'b', { type: 'accept' }));
  truco.processAction(game, 'a', { type: 'accept' });
  assert.equal(game.stake, 3);
  assert.throws(() =>
    truco.processAction(game, game.currentPlayerId, { type: 'raise' })
  );
});

test('Truco e dominó completam partidas com bots nos três níveis, inclusive oito assentos', () => {
  for (const gameId of ['domino', 'cards'])
    for (const difficulty of ['easy', 'medium', 'hard'])
      for (const count of gameId === 'cards' ? [2, 8] : [2]) {
        const engine = getGameEngine(gameId);
        let game = engine.createGame(
          Array.from({ length: count }, (_, i) => `p${i}`)
        );
        for (
          let steps = 0;
          game.status === 'PLAYING' && steps < 2500;
          steps++
        ) {
          const id = actor(game);
          const action =
            gameId === 'cards' && game.phase === 'between'
              ? { type: 'next-hand' }
              : chooseBotAction(gameId, game, id, difficulty);
          assert.ok(action);
          engine.processAction(game, id, action);
        }
        assert.equal(
          game.status,
          'FINISHED',
          `${gameId} ${difficulty} ${count}`
        );
        const ids = [...game.playerIds];
        for (const id of ids)
          if (game.status === 'FINISHED')
            game = engine.requestRematch(game, id);
        assert.equal(game.status, 'PLAYING');
      }
});

test('estratégias de cartas e dominó não dependem das mãos adversárias', () => {
  for (const gameId of ['cards', 'domino']) {
    const game = getGameEngine(gameId).createGame(['a', 'b']);
    game.currentPlayerId = 'a';
    // Só o tamanho da mão adversária é público; olhar as peças ou cartas falha.
    const hidden = new Proxy(new Array(game.hands.b.length), {
      get(target, property) {
        if (property === 'length') return target.length;
        throw new Error('Não pode olhar o adversário.');
      },
    });
    Object.defineProperty(game.hands, 'b', { get: () => hidden });
    for (const level of ['easy', 'medium', 'hard'])
      assert.ok(chooseBotAction(gameId, game, 'a', level));
  }
});

test('palavras cruzadas têm cruzamentos consistentes e não divulgam respostas pendentes', () => {
  for (const board of crosswords) {
    const cells = new Map();
    for (const word of board.words)
      for (let i = 0; i < word.answer.length; i++) {
        const row = word.row + (word.direction === 'vertical' ? i : 0);
        const column = word.column + (word.direction === 'horizontal' ? i : 0);
        assert.ok(row < board.rows && column < board.columns);
        const key = `${row}-${column}`;
        if (cells.has(key)) assert.equal(cells.get(key), word.answer[i]);
        cells.set(key, word.answer[i]);
      }
  }
  let game = crossword.createGame(['a', 'b']);
  assert.ok(
    crossword.publicGame(game, 'a').words.every((word) => word.answer === null)
  );
  assert.equal(crossword.publicGame(game, 'a').puzzleIndex, undefined);
  assert.throws(() =>
    crossword.processAction(game, 'stranger', { type: 'answer' })
  );
  assert.throws(() =>
    crossword.processAction(game, 'a', {
      type: 'answer',
      wordId: '1h',
      answer: 'errado',
    })
  );
  const words = crosswords[game.puzzleIndex].words;
  words.forEach((word, i) =>
    crossword.processAction(game, i % 2 ? 'a' : 'b', {
      type: 'answer',
      wordId: word.id,
      answer: word.answer.toLowerCase(),
    })
  );
  assert.equal(game.status, 'FINISHED');
  assert.equal(game.score.a.wins, 1);
  assert.equal(game.score.b.wins, 1);
  game = crossword.requestRematch(game, 'a');
  assert.equal(game.status, 'FINISHED');
  assert.equal(crossword.requestRematch(game, 'b').status, 'PLAYING');
});

test('quebra-cabeça valida trocas, completa montagem e preserva foto na revanche individual', () => {
  let game = puzzle.createGame(['a'], {}, { image: '/garden.svg' });
  assert.deepEqual([...game.pieces].sort(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  for (const action of [
    { from: -1, to: 2 },
    { from: 0, to: 0 },
    { from: '1', to: 2 },
  ])
    assert.throws(() =>
      puzzle.processAction(game, 'a', { type: 'swap', ...action })
    );
  for (let i = 0; i < 9 && game.status === 'PLAYING'; i++)
    if (game.pieces[i] !== i)
      puzzle.processAction(game, 'a', {
        type: 'swap',
        from: i,
        to: game.pieces.indexOf(i),
      });
  assert.equal(game.status, 'FINISHED');
  assert.equal(game.score.a.points, 1);
  game = puzzle.requestRematch(game, 'a');
  assert.equal(game.status, 'PLAYING');
  assert.equal(game.image, '/garden.svg');
});

test('modos competitivos isolam progresso, alternam turnos e aceitam bots dos três níveis', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const words = crossword.createGame(
      ['human', 'bot'],
      {},
      { competitive: true }
    );
    const first = crosswords[words.puzzleIndex].words[0];
    crossword.processAction(words, 'human', {
      type: 'answer',
      wordId: first.id,
      answer: first.answer,
    });
    assert.equal(crossword.publicGame(words, 'bot').solved.length, 0);
    assert.equal(crossword.publicGame(words, 'bot').words[0].answer, null);
    assert.throws(() =>
      crossword.processAction(words, 'human', { type: 'pass' })
    );
    crossword.processAction(
      words,
      'bot',
      chooseBotAction('crossword', words, 'bot', level)
    );
    assert.equal(words.currentPlayerId, 'human');
    const image = puzzle.createGame(
      ['human', 'bot'],
      {},
      { competitive: true }
    );
    const untouched = [...image.piecesByPlayer.bot];
    puzzle.processAction(image, 'human', { type: 'swap', from: 0, to: 1 });
    assert.deepEqual(image.piecesByPlayer.bot, untouched);
    assert.equal(puzzle.publicGame(image, 'human').piecesByPlayer, undefined);
    if (image.status === 'PLAYING')
      puzzle.processAction(
        image,
        'bot',
        chooseBotAction('puzzle', image, 'bot', level)
      );
  }
});

test('preferências migram perfis antigos e validam seleção dos jogos', () => {
  const profile = {
    name: 'Maria',
    photo: '',
    preferences: { fontSize: 'large', contrast: false, speech: false },
    dominoEnabled: false,
  };
  assert.deepEqual(validateProfile(profile).enabledGames, [
    'cards',
    'crossword',
    'puzzle',
  ]);
  assert.deepEqual(
    validateProfile({ ...profile, enabledGames: [] }).enabledGames,
    []
  );
  assert.throws(() => validateProfile({ ...profile, enabledGames: ['fake'] }));
  assert.throws(() =>
    validateProfile({ ...profile, enabledGames: ['cards', 'cards'] })
  );
  assert.throws(() => validateProfile({ ...profile, enabledGames: null }));
});

test('bots concluem os dois desafios competitivos em todos os níveis e aceitam revanche', () => {
  for (const gameId of ['crossword', 'puzzle'])
    for (const level of ['easy', 'medium', 'hard']) {
      const engine = getGameEngine(gameId);
      let game = engine.createGame(['a', 'b'], {}, { competitive: true });
      for (let turn = 0; game.status === 'PLAYING' && turn < 1000; turn++) {
        const id = game.currentPlayerId;
        engine.processAction(
          game,
          id,
          chooseBotAction(gameId, game, id, level)
        );
      }
      assert.equal(game.status, 'FINISHED');
      assert.ok(['a', 'b'].includes(game.result.winnerId));
      assert.equal(game.score[game.result.winnerId].wins, 1);
      game = engine.requestRematch(game, 'a');
      assert.equal(game.status, 'FINISHED');
      game = engine.requestRematch(game, 'b');
      assert.equal(game.status, 'PLAYING');
      assert.equal(game.competitive, true);
    }
});
