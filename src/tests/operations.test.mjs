import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../backend/store.mjs';
import { createIdentityCodec } from '../whatsapp/identity.mjs';
import { createOutbox, backoffMs } from '../messaging/outbox.mjs';
import { createMonitor } from '../messaging/monitor.mjs';
import { createWppProvider } from '../messaging/provider.mjs';
import { createMaintenance } from '../backend/maintenance.mjs';
import { createEventLog, redact } from '../shared/log.mjs';
import { startBot, register, lastOf } from './helpers.mjs';

const ANA = '5511911111111';
const PHONE = '5511988887777@c.us';
const OTHER = '5511977776666@c.us';
const MIN = 60000;
const DAY = 86400000;
const stop = (bot) =>
  bot.app.server.listening ? bot.app.stop() : bot.app.store.close();

function clockAt(start = 1_800_000_000_000) {
  const clock = { time: start };
  return { clock, now: () => clock.time };
}

// Provedor falso: registra o que saiu e falha quando mandam falhar.
function fakeProvider() {
  const provider = {
    sent: [],
    fail: false,
    state: 'connected',
    async send(to, message) {
      if (provider.fail)
        throw Object.assign(new Error('fora'), { code: 'E503' });
      provider.sent.push({ to, message });
      return { id: String(provider.sent.length) };
    },
    async status() {
      return provider.state;
    },
  };
  return provider;
}

function outboxWith(options = {}) {
  const store = openStore(':memory:');
  const codec = createIdentityCodec('segredo-dos-dados');
  const provider = options.provider ?? fakeProvider();
  const { clock, now } = clockAt();
  const outbox = createOutbox({
    store,
    provider,
    codec,
    now,
    sendIntervalMs: 0,
    log: options.log ?? createEventLog({ log() {}, warn() {}, error() {} }),
  });
  return { store, codec, provider, clock, now, outbox };
}

const rows = (store) =>
  store.db.prepare('SELECT * FROM outbox ORDER BY id').all();

test('interface de provedor: o canal funciona com outra implementação, sem mudar os jogos', async (t) => {
  const provider = fakeProvider();
  const bot = startBot({ provider });
  t.after(() => stop(bot));
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, 'menu');
  await bot.app.whatsapp.idle();
  assert.ok(provider.sent.length >= 2, 'tudo saiu pelo provedor trocado');
  assert.equal(bot.fake.sent.length, 0, 'o WPPConnect nem foi chamado');
  assert.match(
    provider.sent.map((m) => m.message).join('\n'),
    /Qual é o seu nome|Olá/
  );
});

test('toda mensagem é gravada antes do envio e marcada como enviada depois', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const replies = await register(bot, ANA, 'Ana');
  await bot.app.whatsapp.idle();
  const all = rows(bot.app.store);
  assert.ok(all.length >= replies.length);
  assert.ok(
    all.every((row) => row.sent_at !== null),
    'nada ficou pendente'
  );
  assert.ok(
    all.every((row) => !row.to_sealed.includes('5511')),
    'destinatário cifrado'
  );
  assert.equal(bot.app.whatsapp.outbox.pending(), 0);
  assert.equal(bot.app.whatsapp.outbox.counters.sent, all.length);
});

test('provedor com erro: a mensagem fica pendente e a seguinte espera a primeira', async () => {
  const { store, provider, clock, outbox } = outboxWith();
  provider.fail = true;
  outbox.enqueue(PHONE, [{ body: 'primeira' }]);
  outbox.enqueue(PHONE, [{ body: 'segunda' }]);
  outbox.enqueue(OTHER, [{ body: 'de outra pessoa' }]);
  provider.fail = true;
  await outbox.idle();
  assert.equal(provider.sent.length, 0);
  assert.equal(outbox.pending(), 3);
  const [first] = rows(store);
  assert.equal(first.attempts, 1);
  assert.equal(first.last_error, 'E503');
  assert.equal(first.next_at, clock.time + backoffMs(1));

  // Antes do prazo de espera nada é reenviado.
  clock.time += 1000;
  outbox.pump();
  await outbox.idle();
  assert.equal(provider.sent.length, 0);

  // Provedor volta: sai na ordem de criação, por destinatário.
  provider.fail = false;
  clock.time += 60000;
  outbox.pump();
  await outbox.idle();
  assert.deepEqual(
    provider.sent.filter((m) => m.to === PHONE).map((m) => m.message),
    ['primeira', 'segunda']
  );
  assert.ok(rows(store).every((row) => row.sent_at !== null));
  assert.equal(outbox.counters.sent, 3);
  assert.ok(outbox.counters.errors >= 2);
});

test('espera cresce 2, 4, 8… segundos e para em 60', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 10].map(backoffMs),
    [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]
  );
});

test('pendentes com mais de 10 minutos são descartadas e contadas', async () => {
  const { store, provider, clock, outbox } = outboxWith();
  provider.fail = true;
  outbox.enqueue(PHONE, [{ body: 'velha' }]);
  await outbox.idle();
  clock.time += 9 * MIN;
  outbox.enqueue(PHONE, [{ body: 'recente' }]);
  await outbox.idle();
  provider.fail = false;
  clock.time += 2 * MIN; // a primeira passa de 10 minutos
  outbox.pump();
  await outbox.idle();
  const [old, recent] = rows(store);
  assert.ok(
    old.dropped_at !== null && old.sent_at === null,
    'velha descartada'
  );
  assert.ok(recent.sent_at !== null, 'a seguinte sai depois do descarte');
  assert.deepEqual(
    provider.sent.map((m) => m.message),
    ['recente']
  );
  assert.equal(outbox.counters.dropped, 1);
});

test('reinício retoma as pendentes sem repetir as confirmadas', async () => {
  const store = openStore(':memory:');
  const codec = createIdentityCodec('segredo-dos-dados');
  const { now } = clockAt();
  const first = fakeProvider();
  const before = createOutbox({
    store,
    provider: first,
    codec,
    now,
    sendIntervalMs: 0,
  });
  before.enqueue(PHONE, [{ body: 'confirmada' }]);
  await before.idle();
  first.fail = true;
  before.enqueue(PHONE, [{ body: 'pendente 1' }, { body: 'pendente 2' }]);
  await before.idle();
  assert.deepEqual(
    first.sent.map((m) => m.message),
    ['confirmada']
  );

  // "Reinicia": outra fila sobre o mesmo banco, agora com o provedor de volta.
  const second = fakeProvider();
  const after = createOutbox({
    store,
    provider: second,
    codec,
    now: () => now() + 60000,
    sendIntervalMs: 0,
  });
  after.pump();
  await after.idle();
  assert.deepEqual(
    second.sent.map((m) => m.message),
    ['pendente 1', 'pendente 2']
  );
  assert.deepEqual(
    second.sent.map((m) => m.to),
    [PHONE, PHONE],
    'endereço decifrado'
  );
});

test('registros de falha não trazem telefone nem conteúdo', async () => {
  const lines = [];
  const sink = {
    log: (line) => lines.push(line),
    warn: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };
  const { provider, outbox } = outboxWith({ log: createEventLog(sink) });
  provider.fail = true;
  outbox.enqueue(PHONE, [{ body: 'mensagem secreta para 5511988887777' }]);
  await outbox.idle();
  assert.ok(lines.length >= 1);
  const text = lines.join('\n');
  assert.match(text, /outbox\.send_failed/);
  assert.match(text, /E503/);
  assert.doesNotMatch(text, /5511988887777|secreta|@c\.us/);
  assert.deepEqual(
    redact({
      phone: '1',
      to: '2',
      body: 'x',
      id: 7,
      error: 'tel 5511988887777',
    }),
    {
      id: 7,
      error: 'tel [oculto]',
    }
  );
});

test('o provedor do WPPConnect usa botões e cai para texto sem perder a mensagem', async () => {
  const calls = [];
  const client = {
    async sendButtons() {
      calls.push('buttons');
      throw new Error('sem botões');
    },
    async sendList() {
      calls.push('list');
    },
    async sendText() {
      calls.push('text');
    },
    async status() {
      return { status: 'CONNECTED' };
    },
  };
  const provider = createWppProvider({ client, log: { warn() {} } });
  await provider.send('x', 'oi', { kind: 'buttons', buttons: [] });
  await provider.send('x', 'oi', { kind: 'list', rows: [] });
  assert.deepEqual(
    calls,
    ['buttons', 'text', 'text'],
    'depois da falha, só texto'
  );
  assert.equal(await provider.status(), 'connected');
  client.status = async () => ({ status: 'QRCODE' });
  assert.equal(await provider.status(), 'disconnected');
});

test('alerta: avisa o administrador após 5 minutos, uma vez, e de novo ao voltar', async () => {
  const { store, provider, clock, now, outbox } = outboxWith();
  const admin = '5511900000000@c.us';
  const monitor = createMonitor({
    provider,
    outbox,
    adminAddress: admin,
    now,
    log: createEventLog({ log() {}, warn() {}, error() {} }),
  });
  const texts = () =>
    provider.sent.filter((m) => m.to === admin).map((m) => m.message);

  provider.state = 'disconnected';
  await monitor.check();
  clock.time += 4 * MIN;
  await monitor.check();
  assert.equal(texts().length, 0, 'ainda antes dos 5 minutos');
  clock.time += 1 * MIN;
  await monitor.check();
  await outbox.idle();
  assert.equal(texts().length, 1);
  assert.match(texts()[0], /desconectado há mais de 5 minutos/);
  clock.time += 10 * MIN;
  await monitor.check();
  await outbox.idle();
  assert.equal(texts().length, 1, 'uma vez por ocorrência');
  assert.equal(monitor.snapshot().alerted, true);

  provider.state = 'connected';
  await monitor.check();
  await outbox.idle();
  assert.equal(texts().length, 2);
  assert.match(texts()[1], /voltou/);
  assert.equal(monitor.snapshot().downSince, null);

  // Nova queda é outra ocorrência.
  provider.state = 'disconnected';
  await monitor.check();
  clock.time += 6 * MIN;
  await monitor.check();
  await outbox.idle();
  assert.equal(texts().length, 3);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM outbox').get().n, 3);
});

test('alerta com o provedor fora fica na fila e sai quando ele volta', async () => {
  const { provider, clock, now, outbox } = outboxWith();
  const admin = '5511900000000@c.us';
  const monitor = createMonitor({
    provider,
    outbox,
    adminAddress: admin,
    now,
    log: createEventLog({ log() {}, warn() {}, error() {} }),
  });
  provider.state = 'disconnected';
  provider.fail = true;
  await monitor.check();
  clock.time += 5 * MIN;
  await monitor.check();
  await outbox.idle();
  assert.equal(outbox.pending(), 1);
  // Passa dos 10 minutos normais: o aviso ao administrador ainda vale (24 h).
  clock.time += 20 * MIN;
  provider.fail = false;
  provider.state = 'connected';
  outbox.pump();
  await outbox.idle();
  assert.equal(provider.sent.filter((m) => m.to === admin).length, 1);
});

test('tick só consulta o provedor a cada 30 segundos', async () => {
  const { provider, clock, now, outbox } = outboxWith();
  let calls = 0;
  const original = provider.status;
  provider.status = async () => {
    calls++;
    return original();
  };
  const monitor = createMonitor({ provider, outbox, now });
  monitor.tick();
  await monitor.idle();
  assert.equal(calls, 1);
  clock.time += 10_000;
  monitor.tick();
  await monitor.idle();
  assert.equal(calls, 1);
  clock.time += 25_000;
  monitor.tick();
  await monitor.idle();
  assert.equal(calls, 2);
});

async function listen(bot) {
  bot.app.server.listen(0, '127.0.0.1');
  await once(bot.app.server, 'listening');
  return `http://127.0.0.1:${bot.app.server.address().port}`;
}

test('/healthz: 200 com banco e provedor, sem dados pessoais; 503 sem banco', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const origin = await listen(bot);
  bot.fake.status = 'CONNECTED';
  await register(bot, ANA, 'Ana');
  const response = await fetch(`${origin}/healthz`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.database, 'ok');
  assert.equal(body.provider, 'connected');
  assert.doesNotMatch(JSON.stringify(body), /5511|Ana/);
  // Provedor desconectado ainda responde 200, mostrando o estado.
  bot.fake.status = 'DISCONNECTED';
  await bot.app.whatsapp.monitor.check();
  const degraded = await (await fetch(`${origin}/healthz`)).json();
  assert.equal(degraded.provider, 'disconnected');
  assert.ok(degraded.providerDownSince);
  // Banco indisponível.
  bot.app.store.db.close();
  const down = await fetch(`${origin}/healthz`);
  assert.equal(down.status, 503);
  assert.equal((await down.json()).database, 'error');
  bot.app.store.close = () => {};
});

test('/metrics: 401 sem token e contadores em texto com o token', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  const origin = await listen(bot);
  await register(bot, ANA, 'Ana');
  await bot.say(ANA, '1');
  await bot.app.whatsapp.idle();
  assert.equal((await fetch(`${origin}/metrics`)).status, 401);
  assert.equal(
    (
      await fetch(`${origin}/metrics`, {
        headers: { 'x-admin-token': 'errado' },
      })
    ).status,
    401
  );
  const ok = await fetch(`${origin}/metrics`, {
    headers: { 'x-admin-token': 'token-admin' },
  });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /text\/plain/);
  const text = await ok.text();
  const value = (name) =>
    Number(text.match(new RegExp(`^${name} (\\d+)$`, 'm'))[1]);
  assert.equal(
    value('mesa_messages_sent_total'),
    bot.app.whatsapp.outbox.counters.sent
  );
  assert.ok(value('mesa_messages_sent_total') >= 3);
  assert.equal(value('mesa_messages_pending'), 0);
  assert.equal(value('mesa_messages_dropped_total'), 0);
  assert.equal(value('mesa_provider_errors_total'), 0);
  assert.ok(Number.isInteger(value('mesa_rooms_active')));
  const bearer = await fetch(`${origin}/metrics`, {
    headers: { Authorization: 'Bearer token-admin' },
  });
  assert.equal(bearer.status, 200);
  assert.doesNotMatch(text, /5511|Ana/);
});

test('/metrics e /healthz funcionam sem WhatsApp configurado', async () => {
  const { createApplication } = await import('../backend/server.mjs');
  const app = createApplication({
    databasePath: ':memory:',
    publicOrigin: '',
    whatsapp: null,
    adminToken: 'so-metricas',
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  try {
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const health = await (await fetch(`${origin}/healthz`)).json();
    assert.equal(health.provider, 'not-configured');
    const metrics = await fetch(`${origin}/metrics`, {
      headers: { 'x-admin-token': 'so-metricas' },
    });
    assert.match(await metrics.text(), /mesa_messages_pending 0/);
  } finally {
    await app.stop();
  }
});

function seed(store, { now }) {
  const db = store.db;
  const insertRoom = db.prepare('INSERT INTO rooms VALUES (?, ?, ?)');
  insertRoom.run('sala-velha', '{}', now - 31 * DAY);
  insertRoom.run('sala-recente', '{}', now - 5 * DAY);
  db.prepare(
    "INSERT INTO invitations VALUES ('t1', 'sala-velha', ?, NULL)"
  ).run(now - 31 * DAY);
  const message = db.prepare('INSERT INTO processed_messages VALUES (?, ?)');
  message.run('antiga', now - 8 * DAY);
  message.run('recente', now - 6 * DAY);
  const out = db.prepare(
    `INSERT INTO outbox (to_hash, to_sealed, body, created_at, expires_at, next_at, sent_at, dropped_at)
     VALUES ('h', 's', 'b', ?, ?, ?, ?, ?)`
  );
  out.run(now - 9 * DAY, now - 9 * DAY, now - 9 * DAY, now - 8 * DAY, null);
  out.run(now - 7 * DAY, now - 7 * DAY, now - 7 * DAY, null, now - 8 * DAY);
  out.run(now - 7 * DAY, now - 7 * DAY, now - 7 * DAY, now - 6 * DAY, null);
  out.run(now - MIN, now + MIN, now, null, null);
  db.prepare("INSERT INTO profiles VALUES ('p1', '{}'), ('p2', '{}')").run();
  const code = db.prepare(
    `INSERT INTO recovery_codes (id, phone_hash, ip_hash, expires, created) VALUES (?, 'x', 'y', ?, ?)`
  );
  code.run('vencido', now - MIN, now - 10 * MIN);
  code.run('valido', now + 5 * MIN, now);
  db.prepare(
    "INSERT INTO favorites (owner_id, friend_id, state, created_at, decided_at) VALUES ('p1', 'p2', 'accepted', 1, 1)"
  ).run();
  db.prepare(
    "INSERT INTO match_results VALUES ('r1', 'sala-velha', 1, 'domino', ?, '[]', '[]', '{}')"
  ).run(now - 40 * DAY);
}

test('limpeza diária apaga só o que passou do prazo e preserva resultados e favoritos', () => {
  const store = openStore(':memory:');
  const { now } = clockAt();
  seed(store, { now: now() });
  const maintenance = createMaintenance({
    store,
    now,
    log: createEventLog({ log() {} }),
  });
  const removed = maintenance.cleanup();
  const count = (table) =>
    store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
  assert.equal(removed.messages, 1);
  assert.deepEqual(
    store.db
      .prepare('SELECT id FROM processed_messages')
      .all()
      .map((r) => r.id),
    ['recente']
  );
  assert.equal(removed.outbox, 2, 'enviada e descartada com mais de 7 dias');
  assert.equal(count('outbox'), 2, 'a enviada há 6 dias e a pendente ficam');
  assert.deepEqual(
    store.db
      .prepare('SELECT id FROM recovery_codes')
      .all()
      .map((r) => r.id),
    ['valido']
  );
  assert.deepEqual(
    store.db
      .prepare('SELECT id FROM rooms')
      .all()
      .map((r) => r.id),
    ['sala-recente']
  );
  assert.equal(count('invitations'), 0);
  assert.equal(
    count('match_results'),
    1,
    'resultado de mesa apagada permanece'
  );
  assert.equal(count('favorites'), 1);
});

test('backup copia o banco em uso, abre sem erros e mantém as 7 mais recentes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mesa-backup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = openStore(':memory:');
  const { clock, now } = clockAt();
  const backupDir = join(dir, 'backups');
  seed(store, { now: now() });
  const maintenance = createMaintenance({
    store,
    now,
    backupDir,
    log: createEventLog({ log() {} }),
  });
  const first = maintenance.backup();
  assert.ok(existsSync(first));
  assert.match(first, /mesa-\d{8}\.db$/);
  const copy = new DatabaseSync(first);
  assert.equal(copy.prepare('SELECT count(*) AS n FROM rooms').get().n, 2);
  assert.equal(
    copy.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok'
  );
  assert.equal(copy.prepare('SELECT count(*) AS n FROM favorites').get().n, 1);
  copy.close();

  for (let day = 1; day <= 8; day++) {
    clock.time += DAY;
    store.db
      .prepare('INSERT INTO processed_messages VALUES (?, ?)')
      .run(`m${day}`, clock.time);
    maintenance.backup();
  }
  const names = readdirSync(backupDir).sort();
  assert.equal(names.length, 7);
  assert.ok(!names.includes(first.split(/[\\/]/).at(-1)), 'a mais antiga saiu');
  assert.equal(maintenance.backups().length, 7);
});

test('tick roda a limpeza e o backup a cada 24 horas e lembra entre reinícios', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mesa-tick-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = openStore(':memory:');
  const { clock, now } = clockAt();
  const make = () =>
    createMaintenance({
      store,
      now,
      backupDir: join(dir, 'b'),
      log: createEventLog({ log() {} }),
    });
  const maintenance = make();
  assert.deepEqual(maintenance.tick(), ['cleanup', 'backup']);
  assert.deepEqual(maintenance.tick(), []);
  clock.time += 23 * 60 * MIN;
  assert.deepEqual(make().tick(), [], 'reiniciar não repete');
  clock.time += 61 * MIN;
  assert.deepEqual(make().tick(), ['cleanup', 'backup']);
  assert.equal(maintenance.backups().length, 2);
});

test('sem pasta de backup só a limpeza roda', () => {
  const store = openStore(':memory:');
  const { now } = clockAt();
  const maintenance = createMaintenance({
    store,
    now,
    log: createEventLog({ log() {} }),
  });
  assert.deepEqual(maintenance.tick(), ['cleanup']);
  assert.equal(maintenance.backup(), null);
});

test('servidor expõe a manutenção e o mesmo texto de ajuda segue funcionando', async (t) => {
  const bot = startBot();
  t.after(() => stop(bot));
  assert.equal(typeof bot.app.maintenance.tick, 'function');
  const menu = lastOf(await register(bot, ANA, 'Ana'));
  assert.match(menu, /\[imagem\].*\*número\* ou o \*nome\*/s);
});
