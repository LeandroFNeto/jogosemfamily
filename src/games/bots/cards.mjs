import {
  cardStrength,
  fullDeck,
  processAction,
  teamOf,
} from '../cards/engine.mjs';
import { pick, shuffle } from '../core/rng.mjs';

const STAKES = [1, 3, 6, 9, 12];

/**
 * Bots do Truco. Decidem só com a própria mão e o que está à vista: a mesa, as
 * cartas já jogadas, o placar e as apostas. Mãos adversárias nunca entram aqui.
 */
export function cardsView(game, playerId) {
  const visible = [...(game.trick ?? []), ...(game.lastTrick ?? [])].map(
    (play) => play.card
  );
  return {
    playerId,
    playerIds: game.playerIds,
    hand: game.hands[playerId],
    vira: game.vira,
    trick: game.trick,
    played: game.played ?? visible,
    trickWinners: game.trickWinners,
    teamPoints: game.teamPoints,
    stake: game.stake,
    phase: game.phase,
    pendingRaise: game.pendingRaise,
    raiseAllowedTeam: game.raiseAllowedTeam,
    elevenTeam: game.elevenTeam,
    decisionPlayerId: game.decisionPlayerId,
    currentPlayerId: game.currentPlayerId,
    currentTrickLeaderId: game.currentTrickLeaderId,
    handCounts: Object.fromEntries(
      game.playerIds.map((id) => [id, game.hands[id].length])
    ),
    // Na mão de onze a equipe vê as cartas do parceiro (como na tela do jogador).
    partnerHands:
      game.phase === 'eleven' && teamOf(game, playerId) === game.elevenTeam
        ? Object.fromEntries(
            game.playerIds
              .filter(
                (id) => id !== playerId && teamOf(game, id) === game.elevenTeam
              )
              .map((id) => [id, game.hands[id]])
          )
        : null,
  };
}

const myTeam = (view) => view.playerIds.indexOf(view.playerId) % 2;
const strengthOf = (view) => (card) => cardStrength(card, view.vira);

function canRaise(view) {
  return (
    view.phase === 'play' &&
    !view.pendingRaise &&
    view.currentPlayerId === view.playerId &&
    !view.teamPoints.includes(11) &&
    (view.raiseAllowedTeam === null ||
      view.raiseAllowedTeam === myTeam(view)) &&
    STAKES.indexOf(view.stake) < STAKES.length - 1
  );
}

/** Ações válidas agora para o jogador da visão. */
export function legalActions(view) {
  if (view.phase === 'between') return [];
  if (view.phase === 'eleven')
    return view.decisionPlayerId === view.playerId
      ? [{ type: 'accept' }, { type: 'fold' }]
      : [];
  if (view.pendingRaise) {
    if (view.pendingRaise.responderId !== view.playerId) return [];
    const actions = [{ type: 'accept' }, { type: 'fold' }];
    if (STAKES.indexOf(view.pendingRaise.value) < STAKES.length - 1)
      actions.push({ type: 'raise' });
    return actions;
  }
  if (view.currentPlayerId !== view.playerId) return [];
  const actions = view.hand.map((card) => ({ type: 'play', cardId: card.id }));
  if (canRaise(view)) actions.push({ type: 'raise' });
  return actions;
}

export function easyCards(view, { rng }) {
  const options = legalActions(view).filter(
    (action) => action.type !== 'raise'
  );
  return options.length ? pick(options, rng) : null;
}

const canAnswerRaise = (view) =>
  STAKES.indexOf(view.pendingRaise.value) < STAKES.length - 1;

// Regra do bot médio para pedir aumento; o difícil a usa para ler quem aumentou.
const wantsRaise = (strengths) =>
  Math.max(0, ...strengths) >= 21 ||
  strengths.filter((value) => value >= 8).length >= 2;

export function mediumCards(view) {
  const strength = strengthOf(view);
  const hand = view.hand;
  const ordered = hand.toSorted((a, b) => strength(a) - strength(b));
  // Quem já jogou a última carta ainda conta com ela na hora de responder.
  const owned = [
    ...hand,
    ...view.trick
      .filter((play) => play.playerId === view.playerId)
      .map((play) => play.card),
  ];
  const strongest = Math.max(0, ...owned.map(strength));
  const strongCount = owned.filter((card) => strength(card) >= 8).length;
  if (view.phase === 'eleven') {
    const partner = Object.values(view.partnerHands ?? {}).flat();
    const total = [...hand, ...partner].filter((card) => strength(card) >= 8);
    return { type: total.length >= 2 || strongest >= 20 ? 'accept' : 'fold' };
  }
  if (view.pendingRaise) {
    const needed = view.pendingRaise.value >= 6 ? 9 : 6;
    if (strongest < needed && strongCount < 2) return { type: 'fold' };
    if (strongest >= 22 && strongCount >= 2 && canAnswerRaise(view))
      return { type: 'raise' };
    return { type: 'accept' };
  }
  if (canRaise(view) && wantsRaise(owned.map(strength)) && view.stake < 3)
    return { type: 'raise' };
  const best = view.trick
    .toSorted((a, b) => strength(b.card) - strength(a.card))
    .at(0);
  let card;
  if (best) {
    const partnerWinning =
      view.playerIds.indexOf(best.playerId) % 2 === myTeam(view);
    card = partnerWinning
      ? ordered[0]
      : (ordered.find(
          (candidate) => strength(candidate) > strength(best.card)
        ) ?? ordered[0]);
  } else if (view.trickWinners.length === 0 && ordered.length === 3)
    card = ordered[1];
  else card = ordered.at(-1);
  return { type: 'play', cardId: card.id };
}

function unseenCards(view) {
  const known = new Set(
    [...view.hand, view.vira, ...view.played].map((card) => card.id)
  );
  return fullDeck().filter((card) => !known.has(card.id));
}

function simulation(view, hands) {
  return {
    status: 'PLAYING',
    playerIds: view.playerIds,
    hands,
    vira: view.vira,
    trick: view.trick.map((play) => ({ ...play })),
    trickWinners: [...view.trickWinners],
    lastTrick: [],
    played: [...view.played],
    pendingRaise: view.pendingRaise ? { ...view.pendingRaise } : null,
    raiseAllowedTeam: view.raiseAllowedTeam,
    currentPlayerId: view.currentPlayerId,
    currentTrickLeaderId: view.currentTrickLeaderId,
    stake: view.stake,
    elevenTeam: view.elevenTeam,
    phase: view.phase,
    decisionPlayerId: view.decisionPlayerId,
    teamPoints: [...view.teamPoints],
    leaderSeat: 0,
    handNumber: 1,
    lastHand: null,
    history: [],
    result: null,
    rematch: [],
    score: Object.fromEntries(
      view.playerIds.map((id) => [id, { wins: 0, points: 0 }])
    ),
  };
}

function playout(sim, team, start) {
  for (let guard = 0; guard < 60; guard++) {
    if (sim.status !== 'PLAYING' || sim.phase === 'between') break;
    const id =
      sim.decisionPlayerId ||
      sim.pendingRaise?.responderId ||
      sim.currentPlayerId;
    processAction(sim, id, mediumCards(cardsView(sim, id)));
  }
  let value =
    sim.teamPoints[team] -
    start[team] -
    (sim.teamPoints[1 - team] - start[1 - team]);
  if (sim.status === 'FINISHED')
    value += sim.result.winnerTeam === team ? 4 : -4;
  return value;
}

export function hardCards(view, { rng, now, budgetMs, samples }) {
  const actions = legalActions(view);
  if (!actions.length) return null;
  if (actions.length === 1) return actions[0];
  const me = view.playerId;
  const team = myTeam(view);
  const others = view.playerIds.filter((id) => id !== me);
  const unseen = unseenCards(view);
  const totals = new Map(actions.map((action) => [action, 0]));
  const started = now();
  let done = 0;
  for (let k = 0; k < samples; k++) {
    if (k > 0 && now() - started > budgetMs) break;
    const hands = { [me]: view.hand };
    // Quem pediu aumento tinha, na hora, uma mão que o bot médio consideraria forte.
    const requester = view.pendingRaise?.requesterId;
    let pool;
    for (let attempt = 0; attempt < 200; attempt++) {
      pool = shuffle([...unseen], rng);
      if (!requester || requester === me || view.partnerHands?.[requester])
        break;
      const candidate = pool.slice(0, view.handCounts[requester]);
      if (wantsRaise(candidate.map((card) => cardStrength(card, view.vira))))
        break;
    }
    if (requester && requester !== me && !view.partnerHands?.[requester])
      hands[requester] = pool.splice(0, view.handCounts[requester]);
    for (const id of others)
      if (!hands[id])
        hands[id] =
          view.partnerHands?.[id] ?? pool.splice(0, view.handCounts[id]);
    for (const action of actions) {
      const sim = simulation(
        view,
        Object.fromEntries(
          Object.entries(hands).map(([id, cards]) => [
            id,
            cards.map((card) => ({ ...card })),
          ])
        )
      );
      processAction(sim, me, action);
      totals.set(
        action,
        totals.get(action) + playout(sim, team, view.teamPoints)
      );
    }
    done++;
  }
  if (!done) return mediumCards(view);
  return actions.toSorted((a, b) => totals.get(b) - totals.get(a))[0];
}
