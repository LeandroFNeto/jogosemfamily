import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../backend/server.mjs';
import { hashToken, findInvitation } from '../invitations/service.mjs';
import { crosswords } from '../games/crossword/puzzles.mjs';
import { chooseBotAction } from '../games/core/bots.mjs';

async function start(databasePath = ':memory:') {
  const app = createApplication({ databasePath, publicOrigin: '' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  function client(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() {
        return cookie;
      },
      async request(path, method = 'GET', body, expected = 200, headers = {}) {
        const res = await fetch(`${origin}/api${path}`, {
          method,
          headers: {
            Cookie: cookie,
            ...(body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (res.headers.get('set-cookie'))
          cookie = res.headers.get('set-cookie').split(';')[0];
        const data = await res.json();
        assert.equal(res.status, expected, JSON.stringify(data));
        return data;
      },
      async profile(name) {
        const me = await this.request('/me');
        await this.request('/me', 'PUT', { ...me, name });
        return { ...me, name };
      },
    };
  }
  return { ...app, origin, client };
}

async function createPair(app) {
  const owner = app.client();
  const guest = app.client();
  const ownerProfile = await owner.profile('João');
  const guestProfile = await guest.profile('Maria');
  const created = await owner.request(
    '/rooms',
    'POST',
    { gameId: 'domino' },
    201
  );
  const id = created.room.id;
  const token = created.invitation.token;
  return { owner, guest, ownerProfile, guestProfile, id, token };
}

test('convite, aprovação, mãos privadas, partida completa e revanche via HTTP', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const { owner, guest, ownerProfile, guestProfile, id, token } =
    await createPair(app);
  const intruder = app.client();
  await intruder.profile('Intruso');
  const info = await guest.request(`/invitations/${token}`);
  assert.equal(info.owner.name, 'João');
  const pending = await guest.request(`/invitations/${token}/join`, 'POST', {});
  assert.equal(pending.game, null);
  await guest.request(
    `/rooms/${id}/action`,
    'POST',
    { revision: pending.revision, type: 'pass' },
    403
  );
  await intruder.request(`/rooms/${id}`, 'GET', undefined, 403);
  await intruder.request(`/rooms/${id}/events`, 'GET', undefined, 403);
  await intruder.request(`/invitations/${token}/join`, 'POST', {}, 410);
  await guest.request(
    `/rooms/${id}/approve`,
    'POST',
    { playerId: guestProfile.id },
    403
  );
  let current = await owner.request(`/rooms/${id}/approve`, 'POST', {
    playerId: guestProfile.id,
  });
  assert.equal(current.status, 'PLAYING');
  assert.equal(current.game.hands, undefined);
  assert.equal(current.game.stock, undefined);
  assert.equal(current.game.hand.length, 7);
  await owner.request(
    `/rooms/${id}/action`,
    'POST',
    { type: 'pass', revision: -1 },
    409
  );
  let count = 0;
  while (current.status === 'PLAYING' && count++ < 150) {
    const player =
      current.game.currentPlayerId === ownerProfile.id ? owner : guest;
    current = await player.request(`/rooms/${id}`);
    const { game } = current;
    const sides = (piece) =>
      !game.board.length
        ? ['right']
        : [
            ...([piece.a, piece.b].includes(game.board[0].a) ? ['left'] : []),
            ...([piece.a, piece.b].includes(game.board.at(-1).b)
              ? ['right']
              : []),
          ];
    const piece = game.hand.find((piece) => sides(piece).length);
    const action = piece
      ? { type: 'play', tileId: piece.id, side: sides(piece)[0] }
      : { type: game.stockCount ? 'draw' : 'pass' };
    current = await player.request(`/rooms/${id}/action`, 'POST', {
      ...action,
      revision: current.revision,
    });
  }
  assert.equal(current.status, 'FINISHED');
  const score = current.game.score;
  current = await owner.request(`/rooms/${id}/rematch`, 'POST', {
    revision: current.revision,
  });
  current = await guest.request(`/rooms/${id}/rematch`, 'POST', {
    revision: current.revision,
  });
  assert.equal(current.status, 'PLAYING');
  assert.deepEqual(current.game.score, score);
  assert.equal((await owner.request('/me')).contacts[0].id, guestProfile.id);
  await owner.request(`/contacts/${guestProfile.id}`, 'DELETE');
  assert.equal((await guest.request(`/rooms/${id}`)).status, 'CLOSED');
});

test('eventos SSE entregam estado privado, aprovação e presença, com reconexão', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const { owner, guest, guestProfile, id, token } = await createPair(app);
  const controller = new AbortController();
  const res = await fetch(`${app.origin}/api/rooms/${id}/events`, {
    headers: { Cookie: owner.cookie },
    signal: controller.signal,
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  async function nextState(predicate) {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const line = event
          .split('\n')
          .find((line) => line.startsWith('data: '));
        if (line) {
          const state = JSON.parse(line.slice(6));
          if (predicate(state)) return state;
        }
      } else {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    }
  }
  try {
    const initial = await nextState((state) => state.status === 'WAITING');
    assert.equal(initial.online[initial.ownerId], true);
    await guest.request(`/invitations/${token}/join`, 'POST', {});
    await nextState((state) => state.pending?.id === guestProfile.id);
    await owner.request(`/rooms/${id}/approve`, 'POST', {
      playerId: guestProfile.id,
    });
    const active = await nextState((state) => state.status === 'PLAYING');
    assert.equal(active.game.hand.length, 7);
    assert.equal(active.game.hands, undefined);
  } finally {
    await reader.cancel();
    controller.abort();
  }
  const reconnected = await owner.request(`/rooms/${id}`);
  assert.equal(reconnected.status, 'PLAYING');
});

test('persistência recupera sessão, perfil e mesa após reiniciar servidor', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mesa-test-'));
  const filename = join(directory, 'test.sqlite');
  let app = await start(filename);
  try {
    const { owner, guest, guestProfile, id, token } = await createPair(app);
    await guest.request(`/invitations/${token}/join`, 'POST', {});
    const previous = await owner.request(`/rooms/${id}/approve`, 'POST', {
      playerId: guestProfile.id,
    });
    const cookie = owner.cookie;
    await app.stop();
    app = await start(filename);
    const restored = app.client(cookie);
    assert.equal((await restored.request('/me')).name, 'João');
    assert.deepEqual(
      (await restored.request(`/rooms/${id}`)).game,
      previous.game
    );
  } finally {
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('expiração, revogação, origem, validação e rejeição de desconhecido', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const { owner, guest, guestProfile, id, token } = await createPair(app);
  await owner.request('/rooms', 'POST', { gameId: 'domino' }, 403, {
    Origin: 'https://evil.example',
  });
  await owner.request('/me', 'PUT', { name: 'X' }, 400);
  await owner.request(
    '/me',
    'PUT',
    {
      name: 'Nome',
      preferences: { fontSize: 'large', contrast: false, speech: false },
      dominoEnabled: true,
      photo: 'data:image/svg+xml,<svg onload="alert(1)"/>',
    },
    400
  );
  assert.throws(() =>
    findInvitation(app.store, token, Date.now() + 3 * 3600000)
  );
  assert.throws(() => findInvitation(app.store, 'invalid'));
  await guest.request(`/invitations/${token}/join`, 'POST', {});
  await owner.request(`/rooms/${id}/reject`, 'POST', {
    playerId: guestProfile.id,
  });
  await guest.request(`/rooms/${id}`, 'GET', undefined, 403);
  await guest.request(`/invitations/${token}`, 'GET', undefined, 404);
  const fresh = await owner.request(`/rooms/${id}/invite`, 'POST', {});
  assert.notEqual(fresh.token, token);
  assert.notEqual(hashToken(fresh.token), fresh.token);
  await owner.request(`/rooms/${id}/leave`, 'POST', {});
  await guest.request(`/invitations/${fresh.token}`, 'GET', undefined, 404);
  const home = await fetch(app.origin);
  assert.equal(home.status, 200);
  assert.match(
    home.headers.get('content-security-policy'),
    /script-src 'self'/
  );
  assert.match(await home.text(), /lang="pt-BR"/);
  assert.equal((await fetch(`${app.origin}/data/mesa.sqlite`)).status, 404);
});

test('duas jogadas simultâneas com mesma revisão aceitam somente uma', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const { owner, guest, ownerProfile, guestProfile, id, token } =
    await createPair(app);
  await guest.request(`/invitations/${token}/join`, 'POST', {});
  let state = await owner.request(`/rooms/${id}/approve`, 'POST', {
    playerId: guestProfile.id,
  });
  const player = state.game.currentPlayerId === ownerProfile.id ? owner : guest;
  state = await player.request(`/rooms/${id}`);
  const body = {
    type: 'play',
    tileId: state.game.hand[0].id,
    side: 'right',
    revision: state.revision,
  };
  const responses = await Promise.all(
    [1, 2].map(() =>
      fetch(`${app.origin}/api/rooms/${id}/action`, {
        method: 'POST',
        headers: { Cookie: player.cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )
  );
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
  await Promise.all(responses.map((res) => res.text()));
});

test('aprovações simultâneas preservam os dois contatos e convites direcionados respeitam o perfil', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const { owner, guest, guestProfile, id, token } = await createPair(app);
  const other = app.client();
  const otherProfile = await other.profile('Carlos');
  await guest.request(`/invitations/${token}/join`, 'POST', {});
  await owner.request(`/rooms/${id}/approve`, 'POST', {
    playerId: guestProfile.id,
  });
  // Uma mesa por vez: a segunda mesa do dono encerra a primeira (ou o dono sai dela).
  const second = await owner.request(
    '/rooms',
    'POST',
    { gameId: 'domino' },
    201
  );
  await other.request(
    `/invitations/${second.invitation.token}/join`,
    'POST',
    {}
  );
  await owner.request(`/rooms/${second.room.id}/approve`, 'POST', {
    playerId: otherProfile.id,
  });
  assert.equal((await owner.request('/me')).contacts.length, 2);
  const third = await owner.request(
    '/rooms',
    'POST',
    { gameId: 'domino', targetId: guestProfile.id },
    201
  );
  await other.request(
    `/invitations/${third.invitation.token}/join`,
    'POST',
    {},
    403
  );
  const joined = await guest.request(
    `/invitations/${third.invitation.token}/join`,
    'POST',
    {}
  );
  assert.equal(joined.status, 'PLAYING');
  assert.equal(joined.approved, true);
});

test('Truco online confirma quatro pessoas (2 contra 2), distribui mãos privadas e encontra todas as mesas', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const clients = Array.from({ length: 5 }, () => app.client());
  const profiles = await Promise.all(
    clients.map((client, i) => client.profile(`Pessoa ${i + 1}`))
  );
  const owner = clients[0];
  let created = await owner.request(
    '/rooms',
    'POST',
    { gameId: 'cards', capacity: 4 },
    201
  );
  const id = created.room.id;
  let current;
  for (let i = 1; i < 4; i++) {
    await clients[i].request(
      `/invitations/${created.invitation.token}/join`,
      'POST',
      {}
    );
    await clients[4].request(`/rooms/${id}`, 'GET', undefined, 403);
    current = await owner.request(`/rooms/${id}/approve`, 'POST', {
      playerId: profiles[i].id,
    });
    assert.equal(current.players.length, i + 1);
    assert.equal(current.status, i === 3 ? 'PLAYING' : 'WAITING');
    if (i < 3)
      created = {
        invitation: await owner.request(`/rooms/${id}/invite`, 'POST', {}),
      };
  }
  await owner.request(`/rooms/${id}/invite`, 'POST', {}, 409);
  await clients[4].request(
    `/invitations/${created.invitation.token}/join`,
    'POST',
    {},
    410
  );
  for (let i = 0; i < 4; i++) {
    const state = await clients[i].request(`/rooms/${id}`);
    assert.equal(state.game.hand.length, 3);
    assert.equal(state.game.hands, undefined);
    assert.equal(state.game.partnerHands, null);
    assert.ok(
      (await clients[i].request('/me')).activeRooms.some(
        (room) => room.id === id
      )
    );
  }
  for (let i = 0; i < 4; i++) {
    current = await clients[i].request(`/rooms/${id}`);
    current = await clients[i].request(`/rooms/${id}/action`, 'POST', {
      type: 'play',
      cardId: current.game.hand[0].id,
      revision: current.revision,
    });
  }
  assert.equal(current.game.lastTrick.length, 4);
  await owner.request(`/contacts/${profiles[3].id}`, 'DELETE');
  assert.equal((await clients[3].request(`/rooms/${id}`)).status, 'CLOSED');
});

test('os jogos de vários jogadores têm bots do mesmo nível e o servidor executa suas jogadas', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  for (const gameId of ['domino', 'cards'])
    for (const difficulty of ['medium']) {
      const client = app.client();
      const me = await client.profile(`Jogador ${gameId}`);
      const created = await client.request(
        '/rooms',
        'POST',
        {
          gameId,
          mode: 'bot',
          difficulty,
          ...(gameId === 'cards' ? { capacity: 4 } : {}),
        },
        201
      );
      assert.equal(created.invitation, null);
      assert.equal(created.room.mode, 'bot');
      assert.equal(created.room.difficulty, difficulty);
      assert.ok(created.room.players.slice(1).every((player) => player.bot));
      const saved = app.store.getRoom(created.room.id);
      assert.equal(saved.game.currentPlayerId, me.id);
      let action;
      if (gameId === 'crossword') {
        const word = crosswords[saved.game.puzzleIndex].words[0];
        action = { type: 'answer', wordId: word.id, answer: word.answer };
      } else if (gameId === 'puzzle') action = { type: 'swap', from: 0, to: 1 };
      else action = chooseBotAction(gameId, saved.game, me.id, 'medium');
      const state = await client.request(`/rooms/${saved.id}/action`, 'POST', {
        ...action,
        revision: saved.revision,
      });
      assert.equal(state.revision, saved.revision + 1);
      assert.ok(state.game.history.some((item) => item.playerId === me.id));
      assert.equal(state.game.hands, undefined);
      assert.equal(state.game.solvedByPlayer, undefined);
      assert.equal(state.game.piecesByPlayer, undefined);
    }
});

test('modos individuais concluem palavras cruzadas e quebra-cabeça e reiniciam com placar', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const client = app.client();
  await client.profile('Maria');
  for (const gameId of ['crossword', 'puzzle']) {
    const created = await client.request(
      '/rooms',
      'POST',
      { gameId, mode: 'solo' },
      201
    );
    assert.equal(created.invitation, null);
    let state = created.room;
    if (gameId === 'crossword') {
      for (const word of crosswords[
        app.store.getRoom(state.id).game.puzzleIndex
      ].words)
        state = await client.request(`/rooms/${state.id}/action`, 'POST', {
          type: 'answer',
          wordId: word.id,
          answer: word.answer,
          revision: state.revision,
        });
    } else {
      for (let i = 0; i < 9 && state.status === 'PLAYING'; i++)
        if (state.game.pieces[i] !== i)
          state = await client.request(`/rooms/${state.id}/action`, 'POST', {
            type: 'swap',
            from: i,
            to: state.game.pieces.indexOf(i),
            revision: state.revision,
          });
    }
    assert.equal(state.status, 'FINISHED');
    state = await client.request(`/rooms/${state.id}/rematch`, 'POST', {
      revision: state.revision,
    });
    assert.equal(state.status, 'PLAYING');
    assert.equal(state.game.score[state.ownerId].wins, 1);
  }
});

test('valida modos, lotação e permissões por jogo e mantém dados do formato anterior', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const client = app.client();
  await client.profile('Maria');
  for (const body of [
    { gameId: 'cards', capacity: 9 },
    { gameId: 'cards', capacity: 3 },
    { gameId: 'domino', mode: 'solo' },
    { gameId: 'puzzle', mode: 'bot' },
    { gameId: 'domino', capacity: 8 },
    { gameId: 'puzzle', mode: 'fake' },
  ])
    await client.request('/rooms', 'POST', body, 400);
  const created = await client.request(
    '/rooms',
    'POST',
    { gameId: 'domino' },
    201
  );
  const legacy = app.store.getRoom(created.room.id);
  delete legacy.playerIds;
  delete legacy.mode;
  delete legacy.capacity;
  delete legacy.botIds;
  app.store.saveRoom(legacy);
  assert.equal((await client.request(`/rooms/${legacy.id}`)).players.length, 1);
  let me = await client.request('/me');
  await client.request('/me', 'PUT', { ...me, enabledGames: ['puzzle'] });
  await client.request('/rooms', 'POST', { gameId: 'domino' }, 400);
  await client.request('/rooms', 'POST', { gameId: 'cards' }, 400);
  await client.request(
    '/rooms',
    'POST',
    { gameId: 'puzzle', mode: 'solo' },
    201
  );
  await client.request(
    '/me',
    'PUT',
    { ...me, enabledGames: ['not-a-game'] },
    400
  );
});

test('desafios cooperativos compartilham progresso, pontuam os dois e exigem duas confirmações na revanche', async (t) => {
  const app = await start();
  t.after(() => app.stop());
  const owner = app.client();
  const guest = app.client();
  const first = await owner.profile('Maria');
  const second = await guest.profile('João');
  for (const gameId of ['crossword', 'puzzle']) {
    const created = await owner.request(
      '/rooms',
      'POST',
      { gameId, mode: 'online' },
      201
    );
    let state = await guest.request(
      `/invitations/${created.invitation.token}/join`,
      'POST',
      {}
    );
    if (!state.game)
      state = await owner.request(`/rooms/${state.id}/approve`, 'POST', {
        playerId: second.id,
      });
    if (gameId === 'crossword') {
      const words =
        crosswords[app.store.getRoom(state.id).game.puzzleIndex].words;
      for (const [i, word] of words.entries())
        state = await (i % 2 ? guest : owner).request(
          `/rooms/${state.id}/action`,
          'POST',
          {
            type: 'answer',
            wordId: word.id,
            answer: word.answer,
            revision: state.revision,
          }
        );
    } else {
      for (let i = 0; i < 9 && state.status === 'PLAYING'; i++)
        if (state.game.pieces[i] !== i)
          state = await (i % 2 ? owner : guest).request(
            `/rooms/${state.id}/action`,
            'POST',
            {
              type: 'swap',
              from: i,
              to: state.game.pieces.indexOf(i),
              revision: state.revision,
            }
          );
    }
    assert.equal(state.status, 'FINISHED');
    assert.equal(state.game.score[first.id].wins, 1);
    assert.equal(state.game.score[second.id].wins, 1);
    state = await owner.request(`/rooms/${state.id}/rematch`, 'POST', {
      revision: state.revision,
    });
    assert.equal(state.status, 'FINISHED');
    state = await guest.request(`/rooms/${state.id}/rematch`, 'POST', {
      revision: state.revision,
    });
    assert.equal(state.status, 'PLAYING');
  }
});
