import { requireValue } from '../../shared/errors.mjs';
import { shuffle, systemRng } from '../core/rng.mjs';

export function createGame(
  playerIds,
  previousScore = {},
  { rng = systemRng } = {}
) {
  requireValue(
    playerIds.length >= 2 &&
      playerIds.length <= 4 &&
      new Set(playerIds).size === playerIds.length,
    'São necessários de dois a quatro jogadores diferentes.'
  );
  const tiles = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) tiles.push({ id: `${a}-${b}`, a, b });
  }
  shuffle(tiles, rng);
  const hands = Object.fromEntries(
    playerIds.map((id) => [id, tiles.splice(0, 7)])
  );
  const strength = (tile) =>
    tile.a === tile.b ? 100 + tile.a : tile.a + tile.b;
  const currentPlayerId = playerIds.reduce((best, id) =>
    Math.max(...hands[id].map(strength)) >
    Math.max(...hands[best].map(strength))
      ? id
      : best
  );
  return {
    status: 'PLAYING',
    playerIds,
    hands,
    stock: tiles,
    board: [],
    currentPlayerId,
    passes: 0,
    history: [],
    result: null,
    rematch: [],
    score: Object.fromEntries(
      playerIds.map((id) => [id, previousScore[id] ?? { wins: 0, points: 0 }])
    ),
  };
}

export function playableSides(board, tile) {
  if (!board.length) return ['right'];
  const sides = [];
  const left = board[0].a;
  const right = board.at(-1).b;
  if (tile.a === left || tile.b === left) sides.push('left');
  if (tile.a === right || tile.b === right) sides.push('right');
  return sides;
}

export function canPlay(game, playerId) {
  return game.hands[playerId].some(
    (tile) => playableSides(game.board, tile).length
  );
}

const pipSum = (hand) =>
  hand.reduce((total, tile) => total + tile.a + tile.b, 0);

function finish(game, winnerId, reason) {
  game.status = 'FINISHED';
  const totals = Object.fromEntries(
    game.playerIds.map((id) => [id, pipSum(game.hands[id])])
  );
  // Quem ganha leva o que sobrou nas mãos dos outros, menos o que sobrou na sua.
  const others = game.playerIds
    .filter((id) => id !== winnerId)
    .reduce((sum, id) => sum + totals[id], 0);
  const points = winnerId ? Math.max(0, others - totals[winnerId]) : 0;
  if (winnerId) {
    game.score[winnerId].wins++;
    game.score[winnerId].points += points;
  }
  game.result = { winnerId, reason, points, totals };
}

export function processAction(game, playerId, action) {
  requireValue(game.status === 'PLAYING', 'Esta rodada já terminou.');
  requireValue(game.currentPlayerId === playerId, 'Aguarde a sua vez.', 409);
  const hand = game.hands[playerId];
  requireValue(hand, 'Você não participa desta partida.', 403);
  const order = game.playerIds;
  const next = order[(order.indexOf(playerId) + 1) % order.length];
  if (action.type === 'play') {
    const index = hand.findIndex((tile) => tile.id === action.tileId);
    requireValue(index >= 0, 'Esta peça não está na sua mão.');
    const tile = hand[index];
    requireValue(
      playableSides(game.board, tile).includes(action.side),
      'A peça não encaixa nessa ponta.'
    );
    let { a, b } = tile;
    if (game.board.length) {
      if (action.side === 'left' && b !== game.board[0].a) [a, b] = [b, a];
      if (action.side === 'right' && a !== game.board.at(-1).b) [a, b] = [b, a];
    }
    const placed = { ...tile, a, b };
    if (action.side === 'left') game.board.unshift(placed);
    else game.board.push(placed);
    hand.splice(index, 1);
    game.passes = 0;
    game.history.push({ playerId, type: 'play', tile: tile.id });
    if (!hand.length) finish(game, playerId, 'empty');
    else game.currentPlayerId = next;
  } else if (action.type === 'draw') {
    requireValue(
      !canPlay(game, playerId),
      'Você já tem uma peça que pode jogar.'
    );
    requireValue(
      game.stock.length > 0,
      'Não há mais peças para comprar. Passe a vez.'
    );
    hand.push(game.stock.pop());
    game.history.push({ playerId, type: 'draw' });
  } else if (action.type === 'pass') {
    requireValue(
      !game.stock.length && !canPlay(game, playerId),
      'Só é possível passar sem peças disponíveis para jogar ou comprar.'
    );
    game.history.push({ playerId, type: 'pass' });
    game.passes++;
    if (game.passes >= game.playerIds.length) {
      // Mesa fechada: ganha quem tem menos pontos na mão; empate no menor, ninguém.
      const sums = game.playerIds
        .map((id) => ({ id, sum: pipSum(game.hands[id]) }))
        .toSorted((a, b) => a.sum - b.sum);
      const tie = sums[1] && sums[1].sum === sums[0].sum;
      finish(game, tie ? null : sums[0].id, 'blocked');
    } else game.currentPlayerId = next;
  } else requireValue(false, 'Jogada desconhecida.');
  game.history = game.history.slice(-40);
  return game;
}

export function requestRematch(game, playerId) {
  requireValue(game.status === 'FINISHED', 'A rodada ainda não terminou.');
  requireValue(
    game.playerIds.includes(playerId),
    'Jogador não autorizado.',
    403
  );
  if (!game.rematch.includes(playerId)) game.rematch.push(playerId);
  return game.rematch.length >= game.playerIds.length
    ? createGame(game.playerIds, game.score)
    : game;
}

export function publicGame(game, playerId) {
  const { hands, stock, ...state } = game;
  return {
    ...state,
    hand: hands[playerId],
    stockCount: stock.length,
    handCounts: Object.fromEntries(
      game.playerIds.map((id) => [id, hands[id].length])
    ),
  };
}
