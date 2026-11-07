import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as wordsearch from '../games/wordsearch/engine.mjs';
import { themes } from '../games/wordsearch/words.mjs';
import { chooseBotAction } from '../games/core/bots.mjs';
import { seededRng } from '../games/core/rng.mjs';
import { getGameEngine } from '../games/core/registry.mjs';
import { setup } from './helpers.mjs';

const SIZES = { easy: [8, 6], medium: [12, 10], hard: [15, 14] };

function lineOf(game, placement) {
  const rows = Math.sign(placement.end.row - placement.start.row);
  const cols = Math.sign(placement.end.col - placement.start.col);
  return { rows, cols };
}

test('listas temáticas em português: maiúsculas, sem acento e sem repetição', () => {
  for (const theme of themes) {
    assert.ok(theme.words.length >= 20, theme.id);
    assert.equal(new Set(theme.words).size, theme.words.length, theme.id);
    for (const word of theme.words) assert.match(word, /^[A-Z]+$/, word);
  }
});

test('grade por dificuldade: todas as palavras cabem e o resto é preenchido', () => {
  for (const [level, [size, count]] of Object.entries(SIZES))
    for (let seed = 1; seed <= 60; seed++) {
      const game = wordsearch.createGame(
        ['a'],
        {},
        {
          level,
          rng: seededRng(seed),
        }
      );
      assert.equal(game.grid.length, size);
      assert.ok(
        game.grid.every((row) => row.length === size && /^[A-Z]+$/.test(row))
      );
      assert.equal(game.placements.length, count);
      assert.equal(new Set(game.placements.map((p) => p.text)).size, count);
      for (const placement of game.placements) {
        const { rows, cols } = lineOf(game, placement);
        let text = '';
        for (let i = 0; i < placement.text.length; i++)
          text +=
            game.grid[placement.start.row + rows * i][
              placement.start.col + cols * i
            ];
        assert.equal(text, placement.text, `${level} #${seed}`);
        assert.ok(
          themes
            .find((theme) => theme.id === game.theme.id)
            .words.includes(placement.text)
        );
      }
    }
});

test('direções: fácil só horizontal e vertical; médio soma diagonais; difícil inverte', () => {
  const seen = { easy: new Set(), medium: new Set(), hard: new Set() };
  for (const level of Object.keys(seen))
    for (let seed = 1; seed <= 80; seed++) {
      const game = wordsearch.createGame(
        ['a'],
        {},
        {
          level,
          rng: seededRng(seed),
        }
      );
      for (const placement of game.placements) {
        const { rows, cols } = lineOf(game, placement);
        seen[level].add(`${rows},${cols}`);
      }
    }
  assert.deepEqual([...seen.easy].sort(), ['0,1', '1,0']);
  assert.ok(
    ![...seen.medium].some((key) => key.includes('-1') && key !== '-1,1')
  );
  assert.ok(seen.medium.has('1,1') && seen.medium.has('-1,1'));
  assert.ok(seen.hard.has('0,-1') && seen.hard.has('-1,0'));
  assert.ok(seen.hard.size === 8);
});

test('mesma semente, mesma grade', () => {
  const make = () =>
    wordsearch.createGame(['a'], {}, { level: 'medium', rng: seededRng(5) });
  assert.deepEqual(make().grid, make().grid);
});

const first = (game) => game.placements[0];

test('marcar por início e fim: certo, errado, invertido e fora de linha', () => {
  const game = wordsearch.createGame(
    ['a'],
    {},
    {
      level: 'hard',
      rng: seededRng(11),
    }
  );
  const target = first(game);
  assert.throws(
    () =>
      wordsearch.processAction(game, 'a', {
        type: 'mark',
        start: { row: 0, col: 0 },
        end: { row: 1, col: 3 },
      }),
    /linha reta/
  );
  assert.throws(
    () =>
      wordsearch.processAction(game, 'a', {
        type: 'mark',
        start: { row: 0, col: 0 },
        end: { row: 0, col: 99 },
      }),
    /dentro da grade/
  );
  assert.throws(
    () =>
      wordsearch.processAction(game, 'a', {
        type: 'mark',
        start: { row: 0, col: 0 },
        end: { row: 0, col: 0 },
      }),
    /linha reta/
  );
  // Marcar de trás para a frente também vale.
  wordsearch.processAction(game, 'a', {
    type: 'mark',
    start: target.end,
    end: target.start,
  });
  assert.equal(game.found.length, 1);
  assert.deepEqual(game.found[0].start, target.start);
  assert.equal(game.progress, undefined);
  const view = wordsearch.publicGame(game, 'a');
  assert.equal(view.progress.a, 1);
  assert.ok(view.words.find((w) => w.id === target.id).found);
  assert.throws(
    () =>
      wordsearch.processAction(game, 'a', {
        type: 'mark',
        start: target.start,
        end: target.end,
      }),
    /não forma uma palavra/,
    'palavra já encontrada não vale de novo'
  );
  assert.equal(game.found.length, 1);
});

test('palavra digitada: com acento e minúscula, e erro quando não está na lista', () => {
  const game = wordsearch.createGame(
    ['a'],
    {},
    {
      level: 'easy',
      rng: seededRng(3),
    }
  );
  const target = first(game);
  assert.throws(
    () => wordsearch.processAction(game, 'a', { type: 'word', text: 'xyzzy' }),
    /não está na lista/
  );
  wordsearch.processAction(game, 'a', {
    type: 'word',
    text: ` ${target.text.toLowerCase()} `,
  });
  assert.equal(game.found.length, 1);
  assert.deepEqual(game.found[0].start, target.start);
  assert.equal(wordsearch.normalize('Ação'), 'ACAO');
  assert.throws(
    () => wordsearch.processAction(game, 'a', { type: 'swap' }),
    /Marque uma palavra/
  );
});

test('estado público lista as palavras, mas só mostra posições das encontradas', () => {
  const game = wordsearch.createGame(
    ['a', 'b'],
    {},
    {
      level: 'medium',
      rng: seededRng(8),
    }
  );
  const view = wordsearch.publicGame(game, 'a');
  assert.equal(view.words.length, 10);
  assert.ok(
    view.words.every((w) => w.text && w.start === null && w.end === null)
  );
  assert.equal('placements' in view, false);
  assert.equal('foundByPlayer' in view, false);
  const json = JSON.stringify(view);
  for (const placement of game.placements)
    assert.equal(
      json.includes(
        `"row":${placement.start.row},"col":${placement.start.col}`
      ),
      false
    );
  const target = first(game);
  wordsearch.processAction(game, 'a', { type: 'word', text: target.text });
  const found = wordsearch
    .publicGame(game, 'a')
    .words.find((w) => w.id === target.id);
  assert.deepEqual(found.start, target.start);
  assert.deepEqual(found.end, target.end);
  assert.throws(() => wordsearch.publicGame(game, 'x'), /não autorizado/);
});

test('cooperativo: palavras compartilhadas, vitória conjunta e revanche', () => {
  let game = wordsearch.createGame(
    ['a', 'b'],
    {},
    {
      level: 'easy',
      rng: seededRng(4),
    }
  );
  const ids = ['a', 'b'];
  game.placements.forEach((placement, index) =>
    wordsearch.processAction(game, ids[index % 2], {
      type: 'word',
      text: placement.text,
    })
  );
  assert.equal(game.status, 'FINISHED');
  assert.equal(game.result.cooperative, true);
  assert.equal(game.score.a.wins, 1);
  assert.equal(game.score.b.wins, 1);
  assert.equal(wordsearch.publicGame(game, 'b').progress.a, 6);
  game = wordsearch.requestRematch(game, 'a');
  game = wordsearch.requestRematch(game, 'b');
  assert.equal(game.status, 'PLAYING');
  assert.equal(game.level, 'easy');
  assert.equal(game.found.length, 0);
});

test('contra o bot: progresso separado, vez alternada e quem completa vence', () => {
  const game = wordsearch.createGame(
    ['a', 'bot'],
    {},
    {
      level: 'easy',
      competitive: true,
      rng: seededRng(6),
    }
  );
  const [one, two] = game.placements;
  assert.throws(
    () => wordsearch.processAction(game, 'bot', { type: 'pass' }),
    /Aguarde a sua vez/
  );
  wordsearch.processAction(game, 'a', { type: 'word', text: one.text });
  assert.equal(game.currentPlayerId, 'bot');
  assert.equal(wordsearch.publicGame(game, 'bot').progress.a, 1);
  assert.equal(
    wordsearch.publicGame(game, 'bot').found.length,
    0,
    'o bot ainda não achou nada'
  );
  // Erro no modo competitivo passa a vez em vez de lançar.
  wordsearch.processAction(game, 'bot', { type: 'word', text: 'errada' });
  assert.equal(game.currentPlayerId, 'a');
  assert.equal(game.feedback.bot.correct, false);
  // A mesma palavra vale para o bot, que tem a própria lista.
  wordsearch.processAction(game, 'a', { type: 'word', text: two.text });
  wordsearch.processAction(game, 'bot', { type: 'word', text: one.text });
  assert.equal(wordsearch.publicGame(game, 'a').progress.bot, 1);
  for (const placement of game.placements.slice(2)) {
    wordsearch.processAction(game, 'a', { type: 'word', text: placement.text });
    if (game.status === 'PLAYING')
      wordsearch.processAction(game, 'bot', { type: 'pass' });
  }
  assert.equal(game.status, 'FINISHED');
  assert.equal(game.result.winnerId, 'a');
});

test('bot encontra palavras nas taxas de 25%, 55% e 85% por tentativa', () => {
  const rates = { easy: 0.25, medium: 0.55, hard: 0.85 };
  for (const [level, expected] of Object.entries(rates)) {
    const game = wordsearch.createGame(
      ['a', 'bot'],
      {},
      {
        level: 'hard',
        competitive: true,
        rng: seededRng(2),
      }
    );
    const rng = seededRng(1234);
    let hits = 0;
    const tries = 4000;
    for (let i = 0; i < tries; i++) {
      const action = chooseBotAction('wordsearch', game, 'bot', level, { rng });
      if (action.type === 'word') hits++;
    }
    assert.ok(
      Math.abs(hits / tries - expected) < 0.03,
      `${level}: ${hits / tries}`
    );
  }
});

test('bots concluem o caça-palavras em todos os níveis e a solução não vaza', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const rng = seededRng(21);
    const game = wordsearch.createGame(
      ['a', 'bot'],
      {},
      {
        level: 'easy',
        competitive: true,
        rng,
      }
    );
    for (let turn = 0; game.status === 'PLAYING' && turn < 4000; turn++) {
      const id = game.currentPlayerId;
      const action = chooseBotAction('wordsearch', game, id, level, { rng });
      wordsearch.processAction(game, id, action);
    }
    assert.equal(game.status, 'FINISHED', level);
  }
});

test('catálogo e mesas: registrado, individual, com amigo e sem bot', () => {
  const engine = getGameEngine('wordsearch');
  assert.equal(engine.name, 'Caça-palavras');
  assert.equal(engine.solo, true);
  const { rooms, person } = setup();
  const ana = person('Ana');
  const solo = rooms.createRoom(ana, {
    gameId: 'wordsearch',
    mode: 'solo',
    level: 'hard',
  });
  assert.equal(solo.game.size, 15);
  assert.equal(solo.game.competitive, false);
  assert.throws(
    () =>
      rooms.createRoom(ana, {
        gameId: 'wordsearch',
        mode: 'bot',
        level: 'medium',
        difficulty: 'easy',
      }),
    /sem bots/
  );
  assert.throws(
    () =>
      rooms.createRoom(ana, { gameId: 'wordsearch', mode: 'solo', level: 'x' }),
    /dificuldade do caça-palavras/
  );
  const view = rooms.snapshot(solo, ana.id);
  assert.equal('placements' in view.game, false);
  assert.equal(view.game.words.length, 14);
});
