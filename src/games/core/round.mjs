import { requireValue } from '../../shared/errors.mjs';

export function createRound(playerIds, previousScore = {}) {
  requireValue(
    Array.isArray(playerIds) &&
      playerIds.length >= 1 &&
      playerIds.length <= 8 &&
      new Set(playerIds).size === playerIds.length,
    'Escolha de um a oito jogadores diferentes.'
  );
  return {
    status: 'PLAYING',
    playerIds,
    currentPlayerId: null,
    history: [],
    result: null,
    rematch: [],
    score: Object.fromEntries(
      playerIds.map((id) => [
        id,
        { ...(previousScore[id] ?? { wins: 0, points: 0 }) },
      ])
    ),
  };
}

export function requirePlayer(game, playerId) {
  requireValue(
    game.playerIds.includes(playerId),
    'Você não participa desta partida.',
    403
  );
  requireValue(game.status === 'PLAYING', 'Esta rodada já terminou.');
}

export function finishTogether(game) {
  game.status = 'FINISHED';
  for (const id of game.playerIds) {
    game.score[id].wins++;
    game.score[id].points++;
  }
  game.result = { cooperative: true, winnerId: null, points: 1 };
}

export function finishCompetitive(game, winnerId) {
  game.status = 'FINISHED';
  game.score[winnerId].wins++;
  game.score[winnerId].points++;
  game.result = { cooperative: false, winnerId, points: 1 };
}

export function recordAction(game, action) {
  game.history.push(action);
  game.history = game.history.slice(-40);
}

export function rematch(game, playerId, createGame, options) {
  requireValue(
    game.playerIds.includes(playerId),
    'Jogador não autorizado.',
    403
  );
  requireValue(game.status === 'FINISHED', 'A rodada ainda não terminou.');
  if (!game.rematch.includes(playerId)) game.rematch.push(playerId);
  return game.rematch.length === game.playerIds.length
    ? createGame(game.playerIds, game.score, options)
    : game;
}
