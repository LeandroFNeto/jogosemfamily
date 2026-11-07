import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cacheta from '../games/cacheta/engine.mjs';
import { arrange, arrangeAll, knockOptions } from '../games/cacheta/melds.mjs';
import { chooseBotAction } from '../games/core/bots.mjs';
import { seededRng } from '../games/core/rng.mjs';
import { getGameEngine } from '../games/core/registry.mjs';
import { enabledGameIds } from '../shared/games.mjs';
import { setup } from './helpers.mjs';

const card = (text) => {
  if (text === 'J1' || text === 'J2')
    return { id: `joker-${text[1]}`, suit: 'joker', rank: 0 };
  const suits = { P: 'clubs', O: 'diamonds', C: 'hearts', E: 'spades' };
  const rank = text.slice(0, -1);
  const value = { A: 1, J: 11, Q: 12, K: 13 }[rank] ?? Number(rank);
  const suit = suits[text.at(-1)];
  return { id: `${suit}-${value}`, suit, rank: value };
};
const hand = (text) => text.split(' ').map(card);

test('distribuição: 9 cartas distintas, uma no descarte e o resto no monte', () => {
  for (const players of [2, 3, 4]) {
    const ids = ['a', 'b', 'c', 'd'].slice(0, players);
    const game = cacheta.createGame(ids, {}, { rng: seededRng(players) });
    const everything = [
      ...Object.values(game.hands).flat(),
      ...game.discard,
      ...game.stock,
    ];
    assert.equal(everything.length, 54);
    assert.equal(new Set(everything.map((c) => c.id)).size, 54);
    for (const id of ids) assert.equal(game.hands[id].length, 9);
    assert.equal(game.discard.length, 1);
    assert.equal(game.stock.length, 54 - 9 * players - 1);
    assert.equal(everything.filter((c) => c.suit === 'joker').length, 2);
    assert.equal(game.phase, 'draw');
    assert.equal(game.currentPlayerId, 'a');
  }
});

test('mesa com menos de 2 ou mais de 4 jogadores é recusada', () => {
  assert.throws(() => cacheta.createGame(['a']), /de 2 a 4/);
  assert.throws(
    () => cacheta.createGame(['a', 'b', 'c', 'd', 'e']),
    /de 2 a 4/
  );
});

test('vez: comprar antes de descartar, aguardar a vez e não devolver o descarte', () => {
  const game = cacheta.createGame(['a', 'b'], {}, { rng: seededRng(1) });
  const first = game.hands.a[0].id;
  assert.throws(
    () => cacheta.processAction(game, 'a', { type: 'discard', cardId: first }),
    /Compre uma carta/
  );
  assert.throws(
    () => cacheta.processAction(game, 'b', { type: 'draw-stock' }),
    /Aguarde a sua vez/
  );
  const top = game.discard.at(-1);
  cacheta.processAction(game, 'a', { type: 'draw-stock' });
  assert.equal(game.hands.a.length, 10);
  assert.throws(
    () => cacheta.processAction(game, 'a', { type: 'draw-stock' }),
    /já comprou/
  );
  cacheta.processAction(game, 'a', { type: 'discard', cardId: first });
  assert.equal(game.hands.a.length, 9);
  assert.equal(game.currentPlayerId, 'b');
  assert.equal(game.discard.at(-1).id, first);
  // Quem pega o descarte não pode jogá-lo de volta na mesma vez.
  cacheta.processAction(game, 'b', { type: 'draw-discard' });
  assert.equal(game.hands.b.at(-1).id, first);
  assert.throws(
    () => cacheta.processAction(game, 'b', { type: 'discard', cardId: first }),
    /acabou de pegar/
  );
  assert.throws(
    () =>
      cacheta.processAction(game, 'b', { type: 'discard', cardId: 'nao-tem' }),
    /não está na sua mão/
  );
  assert.ok(top);
});

test('monte acabou: o descarte, menos o topo, vira o novo monte', () => {
  const game = cacheta.createGame(['a', 'b'], {}, { rng: seededRng(2) });
  const extra = game.stock.splice(0, game.stock.length);
  game.discard = [...extra.slice(0, 5), game.discard[0]];
  const topId = game.discard.at(-1).id;
  cacheta.processAction(
    game,
    'a',
    { type: 'draw-stock' },
    { rng: seededRng(9) }
  );
  assert.equal(game.hands.a.length, 10);
  assert.equal(
    game.stock.length,
    4,
    'monte refeito com o descarte, sem o topo'
  );
  assert.equal(game.discard.length, 1);
  assert.equal(game.discard[0].id, topId);
});

const valid = [
  ['sequência de paus', '5P 6P 7P 2O 3O 4O 9C 9E 9P'],
  ['sequência com Ás baixo', 'AP 2P 3P 7O 8O 9O QC QE QO'],
  ['sequência com Ás alto', 'QP KP AP 4O 5O 6O 8C 8E 8O'],
  ['trinca com curinga', '8C 8E J1 2P 3P 4P 6O 7O 8O'],
  ['sequência com curinga no meio', '5P J1 7P 2O 2C 2E 9C 10C JC'],
  ['nove em sequência', '2P 3P 4P 5P 6P 7P 8P 9P 10P'],
  ['4 + 5 cartas', '3C 3E 3O 3P 5O 6O 7O 8O 9O'],
];
const invalid = [
  ['nenhum jogo', '2P 4C 6O 8E 10P QC AO 3E 5C'],
  ['Ás não dá a volta (K A 2)', 'KP AP 2P 5O 6O 7O 9C 9E 9O'],
  ['dois curingas no mesmo jogo', '8C J1 J2 2P 3P 4P 6O 7O 9O'],
  ['uma carta sobrando', '5P 6P 7P 2O 3O 4O 9C 9E QP'],
];

test('solucionador: mãos válidas e inválidas', () => {
  for (const [name, text] of valid) {
    const result = arrangeAll(hand(text));
    assert.ok(result, name);
    const used = result.melds.flatMap((meld) => meld.cards);
    assert.equal(used.length, 9, name);
    assert.equal(new Set(used.map((c) => c.id)).size, 9, name);
    for (const meld of result.melds)
      assert.ok(
        meld.cards.filter((c) => c.suit === 'joker').length <= 1,
        `${name}: no máximo um curinga por jogo`
      );
  }
  for (const [name, text] of invalid) {
    assert.equal(arrangeAll(hand(text)), null, name);
  }
  const { leftover } = arrange(hand('5P 6P 7P 2O 3O 4O 9C 9E QP'));
  assert.deepEqual(
    leftover.map((c) => c.id),
    ['hearts-9', 'spades-9', 'clubs-12'].filter((id) =>
      leftover.some((c) => c.id === id)
    )
  );
  assert.equal(leftover.length, 3);
});

test('bater: válido encerra a partida e mostra as sobras; inválido é recusado', () => {
  const game = cacheta.createGame(['a', 'b'], {}, { rng: seededRng(3) });
  game.hands.a = hand('5P 6P 7P 2O 3O 4O 9C 9E 9P');
  cacheta.processAction(game, 'a', { type: 'draw-stock' });
  const extra = game.hands.a.at(-1);
  assert.throws(
    () => cacheta.processAction(game, 'a', { type: 'knock', cardId: '5P' }),
    /ainda não formam jogos/
  );
  assert.equal(game.status, 'PLAYING');
  // O descarte da 10ª carta qualquer que seja a comprada.
  const blocked = knockOptions(game.hands.a).map((o) => o.cardId);
  assert.ok(blocked.includes(extra.id) || blocked.length > 0);
  const winner = cacheta.processAction(game, 'a', {
    type: 'knock',
    cardId: extra.id,
  });
  assert.equal(winner.status, 'FINISHED');
  assert.equal(winner.result.winnerId, 'a');
  assert.equal(winner.score.a.wins, 1);
  assert.equal(winner.revealed.a.leftover.length, 0);
  assert.equal(winner.revealed.a.melds.length, 3);
  assert.equal(winner.revealed.b.cards.length, 9);
  const view = cacheta.publicGame(winner, 'b');
  assert.ok(view.revealed.a.cards.length === 9);
});

test('bater sem escolher a carta usa o descarte que o servidor encontra', () => {
  const game = cacheta.createGame(['a', 'b'], {}, { rng: seededRng(4) });
  game.hands.a = hand('5P 6P 7P 2O 3O 4O 9C 9E 9P');
  game.stock.push(card('KE'));
  cacheta.processAction(game, 'a', { type: 'draw-stock' });
  const after = cacheta.processAction(game, 'a', { type: 'knock' });
  assert.equal(after.status, 'FINISHED');
  assert.equal(after.discard.at(-1).id, 'spades-13');
});

test('estado público não traz mãos adversárias nem a ordem do monte', () => {
  const game = cacheta.createGame(['a', 'b', 'c'], {}, { rng: seededRng(5) });
  const view = cacheta.publicGame(game, 'a');
  const json = JSON.stringify(view);
  assert.equal(view.hand.length, 9);
  assert.deepEqual(view.handCounts, { a: 9, b: 9, c: 9 });
  assert.equal(view.stockCount, game.stock.length);
  assert.equal(view.discardTop.id, game.discard[0].id);
  assert.equal('hands' in view, false);
  assert.equal('stock' in view, false);
  for (const other of [...game.hands.b, ...game.hands.c])
    if (!view.hand.some((c) => c.id === other.id))
      assert.equal(json.includes(`"${other.id}"`), false, other.id);
  for (const next of game.stock.slice(0, 3))
    assert.equal(json.includes(`"${next.id}"`), false);
  assert.throws(() => cacheta.publicGame(game, 'x'), /não autorizado/);
});

test('revanche só depois de todos pedirem, com placar preservado', () => {
  let game = cacheta.createGame(['a', 'b'], {}, { rng: seededRng(6) });
  game.hands.a = hand('5P 6P 7P 2O 3O 4O 9C 9E 9P');
  cacheta.processAction(game, 'a', { type: 'draw-stock' });
  cacheta.processAction(game, 'a', { type: 'knock' });
  game = cacheta.requestRematch(game, 'a');
  assert.equal(game.status, 'FINISHED');
  game = cacheta.requestRematch(game, 'b');
  assert.equal(game.status, 'PLAYING');
  assert.equal(game.score.a.wins, 1);
  assert.equal(game.hands.a.length, 9);
});

test('bots dos três níveis concluem partidas completas e só usam o que é público', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const rng = seededRng(77);
    let game = cacheta.createGame(['a', 'b'], {}, { rng });
    let steps = 0;
    for (; game.status === 'PLAYING' && steps < 4000; steps++) {
      const id = game.currentPlayerId;
      // Troca a mão do adversário e a ordem do monte: a jogada não pode mudar.
      const twin = structuredClone(game);
      const other = id === 'a' ? 'b' : 'a';
      twin.hands[other] = twin.hands[other].map((_, i) => ({
        id: `fake-${i}`,
        suit: 'clubs',
        rank: 1,
      }));
      twin.stock.reverse();
      const action = chooseBotAction('cacheta', game, id, level, {
        rng: seededRng(steps),
      });
      assert.deepEqual(
        chooseBotAction('cacheta', twin, id, level, { rng: seededRng(steps) }),
        action,
        `${level}: jogada depende de informação oculta`
      );
      game = cacheta.processAction(game, id, action, { rng });
    }
    assert.equal(game.status, 'FINISHED', `${level} terminou`);
  }
});

test('partida sem vencedor termina em empate no limite de turnos', () => {
  const game = cacheta.createGame(['a', 'b'], {}, { rng: seededRng(8) });
  game.turns = cacheta.TURN_LIMIT * 2 - 1;
  cacheta.processAction(game, 'a', { type: 'draw-stock' });
  cacheta.processAction(game, 'a', {
    type: 'discard',
    cardId: game.hands.a[0].id,
  });
  assert.equal(game.status, 'FINISHED');
  assert.equal(game.result.draw, true);
  assert.equal(game.result.winnerId, null);
});

test('catálogo: Cacheta registrada e perfis antigos mantêm seus jogos', () => {
  assert.equal(getGameEngine('cacheta').name, 'Cacheta');
  assert.deepEqual(getGameEngine('cacheta').capacities, [2, 3, 4]);
  assert.deepEqual(
    enabledGameIds({ dominoEnabled: false }),
    ['cards', 'crossword', 'puzzle'],
    'perfil antigo não ganha os jogos novos'
  );
  assert.deepEqual(enabledGameIds({ enabledGames: ['cacheta'] }), ['cacheta']);
});

test('mesas de Cacheta: 2 a 4 lugares, bots e quem joga primeiro', () => {
  const { rooms, person } = setup();
  const ana = person('Ana');
  const solo = rooms.createRoom(ana, {
    gameId: 'cacheta',
    mode: 'bot',
    capacity: 3,
    difficulty: 'hard',
  });
  assert.equal(solo.playerIds.length, 3);
  assert.equal(solo.botIds.length, 2);
  assert.equal(solo.game.hands[ana.id].length, 9);
  assert.throws(
    () =>
      rooms.createRoom(ana, { gameId: 'cacheta', mode: 'online', capacity: 5 }),
    /2, 3 ou 4 lugares para a Cacheta/
  );
  assert.throws(
    () => rooms.createRoom(ana, { gameId: 'cacheta', mode: 'solo' }),
    /precisa de adversário/
  );
  const mixed = rooms.createRoom(ana, {
    gameId: 'cacheta',
    mode: 'online',
    capacity: 4,
    botSeats: 2,
    difficulty: 'medium',
  });
  assert.equal(mixed.status, 'WAITING');
  assert.equal(mixed.humanSeats, 2);
});

test('a vez de uma pessoa que esgota o tempo compra e descarta na mesma jogada', () => {
  const { rooms, person, advance } = setup({ online: () => true });
  const ana = person('Ana');
  const beto = person('Beto');
  const room = rooms.createRoom(ana, {
    gameId: 'cacheta',
    mode: 'online',
    capacity: 2,
    turnSeconds: 30,
  });
  rooms.startRoom(room, beto);
  rooms.save(room);
  const first = room.turn.playerId;
  advance(31_000);
  const [changed] = rooms.sweep();
  assert.equal(changed.game.hands[first].length, 9, 'comprou e descartou');
  assert.ok(changed.game.discard.length >= 1);
  assert.notEqual(changed.turn.playerId, first);
  assert.equal(changed.game.phase, 'draw');
  assert.equal(changed.autoPlays[first], 1, 'conta como uma jogada automática');
});
