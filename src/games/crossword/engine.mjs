import { randomInt } from 'node:crypto';
import { requireValue } from '../../shared/errors.mjs';
import {
  createRound,
  requirePlayer,
  finishTogether,
  finishCompetitive,
  recordAction,
  rematch,
} from '../core/round.mjs';
import { crosswords } from './puzzles.mjs';

export function createGame(
  playerIds,
  previousScore = {},
  { competitive = false } = {}
) {
  requireValue(
    playerIds.length <= 2,
    'As palavras cruzadas recebem até duas pessoas.'
  );
  return {
    ...createRound(playerIds, previousScore),
    puzzleIndex: randomInt(crosswords.length),
    solved: [],
    competitive,
    solvedByPlayer: Object.fromEntries(playerIds.map((id) => [id, []])),
    currentPlayerId: competitive ? playerIds[0] : null,
    feedback: {},
  };
}

export function processAction(game, playerId, action) {
  requirePlayer(game, playerId);
  if (game.competitive) {
    requireValue(game.currentPlayerId === playerId, 'Aguarde a sua vez.', 409);
    if (action.type === 'pass') {
      game.currentPlayerId = game.playerIds.find((id) => id !== playerId);
      recordAction(game, { playerId, type: 'pass' });
      return game;
    }
  }
  requireValue(action.type === 'answer', 'Escolha uma pista para responder.');
  const word = crosswords[game.puzzleIndex].words.find(
    (word) => word.id === action.wordId
  );
  const solved = game.competitive ? game.solvedByPlayer[playerId] : game.solved;
  requireValue(
    word && !solved.includes(word.id),
    'Esta pista não está disponível.'
  );
  requireValue(
    typeof action.answer === 'string' && action.answer.length <= 50,
    'Escreva uma resposta com até 50 caracteres.'
  );
  const answer = action.answer
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (!game.competitive)
    requireValue(
      answer === word.answer,
      'Ainda não é essa palavra. Confira a pista e tente novamente.'
    );
  game.feedback[playerId] = { playerId, correct: answer === word.answer };
  if (answer === word.answer) solved.push(word.id);
  recordAction(game, { playerId, type: 'answer', wordId: word.id });
  if (solved.length === crosswords[game.puzzleIndex].words.length) {
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
  const { puzzleIndex, solvedByPlayer, solved: sharedSolved, ...state } = game;
  const solved = game.competitive ? solvedByPlayer[playerId] : sharedSolved;
  const puzzle = crosswords[puzzleIndex];
  return {
    ...state,
    feedback: game.feedback[playerId] || null,
    solved,
    title: puzzle.title,
    rows: puzzle.rows,
    columns: puzzle.columns,
    progress: Object.fromEntries(
      game.playerIds.map((id) => [
        id,
        game.competitive ? solvedByPlayer[id].length : sharedSolved.length,
      ])
    ),
    words: puzzle.words.map(({ answer, ...word }) => ({
      ...word,
      length: answer.length,
      answer: solved.includes(word.id) ? answer : null,
    })),
  };
}

export const requestRematch = (game, playerId) =>
  rematch(game, playerId, createGame, { competitive: game.competitive });
