import { pick } from '../core/rng.mjs';
import { arrange, isJoker, knockOptions } from '../cacheta/melds.mjs';
import { fullDeck } from '../cacheta/engine.mjs';

/**
 * Visão pública do bot na Cacheta: a própria mão, o topo do descarte, os
 * tamanhos do monte e das mãos e o que cada jogador já pegou do descarte
 * (todos viram). Nunca olha mãos adversárias nem a ordem do monte.
 */
export function cachetaView(game, playerId) {
  return {
    playerId,
    phase: game.phase,
    hand: game.hands[playerId],
    discardTop: game.discard.at(-1) ?? null,
    stockCount: game.stock.length,
    takenFromDiscard: game.takenFromDiscard,
    picks: game.picks,
    // Descartes que todos viram (o histórico público guarda os últimos 40).
    seenDiscards: game.history
      .filter((entry) => entry.type === 'discard')
      .map((entry) => entry.cardId),
    handCounts: Object.fromEntries(
      game.playerIds.map((id) => [id, game.hands[id].length])
    ),
  };
}

const value = (card) => (isJoker(card) ? 0 : Math.min(card.rank, 10));

/** Pares de cartas que ainda podem virar jogo: vizinhas do mesmo naipe ou mesmo valor. */
function closeness(card, other) {
  if (isJoker(card) || isJoker(other)) return 3;
  if (card.suit === other.suit) {
    const gap = Math.abs(card.rank - other.rank);
    const aceWrap = Math.abs(card.rank - other.rank) === 12;
    if (gap === 1 || aceWrap) return 2;
    if (gap === 2) return 1;
    return 0;
  }
  return card.rank === other.rank ? 2 : 0;
}

/** Quanto a carta ajuda a mão: curinga vale muito, isoladas valem pouco. */
function usefulness(card, hand) {
  let total = 0;
  for (const other of hand)
    if (other.id !== card.id) total += closeness(card, other);
  return total;
}

/** Nota da mão (menor é melhor): sobras fora de jogos e potencial das que sobraram. */
function handScore(hand) {
  const { leftover } = arrange(hand);
  const potential = leftover.reduce(
    (sum, card) => sum + usefulness(card, leftover),
    0
  );
  return (
    leftover.length * 1000 +
    leftover.reduce((sum, card) => sum + value(card), 0) * 5 -
    potential * 3
  );
}

/** Melhor descarte de uma mão de 10 cartas e a nota da mão que sobra. */
function bestDiscard(hand, { avoid = () => 0, forbidden = null } = {}) {
  let best = null;
  for (const card of hand) {
    if (card.id === forbidden) continue;
    const rest = hand.filter((item) => item.id !== card.id);
    const score = handScore(rest) + avoid(card);
    if (!best || score < best.score) best = { card, score };
  }
  return best;
}

export function legalCachetaActions(view) {
  if (view.phase === 'draw') {
    const actions = [];
    if (view.stockCount > 0) actions.push({ type: 'draw-stock' });
    if (view.discardTop) actions.push({ type: 'draw-discard' });
    return actions;
  }
  const actions = [];
  if (knockOptions(view.hand).length) actions.push({ type: 'knock' });
  for (const card of view.hand)
    if (card.id !== view.takenFromDiscard)
      actions.push({ type: 'discard', cardId: card.id });
  return actions;
}

const knockIfPossible = (view) => {
  const options = knockOptions(view.hand);
  return options.length ? { type: 'knock', cardId: options[0].cardId } : null;
};

export function easyCacheta(view, { rng }) {
  if (view.phase === 'discard') {
    const knock = knockIfPossible(view);
    if (knock) return knock;
  }
  return pick(legalCachetaActions(view), rng);
}

/** Compra o descarte só se melhorar a mão; descarta a carta mais isolada. */
function smartDraw(view, extra = {}) {
  const actions = legalCachetaActions(view);
  if (!view.stockCount) return { type: 'draw-discard' };
  if (!view.discardTop) return { type: 'draw-stock' };
  const current = handScore(view.hand);
  const withTop = bestDiscard([...view.hand, view.discardTop], {
    forbidden: view.discardTop.id,
    ...extra,
  });
  return withTop && withTop.score < current - 1
    ? { type: 'draw-discard' }
    : actions.find((action) => action.type === 'draw-stock');
}

function smartDiscard(view, extra = {}) {
  const knock = knockIfPossible(view);
  if (knock) return knock;
  const best = bestDiscard(view.hand, {
    forbidden: view.takenFromDiscard,
    ...extra,
  });
  return { type: 'discard', cardId: best.card.id };
}

export function mediumCacheta(view) {
  return view.phase === 'draw' ? smartDraw(view) : smartDiscard(view);
}

/** Cartas que ainda podem estar no monte ou nas mãos dos outros. */
function unseenCards(view, ownCards) {
  const known = new Set([
    ...ownCards.map((card) => card.id),
    ...view.seenDiscards,
    view.discardTop?.id,
  ]);
  return fullDeck().filter((card) => !known.has(card.id));
}

/**
 * Quantas cartas ainda não vistas melhoram a mão de 9 cartas: aquelas que
 * encaixam em um jogo sem aumentar as sobras.
 */
function outsOf(rest, pool) {
  const base = arrange(rest).leftover.length;
  let outs = 0;
  for (const card of pool)
    if (arrange([...rest, card]).leftover.length <= base) outs++;
  return { base, outs };
}

/**
 * Difícil: conta as cartas não vistas (mão, descartes e topo já conhecidos) e
 * escolhe o descarte que deixa mais "saídas"; só compra o descarte se ele
 * vale mais que a chance de melhorar comprando do monte. Também evita jogar
 * fora o que ajuda quem pegou cartas do descarte.
 */
export function hardCacheta(view) {
  const wanted = view.picks
    .filter((entry) => entry.playerId !== view.playerId)
    .map((entry) => entry.card);
  const avoid = (card) =>
    wanted.reduce((sum, taken) => sum + closeness(card, taken) * 5, 0);
  if (view.phase === 'draw') {
    if (!view.stockCount) return { type: 'draw-discard' };
    if (!view.discardTop) return { type: 'draw-stock' };
    const pool = unseenCards(view, view.hand);
    const { base, outs } = outsOf(view.hand, pool);
    const expected = base - outs / Math.max(1, pool.length);
    const top = view.discardTop;
    let after = Infinity;
    for (const card of [...view.hand, top]) {
      if (card.id === top.id) continue;
      const rest = [...view.hand, top].filter((item) => item.id !== card.id);
      after = Math.min(after, arrange(rest).leftover.length);
    }
    return after < expected - 0.05
      ? { type: 'draw-discard' }
      : { type: 'draw-stock' };
  }
  const knock = knockIfPossible(view);
  if (knock) return knock;
  let best = null;
  for (const card of view.hand) {
    if (card.id === view.takenFromDiscard) continue;
    const rest = view.hand.filter((item) => item.id !== card.id);
    const pool = unseenCards(view, [...rest, card]);
    const { base, outs } = outsOf(rest, pool);
    const points = arrange(rest).leftover.reduce(
      (sum, item) => sum + value(item),
      0
    );
    const score = base * 1000 + points * 2 - outs * 12 + avoid(card);
    if (!best || score < best.score) best = { card, score };
  }
  return { type: 'discard', cardId: best.card.id };
}
