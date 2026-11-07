import { crosswords } from '../crossword/puzzles.mjs';
import { pick, systemRng } from './rng.mjs';
import { cardStrength } from '../cards/engine.mjs';
import {
  dominoView,
  easyDomino,
  mediumDomino,
  hardDomino,
} from '../bots/domino.mjs';
import {
  cardsView,
  easyCards,
  mediumCards,
  hardCards,
} from '../bots/cards.mjs';

import {
  cachetaView,
  easyCacheta,
  mediumCacheta,
  hardCacheta,
} from '../bots/cacheta.mjs';

export const HARD_BUDGET_MS = 200;
const HARD_SAMPLES = 100;
const LEVELS = ['easy', 'medium', 'hard'];

/**
 * Escolhe a jogada de um bot. Cada nível decide só com a visão pública do
 * jogador (a própria mão e o que está na mesa).
 *  - fácil: jogada legal ao acaso (e erros em jogos de resposta);
 *  - médio: regras práticas de cada jogo;
 *  - difícil: simulações com as cartas ou peças que ainda podem estar ocultas.
 * `options.rng` torna o resultado repetível nos testes.
 */
/**
 * Parceiro medroso: não pede truco por conta própria, não devolve aumento e,
 * quando aceitaria com mão fraca, às vezes tem medo e corre.
 */
export function timidCards(view, action, decide, rng) {
  if (!action) return action;
  if (action.type === 'raise') {
    if (view.pendingRaise) return { type: 'accept' };
    const team = view.playerIds.indexOf(view.playerId) % 2;
    // Sem poder pedir aumento, o bot escolhe outra coisa (jogar uma carta).
    return decide({ ...view, raiseAllowedTeam: 1 - team });
  }
  if (
    action.type === 'accept' &&
    view.pendingRaise &&
    view.phase !== 'eleven'
  ) {
    const strongest = Math.max(
      0,
      ...view.hand.map((card) => cardStrength(card, view.vira))
    );
    if (strongest < 14 && rng.int(100) < 40) return { type: 'fold' };
  }
  return action;
}

export function chooseBotAction(
  gameId,
  game,
  playerId,
  difficulty,
  {
    rng = systemRng,
    now = () => performance.now(),
    budgetMs = HARD_BUDGET_MS,
    samples = HARD_SAMPLES,
    // Parceiro de uma pessoa no Truco: medroso, para a pessoa ser a protagonista.
    timidPartner = false,
  } = {}
) {
  if (game.status !== 'PLAYING') return null;
  const level = Math.max(0, LEVELS.indexOf(difficulty));
  const context = { rng, now, budgetMs, samples };
  if (gameId === 'domino') {
    const view = dominoView(game, playerId);
    return [easyDomino, mediumDomino, hardDomino][level](view, context);
  }
  if (gameId === 'cards') {
    if (game.phase === 'between') return null;
    const view = cardsView(game, playerId);
    const decide = (v) =>
      [easyCards, mediumCards, hardCards][level](v, context);
    const action = decide(view);
    return timidPartner ? timidCards(view, action, decide, rng) : action;
  }
  if (gameId === 'cacheta') {
    const view = cachetaView(game, playerId);
    return [easyCacheta, mediumCacheta, hardCacheta][level](view, context);
  }
  if (gameId === 'wordsearch') {
    const found = game.competitive ? game.foundByPlayer[playerId] : game.found;
    const word = game.placements.find(
      (item) => !found.some((entry) => entry.wordId === item.id)
    );
    if (!word || rng.int(100) >= [25, 55, 85][level]) return { type: 'pass' };
    return { type: 'word', text: word.text };
  }
  if (gameId === 'crossword') {
    const solved = game.solvedByPlayer[playerId];
    const word = crosswords[game.puzzleIndex].words.find(
      (word) => !solved.includes(word.id)
    );
    if (rng.int(100) >= [25, 55, 85][level]) return { type: 'pass' };
    return { type: 'answer', wordId: word.id, answer: word.answer };
  }
  if (gameId === 'puzzle') {
    const pieces = game.piecesByPlayer[playerId];
    const misplaced = pieces
      .map((piece, i) => (piece !== i ? i : -1))
      .filter((i) => i >= 0);
    if (!misplaced.length) return null;
    const from = pick(misplaced, rng);
    if (rng.int(100) < [25, 65, 100][level])
      return { type: 'swap', from, to: pieces.indexOf(from) };
    return {
      type: 'swap',
      from,
      to: pick(
        misplaced.filter((i) => i !== from),
        rng
      ),
    };
  }
  return null;
}
