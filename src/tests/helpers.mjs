import { randomUUID } from 'node:crypto';
import { openStore } from '../backend/store.mjs';
import { createRoomsService } from '../backend/rooms-service.mjs';
import { defaultPreferences } from '../family-panel/profile.mjs';
import { allGameIds } from '../shared/games.mjs';

export function setup({ online = () => false, botDelayMs = 0 } = {}) {
  const store = openStore(':memory:');
  const clock = { time: Date.now() };
  const advance = (ms) => {
    clock.time += ms;
  };
  const rooms = createRoomsService({
    store,
    now: () => clock.time,
    isOnline: online,
    botDelayMs,
  });
  const person = (name) => {
    const profile = {
      id: randomUUID(),
      name,
      photo: '',
      preferences: defaultPreferences(),
      dominoEnabled: true,
      enabledGames: allGameIds(),
      contacts: [],
    };
    store.saveProfile(profile);
    return profile;
  };
  return { store, rooms, person, advance, clock };
}

import { createApplication } from '../backend/server.mjs';
import { createWppClient } from '../whatsapp/wpp-client.mjs';

// Servidor falso do WPPConnect: registra mensagens enviadas por telefone.
export function fakeWpp() {
  const fake = {
    status: 'DISCONNECTED',
    sent: [],
    images: [],
    interactive: [],
    failInteractive: false,
    tokens: 0,
    rejectNextToken: false,
    calls: [],
    async fetchImpl(url, options = {}) {
      const path = new URL(url).pathname;
      fake.calls.push(path);
      const reply = (body, status = 200) =>
        new Response(JSON.stringify(body), { status });
      if (path.endsWith('/generate-token')) {
        fake.tokens++;
        return reply({ token: `token-${fake.tokens}` });
      }
      if (fake.rejectNextToken) {
        fake.rejectNextToken = false;
        return reply({}, 401);
      }
      if (path.endsWith('/send-image')) {
        const body = JSON.parse(options.body);
        fake.images.push(body);
        fake.sent.push({
          phone: body.phone,
          message: `[imagem] ${body.caption ?? ''}`,
        });
        return reply({ status: 'success' });
      }
      if (path.endsWith('/send-message')) {
        const body = JSON.parse(options.body);
        fake.sent.push({ phone: body.phone, message: body.message });
        return reply({ status: 'success' });
      }
      if (
        path.endsWith('/send-buttons') ||
        path.endsWith('/send-list-message')
      ) {
        if (fake.failInteractive) return reply({}, 500);
        const body = JSON.parse(options.body);
        const kind = path.endsWith('/send-buttons') ? 'buttons' : 'list';
        fake.interactive.push({ phone: body.phone, kind, body });
        fake.sent.push({
          phone: body.phone,
          message: body.message ?? body.description,
        });
        return reply({ status: 'success' });
      }
      if (path.endsWith('/status-session'))
        return reply({ status: fake.status });
      if (path.endsWith('/start-session'))
        return reply({ status: 'QRCODE', qrcode: 'QUJD' });
      return reply({}, 404);
    },
    take(number) {
      const taken = fake.sent.filter((m) => m.phone === `${number}@c.us`);
      fake.sent = fake.sent.filter((m) => m.phone !== `${number}@c.us`);
      return taken.map((m) => m.message);
    },
  };
  return fake;
}

export const BOT_NUMBER = '5511900000000';

const withoutWeb = ({ webBaseUrl, ...rest }) => rest;

export function startBot(
  options = {},
  { databasePath = ':memory:', clock } = {}
) {
  const fake = fakeWpp();
  const config = {
    url: 'http://wpp.test',
    secretKey: 'chave',
    session: 'mesa',
    botNumber: BOT_NUMBER,
    webhookSecret: 'segredo-do-webhook',
    webhookBase: 'http://mesa.test',
    adminToken: 'token-admin',
    dataSecret: 'segredo-dos-dados',
  };
  const client = createWppClient({
    url: config.url,
    secretKey: config.secretKey,
    session: config.session,
    webhookUrl: 'http://mesa.test/webhook/whatsapp',
    fetchImpl: fake.fetchImpl,
  });
  const app = createApplication({
    databasePath,
    publicOrigin: '',
    webBaseUrl: options.webBaseUrl ?? 'http://web.test',
    ...(clock ? { clock } : {}),
    whatsapp: config,
    whatsappOptions: { client, sendIntervalMs: 0, ...withoutWeb(options) },
  });
  let counter = 0;
  const payload = (number, text, extra = {}) => ({
    event: 'onmessage',
    type: 'chat',
    from: `${number}@c.us`,
    body: text,
    fromMe: false,
    isGroupMsg: false,
    id: `false_${number}@c.us_${++counter}`,
    timestamp: Math.floor(Date.now() / 1000),
    ...extra,
  });
  async function say(number, text, extra) {
    await app.whatsapp.handleWebhook(payload(number, text, extra));
    await app.whatsapp.idle();
    return fake.take(number);
  }
  // Envia sem aguardar, para testar a ordem de processamento.
  const sayNow = (number, text) =>
    app.whatsapp.handleWebhook(payload(number, text));
  return { app, fake, config, client, say, sayNow, payload };
}

export async function register(bot, number, name) {
  await bot.say(number, 'oi');
  return bot.say(number, name);
}

export const lastOf = (messages) => messages.at(-1) ?? '';
export const codeOf = (messages) =>
  messages.join('\n').match(/ENTRAR ([A-Z2-9]{8})/)?.[1];
