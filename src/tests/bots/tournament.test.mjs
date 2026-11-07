import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playDomino, playCards, playCacheta, tournament } from './harness.mjs';

// 200 partidas por jogo, sementes fixas: o médio vence o fácil e o difícil
// vence o médio em 60% ou mais das partidas (empate vale meia vitória).
const GAMES = 200;
const NEEDED = 0.6;

// Na Cacheta a sorte pesa mais: o difícil precisa de 55% sobre o médio.
const NEEDED_HARD_CACHETA = 0.55;

const suites = [
  ['dominó', playDomino, {}],
  ['Truco (2 jogadores)', playCards, { seats: 2 }],
  ['Truco (2 contra 2)', playCards, { seats: 4 }],
];

for (const [name, play, options] of suites) {
  test(`${name}: médio vence o fácil`, () => {
    const result = tournament(play, GAMES, 'medium', 'easy', options);
    console.log(`${name} médio × fácil`, JSON.stringify(result));
    assert.ok(result.rate >= NEEDED, `taxa ${result.rate}`);
  });
  test(`${name}: difícil vence o médio`, () => {
    const result = tournament(play, GAMES, 'hard', 'medium', options);
    console.log(`${name} difícil × médio`, JSON.stringify(result));
    assert.ok(result.rate >= NEEDED, `taxa ${result.rate}`);
  });
}

test('Cacheta: médio vence o fácil', () => {
  const result = tournament(playCacheta, GAMES, 'medium', 'easy');
  console.log('Cacheta médio × fácil', JSON.stringify(result));
  assert.ok(result.rate >= NEEDED, `taxa ${result.rate}`);
});

test('Cacheta: difícil vence o médio', () => {
  const result = tournament(playCacheta, GAMES, 'hard', 'medium');
  console.log('Cacheta difícil × médio', JSON.stringify(result));
  assert.ok(result.rate >= NEEDED_HARD_CACHETA, `taxa ${result.rate}`);
});
