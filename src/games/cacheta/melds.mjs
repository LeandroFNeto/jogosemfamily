/**
 * Jogos da Cacheta: sequências (3 ou mais cartas seguidas do mesmo naipe, com
 * o Ás valendo baixo ou alto) e trincas (3 ou 4 cartas de mesmo valor e naipes
 * diferentes). O curinga ocupa o lugar de qualquer carta, no máximo um por jogo.
 *
 * Tudo é puro e sem sorteio: o servidor usa estas funções para validar "bater"
 * e os bots as usam para avaliar a própria mão.
 */
export const isJoker = (card) => card.suit === 'joker';

// Posição na sequência: o Ás ocupa a posição 1 (baixo) ou 14 (alto).
const positionsOf = (card) => (card.rank === 1 ? [1, 14] : [card.rank]);
const rankAt = (position) => (position === 14 ? 1 : position);

/** Todos os jogos possíveis que contêm `card`, usando só cartas de `pool`. */
function meldsWith(card, pool) {
  const found = [];
  const jokers = pool.filter(isJoker);
  const others = pool.filter((item) => !isJoker(item) && item.id !== card.id);

  // Trincas: mesmo valor, naipes diferentes.
  const mates = others.filter(
    (item) => item.rank === card.rank && item.suit !== card.suit
  );
  const suitsSeen = new Set();
  const uniqueMates = mates.filter((item) =>
    suitsSeen.has(item.suit) ? false : suitsSeen.add(item.suit)
  );
  const pick = (list, size) => {
    if (size === 0) return [[]];
    return list.flatMap((item, index) =>
      pick(list.slice(index + 1), size - 1).map((rest) => [item, ...rest])
    );
  };
  for (const size of [2, 3])
    for (const group of pick(uniqueMates, size))
      found.push({ type: 'set', cards: [card, ...group] });
  // Com curinga: 2 cartas + curinga (3) ou 3 cartas + curinga (4).
  if (jokers.length)
    for (const size of [1, 2, 3])
      for (const group of pick(uniqueMates, size)) {
        const total = 1 + group.length + 1;
        if (total >= 3 && total <= 4)
          found.push({
            type: 'set',
            cards: [card, ...group, jokers[0]],
          });
      }

  // Sequências: janelas de posições seguidas do mesmo naipe.
  const bySuit = new Map(
    others.filter((item) => item.suit === card.suit).map((i) => [i.rank, i])
  );
  for (const start of positionsOf(card)) {
    for (let low = Math.max(1, start - 12); low <= start; low++) {
      for (
        let high = Math.max(start, low + 2);
        high <= Math.min(14, low + 12);
        high++
      ) {
        if (high - low + 1 > 13) continue;
        const cards = [];
        let missing = 0;
        let valid = true;
        for (let position = low; position <= high; position++) {
          if (position === start) {
            cards.push(card);
            continue;
          }
          const mate = bySuit.get(rankAt(position));
          if (mate) cards.push(mate);
          else if (jokers.length && ++missing <= 1) cards.push(jokers[0]);
          else {
            valid = false;
            break;
          }
        }
        // A janela precisa de pelo menos 2 cartas reais.
        if (valid && cards.filter((item) => !isJoker(item)).length >= 2)
          found.push({ type: 'sequence', cards });
      }
    }
  }
  return found;
}

const cardValue = (card) => (isJoker(card) ? 0 : Math.min(card.rank, 10));

const without = (cards, used) => {
  const ids = new Set(used.map((item) => item.id));
  return cards.filter((item) => !ids.has(item.id));
};
// Curingas por último: só valem dentro de um jogo.
const firstReal = (cards) => cards.find((card) => !isJoker(card));

/** Arrumação completa (todas as cartas em jogos) ou null. */
export function arrangeAll(hand) {
  function search(remaining) {
    if (!remaining.length) return [];
    const card = firstReal(remaining);
    if (!card) return null;
    for (const meld of meldsWith(card, remaining)) {
      const rest = search(without(remaining, meld.cards));
      if (rest) return [meld, ...rest];
    }
    return null;
  }
  const melds = search([...hand]);
  return melds ? { melds, leftover: [] } : null;
}

/**
 * Melhor arrumação da mão: os jogos que deixam menos cartas de fora (e, em
 * empate, menos pontos). `leftover` são as cartas fora de jogos.
 */
export function arrange(hand) {
  const score = (left) =>
    left.length * 1000 + left.reduce((sum, card) => sum + cardValue(card), 0);
  let best = { melds: [], leftover: [...hand] };
  function search(remaining, melds, leftover) {
    if (score(leftover) >= score(best.leftover)) return;
    if (!remaining.length) {
      best = { melds, leftover };
      return;
    }
    const card = firstReal(remaining);
    if (!card) {
      const all = [...leftover, ...remaining];
      if (score(all) < score(best.leftover)) best = { melds, leftover: all };
      return;
    }
    for (const meld of meldsWith(card, remaining))
      search(without(remaining, meld.cards), [...melds, meld], leftover);
    search(without(remaining, [card]), melds, [...leftover, card]);
  }
  search([...hand], [], []);
  return best;
}

/**
 * Descartes que permitem bater: para cada carta da mão de 10, a mão restante
 * de 9 cartas se organiza inteira em jogos.
 */
export function knockOptions(hand) {
  const options = [];
  for (const card of hand) {
    const rest = hand.filter((item) => item.id !== card.id);
    const arranged = arrangeAll(rest);
    if (arranged) options.push({ cardId: card.id, melds: arranged.melds });
  }
  return options;
}

export const deadwood = (hand) => arrange(hand).leftover;
