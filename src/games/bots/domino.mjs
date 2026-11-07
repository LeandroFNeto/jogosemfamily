import { playableSides, processAction } from '../domino/engine.mjs';
import { pick, shuffle } from '../core/rng.mjs';

/**
 * Bots do dominó. Cada um decide só com a visão pública do jogador: a própria
 * mão, a mesa, o tamanho das mãos adversárias e o histórico.
 */
export function dominoView(game, playerId) {
  return {
    playerId,
    playerIds: game.playerIds,
    hand: game.hands[playerId],
    board: game.board,
    stockCount: game.stock.length,
    handCounts: Object.fromEntries(
      game.playerIds.map((id) => [id, game.hands[id].length])
    ),
    passes: game.passes,
    history: game.history,
  };
}

const legalMoves = (view) =>
  view.hand.flatMap((tile) =>
    playableSides(view.board, tile).map((side) => ({ tile, side }))
  );
const fallback = (view) => ({ type: view.stockCount ? 'draw' : 'pass' });
const asAction = (move) => ({
  type: 'play',
  tileId: move.tile.id,
  side: move.side,
});

export function easyDomino(view, { rng }) {
  const moves = legalMoves(view);
  return moves.length ? asAction(pick(moves, rng)) : fallback(view);
}

// Número que fica exposto na ponta depois da jogada.
function exposedEnd(view, { tile, side }) {
  if (!view.board.length) return tile.b;
  const edge = side === 'left' ? view.board[0].a : view.board.at(-1).b;
  return tile.a === edge ? tile.b : tile.a;
}

// Maior soma primeiro, duplas cedo (são difíceis de encaixar depois) e
// preferência por deixar na ponta um número que a própria mão ainda cobre.
function weight(view, move) {
  const { tile } = move;
  const covered = view.hand.filter(
    (other) =>
      other.id !== tile.id &&
      [other.a, other.b].includes(exposedEnd(view, move))
  ).length;
  return tile.a + tile.b + (tile.a === tile.b ? 3 : 0) + covered * 4;
}

export function mediumDomino(view) {
  const moves = legalMoves(view);
  if (!moves.length) return fallback(view);
  return asAction(
    moves.toSorted((a, b) => weight(view, b) - weight(view, a))[0]
  );
}

function allTiles() {
  const tiles = [];
  for (let a = 0; a <= 6; a++)
    for (let b = a; b <= 6; b++) tiles.push({ id: `${a}-${b}`, a, b });
  return tiles;
}

/** Peças que podem estar na mão do adversário ou no monte. */
export function unseenTiles(view) {
  const known = new Set([...view.hand, ...view.board].map((tile) => tile.id));
  return allTiles().filter((tile) => !known.has(tile.id));
}

// Joga o resto da rodada com a política média e diz se `me` ganhou (1, 0,5 ou 0).
function playout(sim, me) {
  for (let guard = 0; sim.status === 'PLAYING' && guard < 80; guard++) {
    const id = sim.currentPlayerId;
    sim.hands[id] ??= [];
    processAction(sim, id, mediumDomino(dominoView(sim, id)));
  }
  if (sim.status !== 'FINISHED') return 0.5;
  const winner = sim.result.winnerId;
  return winner === me ? 1 : winner === null ? 0.5 : 0;
}

export function hardDomino(view, { rng, now, budgetMs, samples }) {
  const moves = legalMoves(view);
  if (!moves.length) return fallback(view);
  if (moves.length === 1) return asAction(moves[0]);
  const me = view.playerId;
  const opponents = view.playerIds.filter((id) => id !== me);
  const unseen = unseenTiles(view);
  const opponentsTotal = opponents.reduce(
    (sum, id) => sum + view.handCounts[id],
    0
  );
  const totals = new Map(moves.map((move) => [move, 0]));
  const started = now();
  let done = 0;
  for (let k = 0; k < samples; k++) {
    if (k > 0 && now() - started > budgetMs) break;
    const pool = shuffle([...unseen], rng);
    for (const move of moves) {
      const sim = {
        status: 'PLAYING',
        playerIds: view.playerIds,
        hands: Object.fromEntries([
          [me, view.hand.map((tile) => ({ ...tile }))],
          ...opponents.map((id, index) => {
            const before = opponents
              .slice(0, index)
              .reduce((sum, other) => sum + view.handCounts[other], 0);
            return [
              id,
              pool
                .slice(before, before + view.handCounts[id])
                .map((tile) => ({ ...tile })),
            ];
          }),
        ]),
        stock: pool.slice(opponentsTotal).map((tile) => ({ ...tile })),
        board: view.board.map((tile) => ({ ...tile })),
        currentPlayerId: me,
        passes: view.passes,
        history: [],
        result: null,
        rematch: [],
        score: Object.fromEntries(
          view.playerIds.map((id) => [id, { wins: 0, points: 0 }])
        ),
      };
      processAction(sim, me, asAction(move));
      totals.set(move, totals.get(move) + playout(sim, me));
    }
    done++;
  }
  if (!done) return mediumDomino(view);
  const best = moves.toSorted(
    (a, b) => totals.get(b) - totals.get(a) || weight(view, b) - weight(view, a)
  )[0];
  return asAction(best);
}
