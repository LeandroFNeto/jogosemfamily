import { requireValue } from '../../shared/errors.mjs';
import { shuffle, systemRng } from '../core/rng.mjs';
import {
  createRound,
  requirePlayer,
  finishCompetitive,
  recordAction,
  rematch,
} from '../core/round.mjs';
import { arrange, knockOptions } from './melds.mjs';

export const HAND_SIZE = 9;
/** Limite de turnos por jogador: evita partidas sem fim se ninguém bater. */
export const TURN_LIMIT = 150;
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];

/** Baralho de 52 cartas mais 2 curingas. */
export function fullDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (let rank = 1; rank <= 13; rank++)
      deck.push({ id: `${suit}-${rank}`, suit, rank });
  deck.push({ id: 'joker-1', suit: 'joker', rank: 0 });
  deck.push({ id: 'joker-2', suit: 'joker', rank: 0 });
  return deck;
}

export function createGame(
  playerIds,
  previousScore = {},
  { rng = systemRng } = {}
) {
  requireValue(
    Array.isArray(playerIds) && playerIds.length >= 2 && playerIds.length <= 4,
    'A Cacheta recebe de 2 a 4 jogadores.'
  );
  const deck = shuffle(fullDeck(), rng);
  const game = {
    ...createRound(playerIds, previousScore),
    hands: Object.fromEntries(
      playerIds.map((id) => [id, deck.splice(0, HAND_SIZE)])
    ),
    discard: [deck.pop()],
    stock: deck,
    phase: 'draw',
    currentPlayerId: playerIds[0],
    // Carta que o jogador acabou de pegar do descarte (não pode devolvê-la).
    takenFromDiscard: null,
    // Cartas que cada jogador pegou do descarte: informação vista por todos.
    picks: [],
    turns: 0,
  };
  return game;
}

function recycle(game, rng) {
  if (game.stock.length || game.discard.length < 2) return;
  const top = game.discard.pop();
  game.stock = shuffle(game.discard, rng);
  game.discard = [top];
}

function nextPlayer(game, playerId) {
  const seat = game.playerIds.indexOf(playerId);
  return game.playerIds[(seat + 1) % game.playerIds.length];
}

function endTurn(game, playerId) {
  game.takenFromDiscard = null;
  game.phase = 'draw';
  game.currentPlayerId = nextPlayer(game, playerId);
  game.turns++;
  if (game.turns >= TURN_LIMIT * game.playerIds.length) {
    game.status = 'FINISHED';
    game.currentPlayerId = null;
    game.result = { cooperative: false, winnerId: null, draw: true, points: 0 };
    reveal(game);
  }
}

/** Ao fim da partida todos veem as cartas e o que ficou fora de jogos. */
function reveal(game, winnerMelds = null, winnerId = null) {
  game.revealed = Object.fromEntries(
    game.playerIds.map((id) => {
      const arranged = id === winnerId ? winnerMelds : arrange(game.hands[id]);
      return [
        id,
        {
          cards: game.hands[id],
          melds: arranged.melds,
          leftover: arranged.leftover,
        },
      ];
    })
  );
}

export function processAction(
  game,
  playerId,
  action,
  { rng = systemRng } = {}
) {
  requirePlayer(game, playerId);
  requireValue(game.currentPlayerId === playerId, 'Aguarde a sua vez.', 409);
  const hand = game.hands[playerId];
  if (action.type === 'draw-stock' || action.type === 'draw-discard') {
    requireValue(game.phase === 'draw', 'Você já comprou nesta vez.');
    if (action.type === 'draw-stock') {
      recycle(game, rng);
      requireValue(
        game.stock.length > 0,
        'O monte acabou. Pegue a carta do descarte.'
      );
      hand.push(game.stock.pop());
      recordAction(game, { playerId, type: 'draw-stock' });
    } else {
      requireValue(game.discard.length > 0, 'Não há carta no descarte.');
      const card = game.discard.pop();
      hand.push(card);
      game.takenFromDiscard = card.id;
      game.picks.push({ playerId, card });
      game.picks = game.picks.slice(-40);
      recordAction(game, { playerId, type: 'draw-discard', cardId: card.id });
    }
    game.phase = 'discard';
    return game;
  }
  requireValue(
    game.phase === 'discard',
    'Compre uma carta antes de descartar ou bater.'
  );
  if (action.type === 'discard') {
    const index = hand.findIndex((card) => card.id === action.cardId);
    requireValue(index >= 0, 'Essa carta não está na sua mão.');
    requireValue(
      action.cardId !== game.takenFromDiscard,
      'Você acabou de pegar esta carta do descarte. Descarte outra.'
    );
    const [card] = hand.splice(index, 1);
    game.discard.push(card);
    recordAction(game, { playerId, type: 'discard', cardId: card.id });
    recycle(game, rng);
    endTurn(game, playerId);
    return game;
  }
  if (action.type === 'knock') {
    const options = knockOptions(hand);
    const choice = action.cardId
      ? options.find((option) => option.cardId === action.cardId)
      : options[0];
    requireValue(
      choice,
      'Suas cartas ainda não formam jogos para bater. Continue a partida.'
    );
    const index = hand.findIndex((card) => card.id === choice.cardId);
    const [card] = hand.splice(index, 1);
    game.discard.push(card);
    finishCompetitive(game, playerId);
    game.currentPlayerId = null;
    game.result.melds = choice.melds;
    reveal(game, { melds: choice.melds, leftover: [] }, playerId);
    recordAction(game, { playerId, type: 'knock' });
    return game;
  }
  requireValue(false, 'Jogada de Cacheta desconhecida.');
}

export function publicGame(game, playerId) {
  requireValue(
    game.playerIds.includes(playerId),
    'Jogador não autorizado.',
    403
  );
  const { hands, stock, discard, picks, ...state } = game;
  const hand = hands[playerId];
  const mine = game.currentPlayerId === playerId && game.phase === 'discard';
  return {
    ...state,
    hand,
    handCounts: Object.fromEntries(
      game.playerIds.map((id) => [id, hands[id].length])
    ),
    stockCount: stock.length,
    discardTop: discard.at(-1) ?? null,
    discardCount: discard.length,
    // Descartes que permitem bater: só calculado para quem pode agir.
    knockCardIds:
      mine && game.status === 'PLAYING'
        ? knockOptions(hand).map((option) => option.cardId)
        : [],
    revealed: game.status === 'FINISHED' ? game.revealed : null,
  };
}

export const requestRematch = (game, playerId) =>
  rematch(game, playerId, createGame);
