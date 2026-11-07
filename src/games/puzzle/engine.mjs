import { requireValue } from '../../shared/errors.mjs';
import { shuffle, systemRng } from '../core/rng.mjs';
import {
  createRound,
  requirePlayer,
  finishTogether,
  finishCompetitive,
  recordAction,
  rematch,
} from '../core/round.mjs';

export function createGame(
  playerIds,
  previousScore = {},
  { image = '/garden.svg', competitive = false, size = 3, rng = systemRng } = {}
) {
  requireValue(
    [3, 4, 5].includes(size),
    'O quebra-cabeça tem 9, 16 ou 25 partes.'
  );
  requireValue(
    playerIds.length <= 2,
    'O quebra-cabeça recebe até duas pessoas.'
  );
  const pieces = Array.from({ length: size * size }, (_, i) => i);
  do {
    shuffle(pieces, rng);
  } while (pieces.every((piece, i) => piece === i));
  return {
    ...createRound(playerIds, previousScore),
    pieces,
    image,
    size,
    moves: 0,
    competitive,
    piecesByPlayer: Object.fromEntries(
      playerIds.map((id) => [id, [...pieces]])
    ),
    movesByPlayer: Object.fromEntries(playerIds.map((id) => [id, 0])),
    currentPlayerId: competitive ? playerIds[0] : null,
  };
}

export function processAction(game, playerId, action) {
  requirePlayer(game, playerId);
  if (game.competitive)
    requireValue(game.currentPlayerId === playerId, 'Aguarde a sua vez.', 409);
  requireValue(
    action.type === 'swap',
    'Escolha duas partes da imagem para trocar.'
  );
  // Mesas salvas antes do tamanho variável são 3×3.
  const total = (game.size ?? 3) ** 2;
  const valid = (index) =>
    Number.isInteger(index) && index >= 0 && index < total;
  requireValue(
    valid(action.from) && valid(action.to) && action.from !== action.to,
    `Escolha duas posições diferentes entre 1 e ${total}.`
  );
  const pieces = game.competitive ? game.piecesByPlayer[playerId] : game.pieces;
  [pieces[action.from], pieces[action.to]] = [
    pieces[action.to],
    pieces[action.from],
  ];
  if (game.competitive) game.movesByPlayer[playerId]++;
  else game.moves++;
  recordAction(game, {
    playerId,
    type: 'swap',
    from: action.from,
    to: action.to,
  });
  if (pieces.every((piece, i) => piece === i)) {
    if (game.competitive) finishCompetitive(game, playerId);
    else finishTogether(game);
  } else if (game.competitive)
    game.currentPlayerId = game.playerIds.find((id) => id !== playerId);
  return game;
}

export function publicGame(game, playerId) {
  requireValue(
    game.playerIds.includes(playerId),
    'Jogador não autorizado.',
    403
  );
  const { piecesByPlayer, movesByPlayer, ...state } = game;
  return {
    ...state,
    size: game.size ?? 3,
    pieces: game.competitive ? piecesByPlayer[playerId] : game.pieces,
    moves: game.competitive ? movesByPlayer[playerId] : game.moves,
    progress: Object.fromEntries(
      game.playerIds.map((id) => [
        id,
        (game.competitive ? piecesByPlayer[id] : game.pieces).filter(
          (piece, i) => piece === i
        ).length,
      ])
    ),
  };
}

export const requestRematch = (game, playerId) =>
  rematch(game, playerId, createGame, {
    image: game.image,
    competitive: game.competitive,
    size: game.size ?? 3,
  });
