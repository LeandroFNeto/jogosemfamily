import { requireValue } from '../../shared/errors.mjs';
import { shuffle, systemRng } from '../core/rng.mjs';
import {
  createRound,
  requirePlayer,
  recordAction,
  rematch,
} from '../core/round.mjs';

export const rankOrder = [4, 5, 6, 7, 12, 11, 13, 1, 2, 3];
const suitOrder = ['diamonds', 'spades', 'hearts', 'clubs'];
const stakes = [1, 3, 6, 9, 12];
export const teamOf = (game, id) => game.playerIds.indexOf(id) % 2;
export function cardStrength(card, vira) {
  const manilha =
    rankOrder[(rankOrder.indexOf(vira.rank) + 1) % rankOrder.length];
  return card.rank === manilha
    ? 20 + suitOrder.indexOf(card.suit)
    : rankOrder.indexOf(card.rank);
}

/** Baralho do Truco (40 cartas), na ordem de criação. */
export function fullDeck() {
  const deck = [];
  for (const suit of suitOrder)
    for (const rank of rankOrder)
      deck.push({ id: `${suit}-${rank}`, suit, rank });
  return deck;
}

function deal(game, rng = systemRng) {
  const deck = shuffle(fullDeck(), rng);
  // Cartas já jogadas nesta mão (públicas): ajudam o bot difícil a contar cartas.
  game.played = [];
  game.hands = Object.fromEntries(
    game.playerIds.map((id) => [id, deck.splice(0, 3)])
  );
  game.vira = deck.pop();
  game.trick = [];
  game.trickWinners = [];
  game.lastTrick = [];
  game.pendingRaise = null;
  game.raiseAllowedTeam = null;
  game.currentPlayerId = game.playerIds[game.leaderSeat];
  game.currentTrickLeaderId = game.currentPlayerId;
  const eleven = game.teamPoints.indexOf(11);
  game.stake =
    eleven >= 0 && !game.teamPoints.every((points) => points === 11) ? 3 : 1;
  game.elevenTeam =
    eleven >= 0 && !game.teamPoints.every((points) => points === 11)
      ? eleven
      : null;
  game.phase = game.elevenTeam === null ? 'play' : 'eleven';
  game.decisionPlayerId =
    game.phase === 'eleven'
      ? game.playerIds.find((id) => teamOf(game, id) === game.elevenTeam)
      : null;
}

export function createGame(
  playerIds,
  previousScore = {},
  { rng = systemRng } = {}
) {
  requireValue(
    [2, 4, 6, 8].includes(playerIds.length),
    'O Truco usa duas equipes com 2, 4, 6 ou 8 participantes no total.'
  );
  const game = {
    ...createRound(playerIds, previousScore),
    teamPoints: [0, 0],
    leaderSeat: 0,
    handNumber: 1,
    lastHand: null,
  };
  deal(game, rng);
  return game;
}

function finishHand(game, winnerTeam, points = game.stake, reason = 'tricks') {
  if (winnerTeam !== null) game.teamPoints[winnerTeam] += points;
  game.lastHand = {
    winnerTeam,
    points: winnerTeam === null ? 0 : points,
    reason,
  };
  game.pendingRaise = null;
  if (winnerTeam !== null && game.teamPoints[winnerTeam] >= 12) {
    game.status = 'FINISHED';
    const winners = game.playerIds.filter(
      (id) => teamOf(game, id) === winnerTeam
    );
    for (const id of winners) {
      game.score[id].wins++;
      game.score[id].points += game.teamPoints[winnerTeam];
    }
    game.result = {
      winnerId: winners[0],
      winnerIds: winners,
      winnerTeam,
      points: game.teamPoints[winnerTeam],
    };
  } else game.phase = 'between';
}

function trickResult(game) {
  const best = Math.max(
    ...game.trick.map((play) => cardStrength(play.card, game.vira))
  );
  const bestPlays = game.trick.filter(
    (play) => cardStrength(play.card, game.vira) === best
  );
  const teams = new Set(bestPlays.map((play) => teamOf(game, play.playerId)));
  return {
    team: teams.size === 1 ? [...teams][0] : null,
    leaderId: bestPlays[0].playerId,
  };
}

export function processAction(
  game,
  playerId,
  action,
  { rng = systemRng } = {}
) {
  requirePlayer(game, playerId);
  if (action.type === 'next-hand') {
    requireValue(game.phase === 'between', 'Esta mão ainda não terminou.');
    game.leaderSeat = (game.leaderSeat + 1) % game.playerIds.length;
    game.handNumber++;
    deal(game, rng);
    recordAction(game, { playerId, type: 'next-hand' });
    return game;
  }
  if (game.phase === 'eleven') {
    requireValue(
      playerId === game.decisionPlayerId,
      'Aguarde a decisão da equipe com onze pontos.',
      409
    );
    requireValue(
      ['accept', 'fold'].includes(action.type),
      'Escolha jogar ou correr da mão de onze.'
    );
    if (action.type === 'fold')
      finishHand(game, 1 - game.elevenTeam, 1, 'fold');
    else {
      game.phase = 'play';
      game.decisionPlayerId = null;
    }
    recordAction(game, { playerId, type: action.type });
    return game;
  }
  requireValue(game.phase === 'play', 'Toque em Próxima mão para continuar.');
  if (game.pendingRaise) {
    requireValue(
      game.pendingRaise.responderId === playerId,
      'Aguarde a resposta ao pedido de aumento.',
      409
    );
    requireValue(
      ['accept', 'fold', 'raise'].includes(action.type),
      'Aceite, corra ou aumente o pedido.'
    );
    const pending = game.pendingRaise;
    if (action.type === 'raise')
      requireValue(
        stakes.indexOf(pending.value) < stakes.length - 1,
        'Esta mão já vale doze.'
      );
    if (action.type === 'fold')
      finishHand(game, pending.team, game.stake, 'fold');
    else {
      game.stake = pending.value;
      game.pendingRaise = null;
      game.raiseAllowedTeam = teamOf(game, playerId);
      if (action.type === 'raise')
        game.pendingRaise = {
          team: teamOf(game, playerId),
          value: stakes[stakes.indexOf(game.stake) + 1],
          responderId: pending.requesterId,
          requesterId: playerId,
        };
    }
  } else {
    requireValue(game.currentPlayerId === playerId, 'Aguarde a sua vez.', 409);
    if (action.type === 'raise') {
      requireValue(
        !game.teamPoints.includes(11),
        'Não há aumento na mão de onze ou na mão de ferro.'
      );
      requireValue(
        game.raiseAllowedTeam === null ||
          game.raiseAllowedTeam === teamOf(game, playerId),
        'Só a equipe que aceitou pode pedir o próximo aumento.'
      );
      const value = stakes[stakes.indexOf(game.stake) + 1];
      requireValue(value, 'Esta mão já vale doze.');
      const index = game.playerIds.indexOf(playerId);
      const responderId = game.playerIds[(index + 1) % game.playerIds.length];
      game.pendingRaise = {
        team: teamOf(game, playerId),
        value,
        requesterId: playerId,
        responderId,
      };
    } else if (action.type === 'play') {
      const hand = game.hands[playerId];
      const index = hand.findIndex((card) => card.id === action.cardId);
      requireValue(index >= 0, 'Esta carta não está na sua mão.');
      const [card] = hand.splice(index, 1);
      game.trick.push({ playerId, card });
      (game.played ??= []).push(card);
      if (game.trick.length === game.playerIds.length) {
        const result = trickResult(game);
        game.trickWinners.push(result.team);
        game.lastTrick = game.trick;
        game.trick = [];
        const [first, second, third] = game.trickWinners;
        let winner;
        if (game.trickWinners.length === 2) {
          if (first !== null && (second === first || second === null))
            winner = first;
          else if (first === null && second !== null) winner = second;
        }
        if (game.trickWinners.length === 3)
          winner = third ?? first ?? second ?? null;
        if (winner !== undefined) {
          if (winner === null && game.elevenTeam !== null)
            winner = 1 - game.elevenTeam;
          finishHand(game, winner);
        } else
          game.currentPlayerId =
            result.team === null ? game.currentTrickLeaderId : result.leaderId;
        game.currentTrickLeaderId = game.currentPlayerId;
      } else {
        const seat = game.playerIds.indexOf(playerId);
        game.currentPlayerId =
          game.playerIds[(seat + 1) % game.playerIds.length];
      }
    } else requireValue(false, 'Jogada de Truco desconhecida.');
  }
  recordAction(game, { playerId, type: action.type });
  return game;
}

export function publicGame(game, playerId) {
  requireValue(
    game.playerIds.includes(playerId),
    'Jogador não autorizado.',
    403
  );
  const { hands, ...state } = game;
  return {
    ...state,
    hand: hands[playerId],
    handCounts: Object.fromEntries(
      game.playerIds.map((id) => [id, hands[id].length])
    ),
    partnerHands:
      game.phase === 'eleven' && teamOf(game, playerId) === game.elevenTeam
        ? Object.fromEntries(
            game.playerIds
              .filter(
                (id) => id !== playerId && teamOf(game, id) === game.elevenTeam
              )
              .map((id) => [id, hands[id]])
          )
        : null,
  };
}

export const requestRematch = (game, playerId) =>
  rematch(game, playerId, createGame);
