import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApplication } from '../backend/server.mjs';

async function start() {
  const clock = { time: Date.now() };
  const app = createApplication({
    databasePath: ':memory:',
    publicOrigin: '',
    clock: () => clock.time,
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let cookie = '';
    return {
      async request(path, method = 'GET', body, expected = 200) {
        const res = await fetch(`${origin}/api${path}`, {
          method,
          headers: {
            Cookie: cookie,
            ...(body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
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
        return me;
      },
    };
  };
  return { app, clock, client };
}

async function table(ctx, options = {}) {
  const owner = ctx.client();
  const guest = ctx.client();
  await owner.profile('João');
  const guestProfile = await guest.profile('Maria');
  const created = await owner.request(
    '/rooms',
    'POST',
    { gameId: 'domino', ...options },
    201
  );
  const id = created.room.id;
  const token = created.invitation.token;
  await guest.request(`/invitations/${token}/join`, 'POST', {});
  await owner.request(`/rooms/${id}/approve`, 'POST', {
    playerId: guestProfile.id,
  });
  return { owner, guest, id, token };
}

test('partida sem humanos presentes por 5 minutos é cancelada e o convite deixa de valer', async (t) => {
  const ctx = await start();
  t.after(() => ctx.app.stop());
  const { owner, guest, id, token } = await table(ctx, { turnSeconds: 0 });
  ctx.clock.time += 4 * 60000;
  assert.equal(ctx.app.rooms.sweep().length, 0);
  ctx.clock.time += 2 * 60000;
  const [closed] = ctx.app.rooms.sweep();
  assert.equal(closed.closedReason, 'inactive');
  for (const person of [owner, guest]) {
    const view = await person.request(`/rooms/${id}`);
    assert.equal(view.status, 'CLOSED');
    assert.equal(view.closedReason, 'inactive');
  }
  await guest.request(`/invitations/${token}`, 'GET', undefined, 404);
  await guest.request(`/rooms/${id}/action`, 'POST', { revision: 0 }, 410);
});

test('ação HTTP depois do prazo recebe 409 e a jogada automática já está no estado', async (t) => {
  const ctx = await start();
  t.after(() => ctx.app.stop());
  const { owner, guest, id } = await table(ctx);
  const views = [
    await owner.request(`/rooms/${id}`),
    await guest.request(`/rooms/${id}`),
  ];
  const [player, view] =
    views[0].turn.playerId === views[0].owner.id
      ? [owner, views[0]]
      : [guest, views[1]];
  assert.equal(view.turn.seconds, 60);
  ctx.clock.time += 61000;
  const tile = view.game.hand[0];
  const refused = await player.request(
    `/rooms/${id}/action`,
    'POST',
    { type: 'play', tileId: tile.id, side: 'left', revision: view.revision },
    409
  );
  assert.match(refused.error, /tempo da sua vez acabou/);
  const after = await owner.request(`/rooms/${id}`);
  assert.equal(after.notice.type, 'auto');
  assert.ok(after.game.history.some((entry) => entry.type === 'auto'));
});
