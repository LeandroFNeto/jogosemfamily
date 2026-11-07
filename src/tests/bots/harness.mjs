import { seededRng } from '../../games/core/rng.mjs';
import { chooseBotAction } from '../../games/core/bots.mjs';
import * as domino from '../../games/domino/engine.mjs';
import * as cards from '../../games/cards/engine.mjs';
import * as cacheta from '../../games/cacheta/engine.mjs';

/**
 * Joga uma partida completa entre dois níveis (A e B) com sementes fixas.
 * Os lugares alternam conforme a semente, para não favorecer quem começa.
 * Devolve 'A', 'B' ou 'draw'.
 */
export function playDomino(seed, levelA, levelB, options = {}) {
  const rng = seededRng(seed);
  const bots = { A: seededRng(seed + 1), B: seededRng(seed + 2) };
  const levels = { A: levelA, B: levelB };
  const ids = seed % 2 ? ['A', 'B'] : ['B', 'A'];
  const game = domino.createGame(ids, {}, { rng });
  for (let guard = 0; game.status === 'PLAYING' && guard < 400; guard++) {
    const id = game.currentPlayerId;
    const action = chooseBotAction('domino', game, id, levels[id], {
      rng: bots[id],
      ...options,
    });
    domino.processAction(game, id, action);
  }
  return game.result?.winnerId ?? 'draw';
}

/** Truco até 12 pontos; `seats` define quantos jogadores (2 ou 4). */
export function playCards(
  seed,
  levelA,
  levelB,
  { seats = 2, ...options } = {}
) {
  const rng = seededRng(seed);
  const bots = { A: seededRng(seed + 1), B: seededRng(seed + 2) };
  const levels = { A: levelA, B: levelB };
  const first = seed % 2 ? 'A' : 'B';
  const second = first === 'A' ? 'B' : 'A';
  const ids = Array.from({ length: seats }, (_, i) => (i % 2 ? second : first));
  const names = ids.map((id, i) => `${id}${i}`);
  const levelOf = Object.fromEntries(
    names.map((name) => [name, levels[name[0]]])
  );
  const botOf = (name) => bots[name[0]];
  const game = cards.createGame(names, {}, { rng });
  for (let guard = 0; game.status === 'PLAYING' && guard < 2000; guard++) {
    if (game.phase === 'between') {
      cards.processAction(game, names[0], { type: 'next-hand' }, { rng });
      continue;
    }
    const id =
      game.decisionPlayerId ||
      game.pendingRaise?.responderId ||
      game.currentPlayerId;
    const action = chooseBotAction('cards', game, id, levelOf[id], {
      rng: botOf(id),
      ...options,
    });
    cards.processAction(game, id, action, { rng });
  }
  const winner = game.result?.winnerId;
  return winner ? winner[0] : 'draw';
}

/** Resultado de `games` partidas: vitórias de A, de B e empates. */
export function tournament(play, games, levelA, levelB, options) {
  const tally = { A: 0, B: 0, draw: 0 };
  for (let seed = 1; seed <= games; seed++)
    tally[play(seed * 7919, levelA, levelB, options)]++;
  return {
    ...tally,
    rate: (tally.A + tally.draw / 2) / games,
  };
}

/** Cacheta entre dois jogadores; empate quando ninguém bate no limite de turnos. */
export function playCacheta(seed, levelA, levelB, options = {}) {
  const rng = seededRng(seed);
  const bots = { A: seededRng(seed + 1), B: seededRng(seed + 2) };
  const levels = { A: levelA, B: levelB };
  const ids = seed % 2 ? ['A', 'B'] : ['B', 'A'];
  let game = cacheta.createGame(ids, {}, { rng });
  for (let guard = 0; game.status === 'PLAYING' && guard < 800; guard++) {
    const id = game.currentPlayerId;
    const action = chooseBotAction('cacheta', game, id, levels[id], {
      rng: bots[id],
      ...options,
    });
    game = cacheta.processAction(game, id, action, { rng });
  }
  return game.result?.winnerId ?? 'draw';
}
