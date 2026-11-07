import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { timidCards } from '../games/core/bots.mjs';
import { cardStrength } from '../games/cards/engine.mjs';

const vira = { id: 'v', rank: '4', suit: 'copas' };
const rng = (value) => ({ int: () => value });
const baseView = {
  playerId: 'bot',
  playerIds: ['ana', 'rival', 'bot', 'rival2'],
  vira,
  hand: [{ id: 'c1', rank: '4', suit: 'ouros' }],
  pendingRaise: null,
  phase: 'play',
};

test('parceiro medroso não pede truco por conta própria', () => {
  const asked = [];
  const result = timidCards(
    baseView,
    { type: 'raise' },
    (view) => {
      asked.push(view.raiseAllowedTeam);
      return { type: 'play', cardId: 'c1' };
    },
    rng(99)
  );
  assert.deepEqual(result, { type: 'play', cardId: 'c1' });
  assert.deepEqual(asked, [1], 'o aumento fica proibido para a equipe do bot');
});

test('parceiro medroso aceita em vez de devolver o aumento', () => {
  const view = { ...baseView, pendingRaise: { value: 3, responderId: 'bot' } };
  assert.deepEqual(
    timidCards(view, { type: 'raise' }, () => null, rng(0)),
    {
      type: 'accept',
    }
  );
});

test('parceiro medroso às vezes corre com mão fraca, mas nunca com mão forte', () => {
  const weak = {
    ...baseView,
    hand: [{ id: 'c1', rank: '4', suit: 'ouros' }],
    pendingRaise: { value: 3, responderId: 'bot' },
  };
  assert.ok(cardStrength(weak.hand[0], vira) < 14);
  assert.deepEqual(
    timidCards(weak, { type: 'accept' }, () => null, rng(0)),
    {
      type: 'fold',
    }
  );
  assert.deepEqual(
    timidCards(weak, { type: 'accept' }, () => null, rng(99)),
    {
      type: 'accept',
    }
  );
});

test('o bot hesita mais para responder a um truco do que para jogar uma carta', () => {
  const { rooms, person, advance, store } = setup({ botDelayMs: 2000 });
  const ana = person('Ana');
  const room = rooms.createRoom(ana, { gameId: 'cards', mode: 'bot' });
  const load = () => rooms.normalizeRoom(store.getRoom(room.id));
  while (load().game.currentPlayerId !== ana.id) {
    advance(2100);
    rooms.sweep();
  }
  const current = load();
  rooms.perform(ana, room.id, 'action', {
    type: 'raise',
    revision: current.revision,
  });
  const after = load();
  assert.ok(after.game.pendingRaise, 'o pedido ficou pendente');
  assert.deepEqual(
    rooms.snapshot(after, ana.id).thinking && {
      doubt: rooms.snapshot(after, ana.id).thinking.doubt,
    },
    { doubt: true }
  );
  advance(2100);
  assert.equal(rooms.sweep().length, 0, 'ainda em dúvida');
  advance(3000);
  assert.equal(rooms.sweep().length, 1, 'respondeu depois da pausa maior');
});
