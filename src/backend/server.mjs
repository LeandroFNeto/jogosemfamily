import http from 'node:http';
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { AppError, requireValue } from '../shared/errors.mjs';
import {
  newToken,
  hashToken,
  issueInvitation,
  findInvitation,
} from '../invitations/service.mjs';
import {
  defaultPreferences,
  publicProfile,
  validateProfile,
} from '../family-panel/profile.mjs';
import { getGameEngine } from '../games/core/registry.mjs';
import { enabledGameIds, allGameIds } from '../shared/games.mjs';
import { galleryPage } from './art-gallery.mjs';
import { createRoomsService } from './rooms-service.mjs';
import { createImageService } from '../games/puzzle/images.mjs';
import { createMaintenance, retentionFromEnv } from './maintenance.mjs';
import { peekWebLink, redeemWebLink } from '../invitations/web-links.mjs';
import {
  createWhatsappChannel,
  whatsappConfigFromEnv,
} from '../whatsapp/channel.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DAY = 86400000;

export function createApplication({
  databasePath = process.env.DATABASE_PATH || join(root, 'data/mesa.sqlite'),
  publicOrigin = process.env.PUBLIC_ORIGIN || '',
  whatsapp = whatsappConfigFromEnv(),
  whatsappOptions = {},
  clock = () => Date.now(),
  images = createImageService(),
  // Origem web que o bot usa nos links pessoais (fora de produção pode ser http local).
  webBaseUrl = process.env.WEB_BASE_URL || '',
  // Token de /metrics quando o WhatsApp não está configurado.
  adminToken = process.env.ADMIN_TOKEN || '',
  // Pasta das cópias do banco; sem ela (ex.: banco temporário) não há backup.
  backupDir = process.env.BACKUP_DIR ||
    (databasePath ===
    (process.env.DATABASE_PATH || join(root, 'data/mesa.sqlite'))
      ? join(root, 'backups')
      : null),
  retention = retentionFromEnv(),
  // Pausa de cada jogada de bot, para parecer gente (BOT_DELAY_MS no servidor real).
  botDelayMs = 0,
} = {}) {
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    requireValue(
      parsed.protocol === 'https:',
      'PUBLIC_ORIGIN deve usar HTTPS.'
    );
    publicOrigin = parsed.origin;
  }
  const tunnelOrigin = (() => {
    try {
      return webBaseUrl ? new URL(webBaseUrl).origin : '';
    } catch {
      return '';
    }
  })();
  const store = openStore(databasePath);
  // shortcut: eventos em memória atendem uma instância; usar pub/sub ao escalar servidores.
  const streams = new Map();
  const limits = new Map();
  const connections = new Map();
  const now = clock;
  const profileOf = (id) => store.getProfile(id);
  const rooms = createRoomsService({
    botDelayMs,
    store,
    now,
    images,
    isOnline: (roomId, playerId) =>
      [...(streams.get(roomId) || [])].some(
        (client) => client.playerId === playerId
      ),
  });
  const { normalizeRoom, roomFor, snapshot, save, startRoom } = rooms;
  // Canal WhatsApp opcional: sem as variáveis de ambiente o servidor só atende a web.
  const whatsappChannel = whatsapp
    ? createWhatsappChannel({
        store,
        rooms,
        config: whatsapp,
        webOrigin: publicOrigin || webBaseUrl.replace(/\/$/, ''),
        now,
        ...whatsappOptions,
      })
    : null;
  const maintenance = createMaintenance({
    store,
    now,
    backupDir,
    retention,
  });
  const sameSecret = (given, expected) => {
    if (typeof given !== 'string' || !expected) return false;
    const digest = (value) => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(given), digest(expected));
  };

  const adminSecret = whatsapp?.adminToken || adminToken;

  // /healthz: 200 se o banco responde; informa o provedor sem dados pessoais.
  async function healthReport() {
    let database = 'ok';
    try {
      store.db.prepare('SELECT 1').get();
    } catch {
      database = 'error';
    }
    const monitor = whatsappChannel?.monitor;
    if (monitor && database === 'ok' && now() - monitor.state.checkedAt > 30000)
      await monitor.check();
    const provider = monitor?.snapshot() ?? {
      provider: 'not-configured',
      downSince: null,
      alerted: false,
    };
    return [
      {
        status: database === 'ok' ? 'ok' : 'down',
        database,
        provider: provider.provider,
        providerDownSince: provider.downSince
          ? new Date(provider.downSince).toISOString()
          : null,
        providerAlerted: provider.alerted,
      },
      database === 'ok' ? 200 : 503,
    ];
  }

  // /metrics: contadores em texto simples (`nome valor`).
  function metricsText() {
    const outbox = whatsappChannel?.outbox;
    const activeRooms = Number(
      store.db
        .prepare(
          "SELECT count(*) AS n FROM rooms WHERE expires > ? AND json_extract(data, '$.status') IN ('WAITING', 'PLAYING')"
        )
        .get(now()).n
    );
    const provider = whatsappChannel?.monitor.state.provider;
    return (
      [
        ['mesa_messages_sent_total', outbox?.counters.sent ?? 0],
        ['mesa_messages_pending', outbox?.pending() ?? 0],
        ['mesa_messages_dropped_total', outbox?.counters.dropped ?? 0],
        ['mesa_provider_errors_total', outbox?.counters.errors ?? 0],
        ['mesa_provider_connected', provider === 'connected' ? 1 : 0],
        ['mesa_rooms_active', activeRooms],
      ]
        .map(([name, value]) => `${name} ${value}`)
        .join('\n') + '\n'
    );
  }

  function startSession(res, profileId) {
    const fresh = newToken();
    store.db
      .prepare('INSERT INTO sessions VALUES (?, ?, ?)')
      .run(hashToken(fresh), profileId, now() + 30 * DAY);
    res.setHeader(
      'Set-Cookie',
      `mesa_session=${fresh}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${publicOrigin ? '; Secure' : ''}`
    );
  }

  function session(req, res) {
    const token = req.headers.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('mesa_session='))
      ?.slice(13);
    let profile;
    if (token && /^[\w-]{43}$/.test(token)) {
      const row = store.db
        .prepare(
          'SELECT profile_id FROM sessions WHERE token_hash = ? AND expires > ?'
        )
        .get(hashToken(token), now());
      if (row) profile = profileOf(row.profile_id);
    }
    if (!profile) {
      profile = {
        id: randomUUID(),
        name: '',
        photo: '',
        preferences: defaultPreferences(),
        dominoEnabled: true,
        enabledGames: allGameIds(),
        contacts: [],
      };
      store.saveProfile(profile);
      startSession(res, profile.id);
    }
    return profile;
  }

  function publish(room) {
    for (const client of streams.get(room.id) || []) {
      const removed = rooms.stateOf(room, client.playerId) === 'removed';
      const member =
        room.playerIds.includes(client.playerId) ||
        room.pendingId === client.playerId;
      if (removed) {
        client.res.write(`event: removed\ndata: {}\n\n`);
        client.res.end();
      } else if (!member) {
        client.res.write(`event: revoked\ndata: {}\n\n`);
        client.res.end();
      } else
        client.res.write(
          `id: ${room.revision}\ndata: ${JSON.stringify(snapshot(room, client.playerId))}\n\n`
        );
    }
  }

  rooms.onRoomChanged(publish);

  function rateLimit(req) {
    const key = req.socket.remoteAddress;
    const entry = limits.get(key) || { since: now(), count: 0 };
    if (now() - entry.since > 60000) {
      entry.since = now();
      entry.count = 0;
    }
    entry.count++;
    limits.set(key, entry);
    requireValue(
      entry.count <= 300,
      'Muitos pedidos. Aguarde um minuto e tente novamente.',
      429
    );
  }

  async function readBody(req, limit = 200000) {
    requireValue(
      req.headers['content-type']?.split(';')[0] === 'application/json',
      'Envie dados no formato JSON.',
      415
    );
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      requireValue(
        size <= limit,
        'A foto ou os dados são grandes demais.',
        413
      );
      chunks.push(chunk);
    }
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requireValue(
        data && typeof data === 'object' && !Array.isArray(data),
        'Dados inválidos.'
      );
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Os dados enviados não são válidos.');
    }
  }

  function json(res, data, status = 200) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify(data));
  }

  async function api(req, res, url) {
    rateLimit(req);
    const requestOrigin = publicOrigin || `http://${req.headers.host}`;
    // Túnel/domínio configurado em WEB_BASE_URL também é origem própria.
    requireValue(
      !req.headers.origin ||
        req.headers.origin === requestOrigin ||
        req.headers.origin === tunnelOrigin,
      'Origem não autorizada.',
      403
    );
    requireValue(
      req.headers['sec-fetch-site'] !== 'cross-site',
      'Acesso externo não autorizado.',
      403
    );
    const path = url.pathname;
    const method = req.method;

    // Recuperação de conta: antes de criar qualquer perfil anônimo para o pedido.
    if (path.startsWith('/api/recovery/') && method === 'POST') {
      requireValue(
        whatsappChannel,
        'A recuperação por WhatsApp não está disponível neste servidor.',
        404
      );
      const body = await readBody(req, 2000);
      const { recovery } = whatsappChannel;
      if (path === '/api/recovery/request')
        return json(
          res,
          recovery.request(body.phone, req.socket.remoteAddress),
          202
        );
      if (path === '/api/recovery/verify') {
        const profileId = recovery.verify(body.phone, body.code);
        // Todas as sessões anteriores deixam de valer; o aparelho atual assume.
        store.db
          .prepare('DELETE FROM sessions WHERE profile_id = ?')
          .run(profileId);
        startSession(res, profileId);
        recovery.notifyAccess(profileId);
        return json(res, { ok: true });
      }
    }

    let me = session(req, res);

    if (path === '/api/me' && method === 'GET') {
      const activeRooms = store.db
        .prepare(
          `SELECT data FROM rooms WHERE expires > ? AND
        (json_extract(data, '$.ownerId') = ? OR json_extract(data, '$.guestId') = ? OR json_extract(data, '$.pendingId') = ? OR EXISTS (SELECT 1 FROM json_each(data, '$.playerIds') WHERE value = ?))
        AND json_extract(data, '$.status') != 'CLOSED' ORDER BY expires DESC LIMIT 10`
        )
        .all(now(), me.id, me.id, me.id, me.id)
        .map((row) => rooms.normalizeRoom(JSON.parse(row.data)))
        .filter((room) => rooms.stateOf(room, me.id) !== 'removed')
        .map((room) => ({
          id: room.id,
          status: room.status,
          gameId: room.gameId,
          solo: room.solo === true,
          name:
            profileOf(
              room.ownerId === me.id
                ? room.guestId || room.pendingId || me.id
                : room.ownerId
            )?.name || 'Familiar',
        }));
      return json(res, {
        ...me,
        enabledGames: enabledGameIds(me),
        whatsappAvailable: Boolean(whatsappChannel),
        phoneLinked: Boolean(store.identityOf('whatsapp', me.id)),
        contacts: me.contacts
          .map((id) => profileOf(id))
          .filter(Boolean)
          .map(publicProfile),
        activeRooms,
      });
    }
    if (path === '/api/link-code' && method === 'POST') {
      requireValue(
        whatsappChannel,
        'O WhatsApp não está disponível neste servidor.',
        404
      );
      await readBody(req, 2000);
      const { code, expires } = whatsappChannel.recovery.issueLinkCode(me.id);
      const number = whatsapp.botNumber;
      return json(res, {
        code,
        expires,
        link: number
          ? `https://wa.me/${number}?text=${encodeURIComponent(`VINCULAR ${code}`)}`
          : null,
      });
    }
    if (path === '/api/me' && method === 'PUT') {
      const validated = validateProfile(await readBody(req));
      store.saveProfile({ ...profileOf(me.id), ...validated });
      return json(res, { ok: true });
    }
    const contactMatch = path.match(/^\/api\/contacts\/([\w-]+)$/);
    if (contactMatch && method === 'DELETE') {
      rooms.removeFavorite(me, contactMatch[1]);
      return json(res, { ok: true });
    }
    if (path === '/api/ranking' && method === 'GET') {
      const gameId = url.searchParams.get('game') || null;
      return json(
        res,
        rooms.favorites.ranking(me.id, gameId).map((entry) => ({
          name: profileOf(entry.id)?.name || 'Jogador',
          me: entry.id === me.id,
          wins: entry.wins,
          games: entry.games,
          rate: entry.rate,
        }))
      );
    }

    if (path === '/api/images' && method === 'GET') {
      const difficulty = url.searchParams.get('difficulty');
      requireValue(
        !difficulty || ['easy', 'medium', 'hard'].includes(difficulty),
        'Dificuldade de imagem inválida.'
      );
      return json(res, images.list(difficulty || null));
    }
    if (path === '/api/rooms' && method === 'POST') {
      const body = await readBody(req);
      const room = rooms.createRoom(me, body);
      return json(
        res,
        {
          room: snapshot(room, me.id),
          invitation:
            room.mode === 'online' ? issueInvitation(store, room) : null,
        },
        201
      );
    }

    const invitationMatch = path.match(
      /^\/api\/invitations\/([\w-]+)(\/join)?$/
    );
    if (invitationMatch) {
      let { invitation, room } = findInvitation(store, invitationMatch[1]);
      normalizeRoom(room);
      requireValue(
        !invitation.used_by ||
          invitation.used_by === me.id ||
          room.ownerId === me.id,
        'Este convite já foi utilizado. Peça um novo link.',
        410
      );
      if (!invitationMatch[2] && method === 'GET') {
        return json(res, {
          owner: publicProfile(profileOf(room.ownerId)),
          gameName: getGameEngine(room.gameId).name,
          gameId: room.gameId,
          expires: invitation.expires,
          roomId: room.id,
          isOwner: room.ownerId === me.id,
        });
      }
      if (invitationMatch[2] && method === 'POST') {
        await readBody(req);
        me = profileOf(me.id);
        ({ invitation, room } = findInvitation(store, invitationMatch[1]));
        normalizeRoom(room);
        requireValue(
          !invitation.used_by || invitation.used_by === me.id,
          'Este convite já foi utilizado.',
          410
        );
        requireValue(
          me.name && enabledGameIds(me).includes(room.gameId),
          'Informe seu nome e habilite este jogo para entrar.'
        );
        requireValue(
          room.ownerId !== me.id,
          'Abra este convite no aparelho do familiar.'
        );
        requireValue(
          !room.targetId || room.targetId === me.id,
          'Este convite pertence a outro contato.',
          403
        );
        requireValue(
          !room.banned.includes(me.id),
          'O dono da mesa retirou você desta partida.',
          403
        );
        if (room.playerIds.includes(me.id) || room.pendingId === me.id)
          return json(res, snapshot(room, me.id));
        requireValue(
          room.status === 'WAITING' &&
            room.mode === 'online' &&
            !room.pendingId &&
            room.playerIds.length < room.capacity,
          'Esta mesa já tem um participante.',
          409
        );
        const owner = profileOf(room.ownerId);
        if (owner.contacts.includes(me.id)) {
          startRoom(room, me);
          rooms.favorites.befriend(owner.id, me.id);
        } else room.pendingId = me.id;
        store.db
          .prepare('UPDATE invitations SET used_by = ? WHERE token_hash = ?')
          .run(me.id, invitation.token_hash);
        save(room);
        return json(res, snapshot(room, me.id));
      }
    }

    const match = path.match(
      /^\/api\/rooms\/([\w-]+)(?:\/(events|approve|reject|invite|action|rematch|leave|close|fill|remove))?$/
    );
    if (match) {
      let room = roomFor(match[1], me.id);
      const operation = match[2];
      if (!operation && method === 'GET')
        return json(res, snapshot(rooms.resume(room.id, me), me.id));
      if (operation === 'events' && method === 'GET') {
        requireValue(
          (connections.get(me.id) || 0) < 5,
          'Feche outra aba desta mesa para continuar.',
          429
        );
        connections.set(me.id, (connections.get(me.id) || 0) + 1);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write('retry: 2500\n\n');
        room = rooms.resume(room.id, me);
        const client = { res, playerId: me.id };
        if (!streams.has(room.id)) streams.set(room.id, new Set());
        streams.get(room.id).add(client);
        rooms.touch(room.id, me.id);
        publish(room);
        const heartbeat = setInterval(() => {
          if (room.expires <= now()) return res.end();
          res.write(': keep-alive\n\n');
        }, 20000);
        res.on('close', () => {
          clearInterval(heartbeat);
          connections.set(
            me.id,
            Math.max(0, (connections.get(me.id) || 1) - 1)
          );
          streams.get(room.id)?.delete(client);
          if (!streams.get(room.id)?.size) streams.delete(room.id);
          // Ao desligar o servidor o banco já pode estar fechado.
          if (!store.db.isOpen) return;
          rooms.touch(room.id, me.id);
          const latest = normalizeRoom(store.getRoom(room.id));
          if (latest) publish(latest);
        });
        return;
      }
      if (method === 'POST') {
        const body = await readBody(req);
        me = profileOf(me.id);
        room = roomFor(match[1], me.id);
        requireValue(room.status !== 'CLOSED', 'Esta mesa foi encerrada.', 410);
        if (['approve', 'reject', 'invite'].includes(operation)) {
          requireValue(
            room.ownerId === me.id,
            'Somente quem convidou pode fazer isso.',
            403
          );
          requireValue(room.status === 'WAITING', 'A partida já começou.', 409);
          if (operation === 'invite') {
            requireValue(
              !room.pendingId,
              'Confirme ou recuse o participante antes de gerar outro convite.'
            );
            return json(res, issueInvitation(store, room));
          }
          requireValue(
            room.pendingId && room.pendingId === body.playerId,
            'Este pedido de entrada já mudou. Atualize a mesa.',
            409
          );
          if (operation === 'approve') {
            const guest = profileOf(room.pendingId);
            startRoom(room, guest);
            if (!me.contacts.includes(guest.id)) me.contacts.push(guest.id);
            store.saveProfile(me);
            rooms.favorites.befriend(me.id, guest.id);
          } else {
            room.pendingId = null;
            store.db
              .prepare('DELETE FROM invitations WHERE room_id = ?')
              .run(room.id);
          }
        } else if (operation === 'leave') {
          rooms.leave(room, me);
        } else if (operation === 'close') {
          rooms.close(room, me);
        } else if (operation === 'fill') {
          rooms.fill(room, me);
        } else if (operation === 'remove') {
          rooms.removePlayer(room, me, body.playerId);
        } else if (operation === 'action' || operation === 'rematch') {
          rooms.act(room, me, operation, body);
        } else throw new AppError('Operação não encontrada.', 404);
        save(room);
        return json(res, snapshot(room, me.id));
      }
    }
    throw new AppError('Caminho não encontrado.', 404);
  }

  const built = process.env.NODE_ENV === 'production';
  requireValue(
    !built || existsSync(join(root, 'dist/index.html')),
    'Execute npm run build antes de iniciar em produção.'
  );
  const assets = {
    '/app.mjs': ['src/frontend/app.mjs', 'text/javascript'],
    '/styles.css': ['src/frontend/styles.css', 'text/css'],
    '/components.mjs': ['src/frontend/components.mjs', 'text/javascript'],
    '/games.mjs': ['src/shared/games.mjs', 'text/javascript'],
    '/games-ui.mjs': ['src/frontend/games-ui.mjs', 'text/javascript'],
    '/turn-timer.mjs': ['src/frontend/turn-timer.mjs', 'text/javascript'],
    '/art.mjs': ['src/frontend/art.mjs', 'text/javascript'],
    '/motion.mjs': ['src/frontend/motion.mjs', 'text/javascript'],
    '/accessibility.mjs': ['src/accessibility/client.mjs', 'text/javascript'],
    '/family-panel.mjs': ['src/family-panel/client.mjs', 'text/javascript'],
    '/icon.svg': ['src/frontend/icon.svg', 'image/svg+xml'],
    '/garden.svg': ['src/frontend/garden.svg', 'image/svg+xml'],
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
    if (publicOrigin)
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (url.pathname === '/webhook/whatsapp' && whatsappChannel) {
        requireValue(req.method === 'POST', 'Método não permitido.', 405);
        requireValue(
          sameSecret(url.searchParams.get('secret'), whatsapp.webhookSecret),
          'Não autorizado.',
          401
        );
        const payload = await readBody(req, 2000000);
        const outcome = await whatsappChannel.handleWebhook(payload);
        return json(res, { ok: true, ...outcome });
      }
      // Galeria de artes para revisão visual: só fora de produção.
      if (url.pathname === '/arte' && !built && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(
          galleryPage({
            font: url.searchParams.get('font') ?? 'normal',
            contrast: url.searchParams.get('contrast') === '1',
          })
        );
      }
      // Link pessoal do WhatsApp: abre a sessão do perfil e leva à mesa.
      const handoff = /^\/m\/([\w-]+)$/.exec(url.pathname);
      if (handoff && ['GET', 'HEAD', 'POST'].includes(req.method)) {
        const page = (status, text) => {
          res.writeHead(status, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(
            req.method === 'HEAD'
              ? undefined
              : `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mesa em Família</title><body><main><h1>Mesa em Família</h1>${text}</main></body></html>`
          );
        };
        const expired =
          '<p>Este link não vale mais. Volte ao WhatsApp e digite <strong>jogo</strong> para receber um novo.</p>';
        // GET só mostra o botão: prévias de link do WhatsApp não gastam o acesso.
        if (req.method !== 'POST')
          return peekWebLink(store, handoff[1], now())
            ? page(
                200,
                `<p>Seu link pessoal está pronto.</p><form method="post" action="/m/${handoff[1]}"><button type="submit">Abrir minha partida</button></form>`
              )
            : page(404, expired);
        try {
          const { profileId, roomId } = redeemWebLink(store, handoff[1], now());
          const room = store.getRoom(roomId);
          if (!room || room.expires <= now() || room.status === 'CLOSED')
            return page(
              410,
              '<p>Esta mesa já terminou. Volte ao WhatsApp e digite <strong>menu</strong> para jogar de novo.</p>'
            );
          startSession(res, profileId);
          res.writeHead(303, {
            Location: `/mesa/${roomId}`,
            'Cache-Control': 'no-store',
          });
          return res.end();
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          return page(404, expired);
        }
      }

      if (url.pathname === '/healthz') {
        requireValue(
          ['GET', 'HEAD'].includes(req.method),
          'Método não permitido.',
          405
        );
        return json(res, ...(await healthReport()));
      }
      if (url.pathname === '/metrics') {
        requireValue(req.method === 'GET', 'Método não permitido.', 405);
        const bearer = /^Bearer (.+)$/.exec(
          req.headers.authorization ?? ''
        )?.[1];
        requireValue(
          sameSecret(req.headers['x-admin-token'] ?? bearer, adminSecret),
          'Não autorizado.',
          401
        );
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(metricsText());
      }
      if (url.pathname.startsWith('/admin/whatsapp/') && whatsappChannel) {
        requireValue(
          sameSecret(req.headers['x-admin-token'], whatsapp.adminToken),
          'Não autorizado.',
          401
        );
        if (url.pathname === '/admin/whatsapp/status' && req.method === 'GET')
          return json(res, await whatsappChannel.status());
        if (url.pathname === '/admin/whatsapp/start' && req.method === 'POST')
          return json(res, await whatsappChannel.start());
        throw new AppError('Caminho não encontrado.', 404);
      }
      requireValue(
        ['GET', 'HEAD'].includes(req.method),
        'Método não permitido.',
        405
      );
      const imageMatch = url.pathname.match(/^\/images\/([\w-]{1,64})$/);
      if (imageMatch) {
        const image = images.get(imageMatch[1]);
        requireValue(image, 'Imagem não encontrada.', 404);
        res.writeHead(200, {
          'Content-Type': image.contentType,
          'Content-Length': image.body.length,
          'Cache-Control': 'public, max-age=86400',
        });
        return res.end(req.method === 'HEAD' ? undefined : image.body);
      }
      let asset = assets[url.pathname];
      if (
        !asset &&
        (url.pathname === '/' || /^\/(entrar|mesa)\/[\w-]+$/.test(url.pathname))
      )
        asset = ['src/frontend/index.html', 'text/html'];
      requireValue(asset, 'Página não encontrada.', 404);
      const filepath = built
        ? join(
            root,
            'dist',
            url.pathname in assets ? url.pathname.slice(1) : 'index.html'
          )
        : join(root, asset[0]);
      const data = await readFile(filepath);
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (!(error instanceof AppError))
        console.error('Falha no servidor:', error.message);
      json(
        res,
        {
          error:
            error instanceof AppError
              ? error.message
              : 'Não foi possível concluir. Tente novamente.',
        },
        error.status || 500
      );
    }
  });
  try {
    const retired = rooms.consolidate();
    if (retired) console.log(`Mesas antigas encerradas: ${retired}`);
  } catch (error) {
    console.error('Falha ao limpar mesas antigas:', error.message);
  }
  const cleanup = setInterval(() => {
    store.cleanup(now());
    try {
      rooms.consolidate();
    } catch (error) {
      console.error('Falha ao limpar mesas antigas:', error.message);
    }
    for (const [key, value] of limits)
      if (now() - value.since > 60000) limits.delete(key);
  }, 60000);
  cleanup.unref();
  // Prazo das vezes e cancelamento por inatividade (1 s).
  const sweeper = setInterval(() => {
    try {
      rooms.sweep();
      whatsappChannel?.tick();
      maintenance.tick();
    } catch (error) {
      console.error('Falha na varredura de mesas:', error.message);
    }
  }, 1000);
  sweeper.unref();
  // Fonte externa de imagens (opcional): atualiza ao subir e a cada hora.
  const imageRefresh = setInterval(() => images.refresh(), 3600000);
  imageRefresh.unref();
  images.refresh();
  server.on('close', () => {
    clearInterval(cleanup);
    clearInterval(sweeper);
    clearInterval(imageRefresh);
    store.close();
  });
  const stop = () =>
    new Promise((resolveStop, reject) => {
      for (const clients of streams.values())
        for (const client of clients) client.res.end();
      server.close((error) => (error ? reject(error) : resolveStop()));
      server.closeIdleConnections();
    });
  return {
    server,
    store,
    stop,
    rooms,
    images,
    maintenance,
    whatsapp: whatsappChannel,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_ORIGIN)
    throw new Error(
      'Configure PUBLIC_ORIGIN com a origem HTTPS antes de publicar.'
    );
  const app = createApplication({
    botDelayMs: Number(process.env.BOT_DELAY_MS ?? 2000),
  });
  const port = Number(process.env.PORT || 3000);
  // Segunda instância (porta ocupada): sai na hora. Duas instâncias no mesmo
  // banco enviariam cada mensagem do WhatsApp duas vezes.
  app.server.on('error', (error) => {
    console.error(`Não foi possível abrir a porta ${port}: ${error.message}`);
    process.exit(1);
  });
  app.server.listen(port, process.env.HOST || '0.0.0.0', () =>
    console.log(`Mesa em Família: http://localhost:${port}`)
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => app.stop().then(() => process.exit(0)));
}
