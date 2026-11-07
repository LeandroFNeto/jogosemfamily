import { randomUUID, createHash } from 'node:crypto';
import { defaultPreferences } from '../family-panel/profile.mjs';
import { allGameIds } from '../shared/games.mjs';
import { createConversation } from './conversation.mjs';
import { createIdentityCodec, maskJid, parseJid } from './identity.mjs';
import { createWppClient } from './wpp-client.mjs';
import { createWppProvider } from '../messaging/provider.mjs';
import { createOutbox } from '../messaging/outbox.mjs';
import { createMonitor } from '../messaging/monitor.mjs';
import { createEventLog } from '../shared/log.mjs';
import { parseWebhook } from './webhook.mjs';
import { createRecovery } from './recovery.mjs';

const CHANNEL = 'whatsapp';
const MAX_MESSAGE = 3500;

export function whatsappConfigFromEnv(env = process.env) {
  if (!env.WPP_URL || !env.WPP_SECRET_KEY || !env.WHATSAPP_WEBHOOK_SECRET)
    return null;
  return {
    url: env.WPP_URL,
    secretKey: env.WPP_SECRET_KEY,
    session: env.WPP_SESSION || 'mesa-familia',
    botNumber: String(env.WHATSAPP_BOT_NUMBER || '').replace(/\D/g, ''),
    webhookSecret: env.WHATSAPP_WEBHOOK_SECRET,
    webhookBase: env.WHATSAPP_WEBHOOK_BASE || env.PUBLIC_ORIGIN || '',
    adminToken: env.WHATSAPP_ADMIN_TOKEN || '',
    dataSecret: env.WHATSAPP_DATA_KEY || env.WHATSAPP_WEBHOOK_SECRET,
    // 'off' envia apenas texto numerado; qualquer outro valor liga botões e listas.
    interactive: String(env.WHATSAPP_INTERACTIVE || 'on').toLowerCase(),
    // Número que recebe os avisos de bot fora do ar (só dígitos, com país e DDD).
    adminPhone: String(env.ADMIN_PHONE || '').replace(/\D/g, ''),
  };
}

// Divide textos longos em partes ordenadas, preferindo quebras de linha.
export function splitMessage(text, limit = MAX_MESSAGE) {
  if (text.length <= limit) return [text];
  const parts = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current && current.length + line.length + 1 > limit) {
      parts.push(current);
      current = '';
    }
    current = current ? `${current}\n${line}` : line;
    while (current.length > limit) {
      parts.push(current.slice(0, limit));
      current = current.slice(limit);
    }
  }
  if (current) parts.push(current);
  return parts.map((part, index) =>
    parts.length > 1 ? `(${index + 1}/${parts.length})\n${part}` : part
  );
}

export function createWhatsappChannel({
  store,
  rooms,
  config,
  webOrigin = '',
  client = createWppClient({
    url: config.url,
    secretKey: config.secretKey,
    session: config.session,
    webhookUrl: `${String(config.webhookBase).replace(/\/$/, '')}/webhook/whatsapp?secret=${encodeURIComponent(config.webhookSecret)}`,
  }),
  now = () => Date.now(),
  sendIntervalMs = 1000,
  rateLimitPerMinute = 30,
  log = console,
  provider = createWppProvider({
    client,
    interactive: () => config.interactive,
    now,
    log,
  }),
}) {
  const codec = createIdentityCodec(config.dataSecret);
  const inboundChains = new Map();
  const outboundChains = new Map();
  const limits = new Map();
  const inflight = new Set();
  const events = createEventLog(log);

  const track = (promise) => {
    inflight.add(promise);
    promise.finally(() => inflight.delete(promise));
    return promise;
  };

  // Fila de saída durável: toda mensagem passa pelo banco antes do provedor.
  const outbox = createOutbox({
    store,
    provider,
    codec,
    now,
    sendIntervalMs,
    log: events,
  });
  const monitor = createMonitor({
    provider,
    outbox,
    adminAddress: config.adminPhone ? `${config.adminPhone}@c.us` : '',
    now,
    log: events,
  });

  function enqueueOutbound(address, text, interactive) {
    const parts = splitMessage(text);
    outbox.enqueue(
      address,
      parts.map((body, index) => ({
        body,
        interactive: index === parts.length - 1 ? interactive : null,
      }))
    );
  }

  function send(profileId, text, interactive) {
    const identity = store.identityOf(CHANNEL, profileId);
    if (!identity) return;
    enqueueOutbound(codec.open(identity.address), text, interactive);
  }

  function profileFor(parsedJid) {
    const idHash = codec.hash(parsedJid.key);
    const found = store.findIdentity(CHANNEL, idHash);
    const existing = found && store.getProfile(found.profile_id);
    if (existing) return existing;
    const profile = {
      id: randomUUID(),
      name: '',
      photo: '',
      preferences: defaultPreferences(),
      dominoEnabled: true,
      enabledGames: allGameIds(),
      contacts: [],
    };
    store.saveProfile(profile);
    store.saveIdentity(
      CHANNEL,
      idHash,
      profile.id,
      codec.seal(parsedJid.address)
    );
    return profile;
  }

  const recovery = createRecovery({ store, codec, send, now });
  const conversation = createConversation({
    store,
    rooms,
    recovery,
    send,
    botNumber: config.botNumber,
    webOrigin,
    now,
    log,
  });
  rooms.onRoomChanged(conversation.onRoomChanged);

  function limited(key, address) {
    const entry = limits.get(key) ?? { since: now(), count: 0, warned: false };
    if (now() - entry.since > 60000) {
      entry.since = now();
      entry.count = 0;
      entry.warned = false;
    }
    entry.count++;
    limits.set(key, entry);
    if (entry.count <= rateLimitPerMinute) return false;
    if (!entry.warned) {
      entry.warned = true;
      enqueueOutbound(
        address,
        '⏳ Você está enviando mensagens rápido demais. Aguarde um minuto e tente de novo.'
      );
    }
    return true;
  }

  function messageKey(event, parsedJid) {
    return (
      event.messageId ??
      createHash('sha256')
        .update(`${parsedJid.key}|${event.timestamp}|${event.text}`)
        .digest('hex')
    );
  }

  function handleMessage(event) {
    const parsedJid = parseJid(event.jid);
    if (!parsedJid) return Promise.resolve({ ignored: 'jid' });
    if (!store.markProcessed(messageKey(event, parsedJid), now()))
      return Promise.resolve({ ignored: 'duplicate' });
    if (limited(parsedJid.key, parsedJid.address))
      return Promise.resolve({ ignored: 'rate-limit' });
    const previous = inboundChains.get(parsedJid.key) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const profile = profileFor(parsedJid);
        rooms.touchProfile(profile.id);
        await conversation.handle(profile, event.text);
        return { handled: true };
      })
      .catch((error) => {
        log.error?.('Falha ao processar mensagem:', error.message);
        // Quem escreveu nunca fica sem resposta: avisa e indica como continuar.
        try {
          enqueueOutbound(
            parsedJid.address,
            '⚠️ Tive um problema para responder agora. Tente de novo em instantes ou digite *menu*.'
          );
        } catch {
          /* o aviso é opcional */
        }
        return { ignored: 'error' };
      });
    inboundChains.set(parsedJid.key, next);
    next.finally(() => {
      if (inboundChains.get(parsedJid.key) === next)
        inboundChains.delete(parsedJid.key);
    });
    return track(next);
  }

  return {
    config,
    client,
    provider,
    outbox,
    monitor,
    recovery,
    handleWebhook(payload) {
      const event = parseWebhook(payload, now());
      if (event.kind === 'qrcode') {
        client.rememberQrcode?.(event.qrcode);
        return Promise.resolve({ ignored: 'qrcode' });
      }
      if (event.kind === 'message') return handleMessage(event);
      return Promise.resolve({ ignored: event.reason ?? event.kind });
    },
    // Lembretes de tempo da vez; chamado pela varredura de 1 s do servidor.
    tick: () => {
      conversation.tick();
      outbox.pump();
      monitor.tick();
    },
    status: () => client.status(),
    start: () => client.start(),
    // Aguarda mensagens em processamento e envios pendentes (usado em testes).
    async idle() {
      while (inflight.size) await Promise.allSettled([...inflight]);
      await outbox.idle();
      await new Promise((resolve) => setImmediate(resolve));
      while (inflight.size) await Promise.allSettled([...inflight]);
      await outbox.idle();
    },
  };
}
