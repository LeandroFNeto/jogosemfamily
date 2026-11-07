import { randomInt } from 'node:crypto';

/**
 * Gerador de números dos jogos. Em produção usa o sorteio criptográfico; nos
 * testes e no torneio dos bots entra um gerador com semente fixa, para que a
 * mesma semente repita a mesma partida.
 */
export const systemRng = Object.freeze({
  int: (limit) => randomInt(limit),
  next: () => randomInt(2 ** 30) / 2 ** 30,
});

export function seededRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (limit) => Math.floor(next() * limit), next };
}

export const pick = (items, rng = systemRng) => items[rng.int(items.length)];

/** Embaralha no lugar (Fisher-Yates) e devolve a própria lista. */
export function shuffle(items, rng = systemRng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
