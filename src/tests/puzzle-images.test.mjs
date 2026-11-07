import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImageService, LEVELS } from '../games/puzzle/images.mjs';
import * as puzzle from '../games/puzzle/engine.mjs';
import { chooseBotAction } from '../games/core/bots.mjs';
import { seededRng } from '../games/core/rng.mjs';
import { createApplication } from '../backend/server.mjs';
import { setup } from './helpers.mjs';

const quiet = { warn() {} };

test('catálogo embutido: 12 imagens com metadados e ao menos 4 por dificuldade', () => {
  const images = createImageService({ apiUrl: '' });
  const all = images.list();
  assert.ok(all.length >= 12);
  for (const level of LEVELS)
    assert.ok(images.list(level).length >= 4, `dificuldade ${level}`);
  for (const image of all) {
    for (const field of ['id', 'title', 'category', 'license', 'attribution'])
      assert.ok(image[field], `${image.id} sem ${field}`);
    assert.ok(LEVELS.includes(image.difficulty));
    const bytes = images.get(image.id);
    assert.equal(bytes.contentType, 'image/svg+xml');
    assert.ok(bytes.body.length > 100);
  }
  assert.ok(images.list('hard').every((image) => image.difficulty === 'hard'));
  assert.equal(images.get('../etc/passwd'), null);
  assert.equal(images.get('nao-existe'), null);
});

function fakeSource({ items, files }) {
  const calls = [];
  return {
    calls,
    async fetchImpl(url) {
      calls.push(url);
      if (url === 'https://imagens.test/lista')
        return new Response(JSON.stringify(items), { status: 200 });
      const file = files[url];
      if (!file) return new Response('nada', { status: 404 });
      return new Response(file.body, {
        status: 200,
        headers: { 'content-type': file.type, ...(file.headers ?? {}) },
      });
    },
  };
}

const item = (id, extra = {}) => ({
  id,
  title: `Imagem ${id}`,
  category: 'teste',
  difficulty: 'hard',
  license: 'CC0',
  attribution: 'Fulana',
  url: `https://imagens.test/${id}.jpg`,
  ...extra,
});

test('fonte externa: valida tipo, tamanho, licença e origem; guarda a cópia', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mesa-img-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1);
  const source = fakeSource({
    items: [
      item('boa'),
      item('gif'),
      item('grande'),
      item('declarada'),
      item('semlicenca', { license: '' }),
      item('facil-invalida', { difficulty: 'impossivel' }),
      item('outro-host', { url: 'https://malvado.test/x.jpg' }),
      item('../fuga'),
    ],
    files: {
      'https://imagens.test/boa.jpg': { type: 'image/jpeg', body: jpeg },
      'https://imagens.test/gif.jpg': { type: 'image/gif', body: jpeg },
      'https://imagens.test/grande.jpg': { type: 'image/png', body: big },
      'https://imagens.test/declarada.jpg': {
        type: 'image/webp',
        body: jpeg,
        headers: { 'content-length': String(3 * 1024 * 1024) },
      },
      'https://imagens.test/semlicenca.jpg': { type: 'image/jpeg', body: jpeg },
      'https://malvado.test/x.jpg': { type: 'image/jpeg', body: jpeg },
    },
  });
  const make = () =>
    createImageService({
      apiUrl: 'https://imagens.test/lista',
      cacheDir: dir,
      fetchImpl: source.fetchImpl,
      log: quiet,
    });
  const images = make();
  assert.equal(await images.refresh(), 1);
  const ids = images.list('hard').map((image) => image.id);
  assert.ok(ids.includes('ext-boa'));
  for (const rejected of [
    'gif',
    'grande',
    'declarada',
    'semlicenca',
    'outro-host',
  ])
    assert.ok(!ids.includes(`ext-${rejected}`), rejected);
  assert.ok(!source.calls.includes('https://malvado.test/x.jpg'));
  const served = images.get('ext-boa');
  assert.equal(served.contentType, 'image/jpeg');
  assert.deepEqual([...served.body], [...jpeg]);
  assert.ok(readdirSync(dir).some((name) => name.endsWith('.bin')));

  // Depois de reiniciar, a cópia em disco continua servindo a imagem.
  const reborn = make();
  assert.deepEqual([...reborn.get('ext-boa').body], [...jpeg]);
  const before = source.calls.length;
  assert.equal(await reborn.refresh(), 0, 'já guardada, não baixa de novo');
  assert.equal(source.calls.filter((url) => url.endsWith('boa.jpg')).length, 1);
  assert.ok(source.calls.length > before);
});

test('fonte externa fora do ar: catálogo embutido atende e a criação não falha', async () => {
  const images = createImageService({
    apiUrl: 'https://imagens.test/lista',
    fetchImpl: async () => {
      throw new Error('sem rede');
    },
    log: quiet,
  });
  assert.equal(await images.refresh(), 0);
  assert.ok(images.list('hard').length >= 4);
  const { rooms, person } = setup();
  const failing = person('Ana');
  const room = rooms.createRoom(failing, {
    gameId: 'puzzle',
    mode: 'solo',
    level: 'hard',
  });
  assert.equal(room.gameOptions.size, 5);
  assert.match(room.gameOptions.image, /^\/images\//);
});

test('criação escolhe grade e imagem pela dificuldade, com sorteio e foto do perfil', () => {
  const { rooms, person, store } = setup();
  const ana = person('Ana');
  const sizes = { easy: 3, medium: 4, hard: 5 };
  for (const level of LEVELS) {
    const room = rooms.createRoom(ana, {
      gameId: 'puzzle',
      mode: 'solo',
      level,
    });
    const stored = store.getRoom(room.id);
    assert.equal(stored.game.size, sizes[level]);
    assert.equal(stored.game.pieces.length, sizes[level] ** 2);
    const image = rooms.images.find(stored.gameOptions.imageId);
    assert.equal(image.difficulty, level, 'imagem do mesmo nível');
  }
  const chosen = rooms.images.list('medium')[1];
  const picked = rooms.createRoom(ana, {
    gameId: 'puzzle',
    mode: 'solo',
    level: 'medium',
    imageId: chosen.id,
  });
  assert.equal(picked.gameOptions.image, `/images/${chosen.id}`);
  assert.throws(
    () =>
      rooms.createRoom(ana, {
        gameId: 'puzzle',
        mode: 'solo',
        level: 'easy',
        imageId: chosen.id,
      }),
    /Imagem inválida/
  );
  assert.throws(
    () =>
      rooms.createRoom(ana, { gameId: 'puzzle', mode: 'solo', level: 'zzz' }),
    /dificuldade/
  );
  store.saveProfile({
    ...store.getProfile(ana.id),
    photo: 'data:image/png;base64,AAAA',
  });
  const photo = rooms.createRoom(ana, {
    gameId: 'puzzle',
    mode: 'solo',
    level: 'hard',
    usePhoto: true,
  });
  assert.equal(photo.gameOptions.image, 'data:image/png;base64,AAAA');
  assert.equal(photo.gameOptions.size, 5);
});

test('motor N×N conclui e faz revanche em 3×3, 4×4 e 5×5; formato antigo vale 3×3', () => {
  for (const size of [3, 4, 5]) {
    let game = puzzle.createGame(['a'], {}, { size, rng: seededRng(size) });
    assert.equal(game.pieces.length, size * size);
    assert.equal(puzzle.publicGame(game, 'a').size, size);
    for (let guard = 0; game.status === 'PLAYING' && guard < 400; guard++)
      game = puzzle.processAction(
        game,
        'a',
        chooseBotAction(
          'puzzle',
          { ...game, piecesByPlayer: { a: game.pieces } },
          'a',
          'hard',
          {
            rng: seededRng(guard),
          }
        )
      );
    assert.equal(game.status, 'FINISHED', `${size}×${size} concluído`);
    const again = puzzle.requestRematch(game, 'a');
    assert.equal(again.size, size);
    assert.equal(again.pieces.length, size * size);
    assert.equal(again.status, 'PLAYING');
  }
  const old = puzzle.createGame(['a'], {}, { rng: seededRng(1) });
  delete old.size;
  assert.equal(puzzle.publicGame(old, 'a').size, 3);
  puzzle.processAction(old, 'a', { type: 'swap', from: 0, to: 8 });
  assert.throws(
    () => puzzle.processAction(old, 'a', { type: 'swap', from: 0, to: 9 }),
    /entre 1 e 9/
  );
  assert.throws(() => puzzle.createGame(['a'], {}, { size: 6 }), /9, 16 ou 25/);
});

test('API: lista por dificuldade e serve cada imagem pela própria origem', async (t) => {
  const app = createApplication({ databasePath: ':memory:', publicOrigin: '' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.stop());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const first = await fetch(`${origin}/api/me`);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const get = (path) =>
    fetch(`${origin}${path}`, { headers: { Cookie: cookie } });
  const hard = await (await get('/api/images?difficulty=hard')).json();
  assert.ok(hard.length >= 4);
  assert.ok(hard.every((image) => image.difficulty === 'hard'));
  assert.ok(hard.every((image) => image.url === `/images/${image.id}`));
  assert.equal((await get('/api/images?difficulty=zzz')).status, 400);
  const image = await fetch(`${origin}${hard[0].url}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/svg+xml');
  assert.match(await image.text(), /<svg/);
  assert.equal((await fetch(`${origin}/images/nao-existe`)).status, 404);
});
