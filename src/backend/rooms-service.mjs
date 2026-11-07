import { randomUUID, randomInt } from 'node:crypto';
import { AppError, requireValue } from '../shared/errors.mjs';
import { getGameEngine } from '../games/core/registry.mjs';
import { enabledGameIds } from '../shared/games.mjs';
import { chooseBotAction } from '../games/core/bots.mjs';
import { publicProfile } from '../family-panel/profile.mjs';
import { findWhatsappInvitation } from '../invitations/service.mjs';
import { createFavorites } from './favorites.mjs';
import {
  LEVELS as IMAGE_LEVELS,
  LEVEL_SIZE,
  createImageService,
} from '../games/puzzle/images.mjs';

const DAY = 86400000;
const TURN_OPTIONS = [0, 30, 60, 90];
const DEFAULT_TURN_SECONDS = 60;
const INACTIVE_AFTER = 5 * 60000;
// Mesa esperando amigos: depois deste prazo, bots ocupam os lugares vazios.
const FILL_AFTER = 3 * 60000;

/**
 * Casos de uso de mesa independentes de HTTP e de cookie. O servidor web e o
 * canal WhatsApp chamam as mesmas funções, com o perfil já identificado.
 */
export function createRoomsService({
  store,
  now = () => Date.now(),
  isOnline = () => false,
  images = createImageService(),
  fillAfterMs = FILL_AFTER,
  // Pausa antes de cada jogada de bot (0 = instantâneo, usado nos testes).
  botDelayMs = 0,
}) {
  const listeners = new Set();
  const favorites = createFavorites(store, now);
  const profileOf = (id) => store.getProfile(id);
  const startedAt = now();
  // Presença em memória; room.seen guarda a última marca persistida.
  const seenAt = new Map();
  // Índice dos prazos ativos (sala -> prazo), reconstruído do banco na partida.
  const deadlines = new Map();
  let indexReady = false;

  function normalizeRoom(room) {
    if (!room) return room;
    room.playerIds ??= [room.ownerId, room.guestId].filter(Boolean);
    room.capacity ??= 2;
    room.createdAt ??= (room.expires ?? now() + DAY) - DAY;
    room.mode ??= room.solo ? 'solo' : 'online';
    room.botIds ??= [];
    room.botSeats ??= room.botIds.length;
    room.humanSeats ??= room.capacity - room.botSeats;
    room.turnSeconds ??= DEFAULT_TURN_SECONDS;
    room.seen ??= {};
    room.autoPlays ??= {};
    room.banned ??= [];
    // Lugares: cada jogador ocupa um (present | away | removed). Mesas antigas
    // não têm a lista e todos contam como presentes.
    room.seats ??= [];
    for (const id of room.playerIds)
      if (!room.seats.some((seat) => seat.playerId === id))
        room.seats.push({ playerId: id, state: 'present', moves: 0 });
    return room;
  }

  const seatOf = (room, id) => room.seats?.find((seat) => seat.playerId === id);
  const stateOf = (room, id) => seatOf(room, id)?.state ?? 'present';
  // Jogam por bot: bots da mesa e lugares de quem saiu ou foi retirado.
  const botSeat = (room, id) =>
    room.botIds.includes(id) || stateOf(room, id) !== 'present';
  const presentHumans = (room) =>
    room.playerIds.filter((id) => !botSeat(room, id));
  const nameOf = (id) => profileOf(id)?.name || 'Jogador';

  // Quem deve jogar agora, ou null quando o jogo não tem vez (cooperativo, individual).
  function activePlayer(room) {
    const game = room.game;
    if (!game || game.status !== 'PLAYING' || room.status !== 'PLAYING')
      return null;
    return (
      game.decisionPlayerId ||
      game.pendingRaise?.responderId ||
      game.currentPlayerId ||
      null
    );
  }

  // Mantém room.turn coerente com o estado: novo prazo quando a vez muda.
  function refreshTurn(room) {
    const id = activePlayer(room);
    if (!id || !room.turnSeconds || botSeat(room, id)) {
      room.turn = null;
    } else if (!room.turn || room.turn.playerId !== id) {
      room.turn = {
        playerId: id,
        seconds: room.turnSeconds,
        deadline: now() + room.turnSeconds * 1000,
      };
    }
    if (room.turn) deadlines.set(room.id, room.turn.deadline);
    else deadlines.delete(room.id);
  }

  const markSeen = (room, playerId) => {
    seenAt.set(`${room.id}:${playerId}`, now());
  };

  function lastSeen(room, playerId) {
    return Math.max(
      startedAt,
      room.seen?.[playerId] ?? 0,
      seenAt.get(`${room.id}:${playerId}`) ?? 0
    );
  }

  function isPresent(room, playerId) {
    const state = stateOf(room, playerId);
    if (state === 'removed') return false;
    if (state === 'present' && isOnline(room.id, playerId) === true)
      return true;
    return now() - lastSeen(room, playerId) < INACTIVE_AFTER;
  }

  // Joga pela pessoa quando o prazo termina, com a estratégia fácil.
  function autoPlay(room) {
    const id = room.turn?.playerId;
    if (!id) return false;
    const engine = getGameEngine(room.gameId);
    const action = chooseBotAction(room.gameId, room.game, id, 'easy');
    if (!action) {
      room.turn = null;
      return false;
    }
    room.game = engine.processAction(room.game, id, action);
    // Na Cacheta a vez tem duas etapas: completa comprar e descartar.
    for (let extra = 0; extra < 2; extra++) {
      if (room.game.status !== 'PLAYING' || activePlayer(room) !== id) break;
      const next = chooseBotAction(room.gameId, room.game, id, 'easy');
      if (!next) break;
      room.game = engine.processAction(room.game, id, next);
    }
    room.game.history?.push?.({ playerId: id, type: 'auto' });
    room.autoPlays[id] = (room.autoPlays[id] ?? 0) + 1;
    room.notice = {
      type: 'auto',
      playerId: id,
      name: nameOf(id),
      text: `Tempo esgotado: jogada automática de ${nameOf(id)}.`,
      at: now(),
    };
    // Duas jogadas automáticas seguidas: a pessoa saiu da mesa e um bot assume.
    if (room.autoPlays[id] >= 2 && seatOf(room, id)) {
      seatOf(room, id).state = 'away';
      room.notice.text += ` ${nameOf(id)} está ausente: um bot assume o lugar.`;
    }
    room.turn = null;
    advanceBots(room);
    room.status = room.game.status;
    return true;
  }

  function expired(room) {
    return Boolean(room.turn && now() >= room.turn.deadline);
  }

  function cancelInactive(room) {
    room.status = 'CLOSED';
    room.closedReason = 'inactive';
    room.turn = null;
    store.db.prepare('DELETE FROM invitations WHERE room_id = ?').run(room.id);
  }

  function reindex() {
    deadlines.clear();
    for (const row of store.db
      .prepare(
        "SELECT data FROM rooms WHERE expires > ? AND json_extract(data, '$.status') = 'PLAYING'"
      )
      .all(now())) {
      const room = JSON.parse(row.data);
      if (room.turn?.deadline) deadlines.set(room.id, room.turn.deadline);
    }
    indexReady = true;
  }

  /**
   * Varredura de 1 s: joga pelos prazos vencidos e cancela partidas sem humanos.
   */
  function sweep() {
    if (!indexReady) reindex();
    const changed = [];
    const playing = store.db
      .prepare(
        "SELECT id FROM rooms WHERE expires > ? AND json_extract(data, '$.status') = 'PLAYING'"
      )
      .all(now())
      .map((row) => row.id);
    for (const id of playing) {
      const room = normalizeRoom(store.getRoom(id));
      if (!room || room.status !== 'PLAYING') {
        deadlines.delete(id);
        continue;
      }
      const humans = room.playerIds.filter((p) => !room.botIds.includes(p));
      // Só bots jogando (todas as pessoas saíram ou foram retiradas): encerra já.
      if (!presentHumans(room).length) cancelInactive(room);
      else if (!humans.some((p) => isPresent(room, p))) cancelInactive(room);
      else if (expired(room)) {
        try {
          autoPlay(room);
        } catch (error) {
          room.turn = null;
          console.error('Falha na jogada automática:', error.message);
        }
      } else if (room.botAt && now() >= room.botAt) {
        try {
          playDueBot(room);
        } catch (error) {
          room.botAt = null;
          console.error('Falha na jogada do bot:', error.message);
        }
      } else continue;
      save(room);
      changed.push(room);
    }
    // Mesas que esperam amigos além do prazo recebem bots nos lugares vazios.
    const waiting = store.db
      .prepare(
        "SELECT id FROM rooms WHERE expires > ? AND json_extract(data, '$.status') = 'WAITING'"
      )
      .all(now())
      .map((row) => row.id);
    for (const id of waiting) {
      const room = normalizeRoom(store.getRoom(id));
      if (!room || !canFill(room) || now() - room.createdAt < fillAfterMs)
        continue;
      fillWithBots(room, 'wait');
      save(room);
      changed.push(room);
    }
    return changed;
  }

  const botActor = (room) => {
    const id =
      room.game.decisionPlayerId ||
      room.game.pendingRaise?.responderId ||
      room.game.currentPlayerId;
    return id && botSeat(room, id) ? id : null;
  };

  // Uma jogada de bot; devolve false quando não há o que jogar.
  function playBot(room, engine) {
    const id = botActor(room);
    if (!id) return false;
    const action = chooseBotAction(
      room.gameId,
      room.game,
      id,
      room.difficulty ?? 'medium'
    );
    if (!action) return false;
    room.game = engine.processAction(room.game, id, action);
    const seat = seatOf(room, id);
    if (seat && !room.botIds.includes(id)) seat.moves = (seat.moves ?? 0) + 1;
    return true;
  }

  // Com pausa, os bots jogam um de cada vez (a varredura chama playDueBot);
  // sem pausa, todos jogam de uma vez.
  function advanceBots(room) {
    if (!room.game || room.game.status !== 'PLAYING') return;
    // Sem nenhuma pessoa na mesa o jogo espera (e a inatividade cancela).
    if (!presentHumans(room).length) return;
    const engine = getGameEngine(room.gameId);
    if (botDelayMs > 0) {
      room.botAt = botActor(room) ? (room.botAt ?? now() + botDelayMs) : null;
      room.status = room.game.status;
      return;
    }
    for (let count = 0; count < 128 && room.game.status === 'PLAYING'; count++)
      if (!playBot(room, engine)) break;
    room.status = room.game.status;
  }

  // Joga a vez de um bot cuja pausa terminou e agenda o próximo.
  function playDueBot(room) {
    room.botAt = null;
    if (!room.game || room.game.status !== 'PLAYING') return;
    playBot(room, getGameEngine(room.gameId));
    advanceBots(room);
  }

  function roomFor(id, playerId) {
    const room = normalizeRoom(store.getRoom(id));
    requireValue(
      room && room.expires > now(),
      'Esta mesa expirou. Crie uma nova partida.',
      404
    );
    requireValue(
      room.playerIds.includes(playerId) || room.pendingId === playerId,
      'Você não tem acesso a esta mesa.',
      403
    );
    requireValue(
      stateOf(room, playerId) !== 'removed',
      'O dono da mesa retirou você desta partida.',
      403
    );
    return room;
  }

  function snapshot(room, playerId) {
    normalizeRoom(room);
    const approved = room.playerIds.includes(playerId);
    return {
      id: room.id,
      ownerId: room.ownerId,
      guestId: room.guestId,
      revision: room.revision,
      status: room.status,
      expires: room.expires,
      gameId: room.gameId,
      solo: room.solo === true,
      mode: room.mode,
      difficulty: room.difficulty,
      capacity: room.capacity,
      humanSeats: room.humanSeats,
      botSeats: room.botSeats,
      closedReason: room.closedReason ?? null,
      turn: room.turn ?? null,
      turnSeconds: room.turnSeconds,
      notice: room.notice ?? null,
      serverNow: now(),
      players: room.playerIds.map((id) => ({
        ...publicProfile(profileOf(id)),
        seat: stateOf(room, id),
      })),
      owner: publicProfile(profileOf(room.ownerId)),
      guest: room.guestId ? publicProfile(profileOf(room.guestId)) : null,
      pending:
        room.ownerId === playerId && room.pendingId
          ? publicProfile(profileOf(room.pendingId))
          : null,
      approved,
      game:
        approved && room.game
          ? getGameEngine(room.gameId).publicGame(room.game, playerId)
          : null,
      online: Object.fromEntries(
        room.playerIds
          .filter(Boolean)
          .map((id) => [
            id,
            room.botIds.includes(id) || isOnline(room.id, id) === true,
          ])
      ),
    };
  }

  function save(room) {
    normalizeRoom(room);
    refreshTurn(room);
    room.revision++;
    store.saveRoom(room);
    favorites.recordResult(room);
    for (const listener of listeners) {
      try {
        listener(room);
      } catch (error) {
        console.error('Falha ao notificar mudança de mesa:', error.message);
      }
    }
  }

  function startRoom(room, guest) {
    const owner = profileOf(room.ownerId);
    requireValue(
      enabledGameIds(owner).includes(room.gameId) &&
        enabledGameIds(guest).includes(room.gameId),
      'Este jogo foi desativado no painel do familiar.'
    );
    requireValue(
      room.playerIds.length < room.capacity,
      'Esta mesa já está completa.',
      409
    );
    room.playerIds.push(guest.id);
    room.guestId ||= guest.id;
    room.pendingId = null;
    if (room.playerIds.length === room.capacity) beginGame(room);
  }

  function beginGame(room) {
    // Pessoas nos primeiros lugares e bots nos últimos: cada equipe do Truco
    // recebe quase o mesmo número de pessoas e os bots completam a menor.
    room.playerIds = [
      ...room.playerIds.filter((id) => !room.botIds.includes(id)),
      ...room.playerIds.filter((id) => room.botIds.includes(id)),
    ];
    room.status = 'PLAYING';
    room.game = getGameEngine(room.gameId).createGame(
      room.playerIds,
      {},
      room.gameOptions
    );
  }

  // Só jogos de vários jogadores aceitam bots de preenchimento; os individuais
  // (palavras cruzadas, quebra-cabeça e caça-palavras) nunca têm bots.
  function canFill(room) {
    return (
      room.status === 'WAITING' &&
      room.mode === 'online' &&
      !getGameEngine(room.gameId).solo &&
      room.playerIds.length < room.capacity &&
      room.playerIds.some((id) => !room.botIds.includes(id))
    );
  }

  function fillWithBots(room, reason) {
    const difficulty = room.fillDifficulty ?? 'medium';
    room.difficulty ??= difficulty;
    let number = room.botIds.length;
    while (room.playerIds.length < room.capacity) {
      number += 1;
      const bot = {
        id: randomUUID(),
        name: `Bot ${number}`,
        photo: '',
        bot: true,
      };
      store.saveProfile(bot);
      room.botIds.push(bot.id);
      room.playerIds.push(bot.id);
    }
    room.botSeats = room.botIds.length;
    room.humanSeats = room.capacity - room.botSeats;
    room.pendingId = null;
    store.db.prepare('DELETE FROM invitations WHERE room_id = ?').run(room.id);
    normalizeRoom(room);
    beginGame(room);
    room.notice = {
      type: 'fill',
      text:
        reason === 'owner'
          ? 'O dono começou a partida: bots ocuparam os lugares vazios.'
          : 'Faltaram jogadores: bots ocuparam os lugares vazios e a partida começou.',
      at: now(),
    };
    advanceBots(room);
    refreshTurn(room);
  }

  function fill(room, me) {
    requireValue(
      room.ownerId === me.id,
      'Somente o dono da mesa pode começar com bots.',
      403
    );
    requireValue(
      canFill(room),
      'Esta mesa não aceita bots ou já está completa.',
      409
    );
    fillWithBots(room, 'owner');
  }

  function createRoom(profile, body) {
    const me = profileOf(profile.id);
    requireValue(
      me.name && enabledGameIds(me).includes(body.gameId),
      'Configure o seu nome e habilite este jogo no painel do familiar.'
    );
    const engine = getGameEngine(body.gameId);
    let mode = body.mode ?? (body.solo ? 'solo' : 'online');
    requireValue(
      ['online', 'solo', 'bot'].includes(mode),
      'Modo de jogo inválido.'
    );
    requireValue(
      mode !== 'solo' || engine.solo,
      'Este jogo precisa de adversário.'
    );
    requireValue(
      mode !== 'bot' || !engine.solo,
      'Este jogo é para jogar sozinho ou em grupo, sem bots.'
    );
    // Jogos com mesa de tamanho variável declaram `capacities` no catálogo.
    const sizes = engine.capacities;
    const capacity = sizes
      ? (body.capacity ?? sizes[0])
      : mode === 'solo'
        ? 1
        : 2;
    requireValue(
      !sizes || sizes.includes(capacity),
      sizes?.length === 1
        ? `${engine.shortName} tem mesa de ${sizes[0]} lugares.`
        : `Escolha ${sizes?.slice(0, -1).join(', ')} ou ${sizes?.at(-1)} lugares para ${engine.shortName === 'Cacheta' ? 'a' : 'o'} ${engine.shortName}.`
    );
    requireValue(
      body.capacity === undefined || sizes || body.capacity === capacity,
      'Quantidade de jogadores inválida.'
    );
    // Lugares de bots: "contra o bot" ocupa todos menos o seu; mesas com
    // amigos podem reservar alguns (Truco), sempre com ao menos uma pessoa.
    let botSeats = mode === 'bot' ? capacity - 1 : (body.botSeats ?? 0);
    if (mode !== 'bot' && body.humanSeats !== undefined)
      botSeats = capacity - body.humanSeats;
    requireValue(
      Number.isInteger(botSeats) && botSeats >= 0,
      'Quantidade de bots inválida.'
    );
    requireValue(
      botSeats < capacity,
      'É preciso pelo menos uma pessoa na mesa.'
    );
    requireValue(
      mode !== 'solo' || botSeats === 0,
      'Partidas individuais não têm bots.'
    );
    // Todos os outros lugares são bots: é o mesmo que jogar contra o bot.
    if (mode === 'online' && capacity > 1 && botSeats === capacity - 1)
      mode = 'bot';
    // Todos os bots têm o mesmo nível (médio); a dificuldade não é escolhida.
    const difficulty = 'medium';
    requireValue(
      body.solo === undefined || typeof body.solo === 'boolean',
      'Modo de jogo inválido.'
    );
    requireValue(
      !body.solo || engine.solo,
      'Este jogo precisa de duas pessoas.'
    );
    requireValue(
      !body.solo || !body.targetId,
      'Partidas individuais não recebem convidados.'
    );
    requireValue(
      !body.targetId || (mode === 'online' && capacity === 2),
      'Convites direcionados são para mesas online de duas pessoas.'
    );
    requireValue(
      body.usePhoto === undefined || typeof body.usePhoto === 'boolean',
      'Escolha de imagem inválida.'
    );
    requireValue(
      !body.targetId || me.contacts.includes(body.targetId),
      'Escolha um contato autorizado.'
    );
    requireValue(
      body.turnSeconds === undefined || TURN_OPTIONS.includes(body.turnSeconds),
      'Escolha o tempo da vez: desligado, 30, 60 ou 90 segundos.'
    );
    const count = store.db
      .prepare(
        "SELECT count(*) AS n FROM rooms WHERE expires > ? AND json_extract(data, '$.ownerId') = ? AND json_extract(data, '$.status') != 'CLOSED'"
      )
      .get(now(), me.id).n;
    requireValue(
      count < 10,
      'Você já tem dez mesas abertas. Encerre uma para criar outra.'
    );
    // Quebra-cabeça: o nível define a grade e a imagem (escolhida, sorteada ou a foto).
    let puzzleOptions = {};
    if (body.gameId === 'puzzle') {
      const level = body.level ?? 'easy';
      requireValue(
        IMAGE_LEVELS.includes(level),
        'Escolha a dificuldade do quebra-cabeça: fácil, média ou difícil.'
      );
      const photo = body.usePhoto && me.photo ? me.photo : null;
      const chosen = photo ? null : images.choose(level, body.imageId);
      requireValue(photo || chosen, 'Imagem inválida para esta dificuldade.');
      puzzleOptions = {
        image: photo ?? chosen.url,
        size: LEVEL_SIZE[level],
        level,
        imageId: chosen?.id ?? null,
      };
    }
    // Caça-palavras: a dificuldade define a grade e a quantidade de palavras.
    let wordsearchOptions = {};
    if (body.gameId === 'wordsearch') {
      const level = body.level ?? 'easy';
      requireValue(
        IMAGE_LEVELS.includes(level),
        'Escolha a dificuldade do caça-palavras: fácil, média ou difícil.'
      );
      wordsearchOptions = { level };
    }
    const room = {
      id: randomUUID(),
      ownerId: me.id,
      guestId: null,
      pendingId: null,
      targetId: body.targetId || null,
      gameId: body.gameId,
      game: null,
      status: 'WAITING',
      revision: 0,
      expires: now() + DAY,
      solo: mode === 'solo',
      mode,
      capacity,
      playerIds: [me.id],
      botIds: [],
      botSeats,
      humanSeats: capacity - botSeats,
      turnSeconds: body.turnSeconds ?? DEFAULT_TURN_SECONDS,
      seen: { [me.id]: now() },
      difficulty: botSeats > 0 ? difficulty : null,
      fillDifficulty: difficulty,
      gameOptions: {
        competitive: mode === 'bot',
        ...puzzleOptions,
        ...wordsearchOptions,
      },
    };
    if (botSeats > 0) {
      for (let i = 1; i <= botSeats; i++) {
        const bot = {
          id: randomUUID(),
          name: `Bot ${i}`,
          photo: '',
          bot: true,
        };
        store.saveProfile(bot);
        room.botIds.push(bot.id);
        room.playerIds.push(bot.id);
      }
      if (mode === 'bot') room.guestId = room.botIds[0];
    }
    normalizeRoom(room);
    if (mode !== 'online') {
      room.status = 'PLAYING';
      room.game = engine.createGame(room.playerIds, {}, room.gameOptions);
      advanceBots(room);
    }
    refreshTurn(room);
    store.saveRoom(room);
    return room;
  }

  // Sobe o nível da próxima rodada (nunca desce) e guarda para quando a revanche começar.
  function harder(room, level) {
    requireValue(
      ['wordsearch', 'puzzle'].includes(room.gameId) &&
        IMAGE_LEVELS.includes(level),
      'Este jogo não tem níveis de dificuldade.'
    );
    const current = room.gameOptions.level ?? 'easy';
    requireValue(
      IMAGE_LEVELS.indexOf(level) > IMAGE_LEVELS.indexOf(current),
      'Escolha uma dificuldade maior que a atual.'
    );
    room.gameOptions = { ...room.gameOptions, level };
    if (room.gameId === 'puzzle') {
      const chosen = room.gameOptions.imageId ? images.choose(level) : null;
      room.gameOptions.size = LEVEL_SIZE[level];
      if (chosen) {
        room.gameOptions.image = chosen.url;
        room.gameOptions.imageId = chosen.id;
      }
    }
    room.nextLevel = level;
  }

  function act(room, me, operation, body) {
    requireValue(
      room.playerIds.includes(me.id) && room.game,
      'Aguarde o familiar confirmar a sua entrada.',
      403
    );
    requireValue(
      Number.isInteger(body.revision) && body.revision === room.revision,
      'A mesa foi atualizada. Confira as peças e tente novamente.',
      409
    );
    if (operation === 'action' && expired(room)) {
      autoPlay(room);
      save(room);
      throw new AppError(
        'O tempo da sua vez acabou. A jogada foi automática.',
        409
      );
    }
    const engine = getGameEngine(room.gameId);
    requireValue(
      stateOf(room, me.id) !== 'removed',
      'O dono da mesa retirou você desta partida.',
      403
    );
    returnToSeat(room, me.id);
    room.seen[me.id] = now();
    if (operation === 'action') {
      room.game = engine.processAction(room.game, me.id, body);
      room.autoPlays[me.id] = 0;
      room.notice = null;
      room.turn = null;
    } else {
      // "Aumentar dificuldade": só caça-palavras e quebra-cabeça têm níveis.
      if (body.level) harder(room, body.level);
      room.game = engine.requestRematch(room.game, me.id);
      room.turn = null;
      for (const id of room.playerIds)
        if (
          id !== me.id &&
          botSeat(room, id) &&
          room.game.status === 'FINISHED'
        )
          room.game = engine.requestRematch(room.game, id);
      // Revanche iniciada: nova rodada, com resultado próprio no ranking.
      if (room.game.status !== 'FINISHED') {
        room.round = (room.round ?? 1) + 1;
        if (room.nextLevel) {
          room.game = engine.createGame(
            room.playerIds,
            room.game.score,
            room.gameOptions
          );
          room.nextLevel = null;
        }
      }
    }
    advanceBots(room);
    room.status = room.game.status;
  }

  function closeRoom(room, reason) {
    room.status = 'CLOSED';
    room.closedReason = reason;
    room.turn = null;
    store.db.prepare('DELETE FROM invitations WHERE room_id = ?').run(room.id);
  }

  // A posse passa, por sorteio, a outro humano presente quando o dono sai.
  function transferOwner(room, leavingId) {
    const candidates = presentHumans(room).filter((id) => id !== leavingId);
    if (!candidates.length) return;
    room.ownerId = candidates[randomInt(candidates.length)];
    room.notice = {
      type: 'owner',
      playerId: room.ownerId,
      text: `${nameOf(room.ownerId)} agora é o dono da mesa.`,
      at: now(),
    };
  }

  function dropFromWaiting(room, id) {
    room.playerIds = room.playerIds.filter((other) => other !== id);
    room.seats = room.seats.filter((seat) => seat.playerId !== id);
    room.guestId =
      room.playerIds.find((other) => other !== room.ownerId) ?? null;
    if (room.ownerId === id) transferOwner(room, id);
  }

  // Sair não encerra a mesa: em jogo um bot assume o lugar, esperando amigos a
  // vaga é liberada. Só o dono encerra para todos (`close`).
  function leave(room, me) {
    if (room.pendingId === me.id) {
      room.pendingId = null;
      store.db
        .prepare('DELETE FROM invitations WHERE room_id = ?')
        .run(room.id);
      return;
    }
    if (room.status === 'FINISHED') return closeRoom(room, 'left');
    if (room.status === 'WAITING') {
      if (!room.playerIds.some((id) => id !== me.id && !botSeat(room, id)))
        return closeRoom(room, 'left');
      return dropFromWaiting(room, me.id);
    }
    const seat = seatOf(room, me.id);
    seat.state = 'away';
    room.seen[me.id] = now();
    room.turn = null;
    if (room.ownerId === me.id) transferOwner(room, me.id);
    if (!room.notice || room.notice.type !== 'owner')
      room.notice = {
        type: 'left',
        playerId: me.id,
        text: `${nameOf(me.id)} saiu: um bot assume o lugar.`,
        at: now(),
      };
    advanceBots(room);
    room.status = room.game?.status ?? room.status;
  }

  function close(room, me) {
    requireValue(
      room.ownerId === me.id,
      'Somente o dono da mesa pode encerrá-la. Você pode sair e um bot assume o seu lugar.',
      403
    );
    closeRoom(room, 'owner');
  }

  function removePlayer(room, me, targetId) {
    requireValue(
      room.ownerId === me.id,
      'Somente o dono da mesa pode retirar alguém.',
      403
    );
    requireValue(
      targetId !== me.id,
      'Você não pode retirar a si mesmo. Use “Sair da mesa”.'
    );
    requireValue(
      typeof targetId === 'string' &&
        room.playerIds.includes(targetId) &&
        !room.botIds.includes(targetId),
      'Essa pessoa não está na mesa.',
      404
    );
    room.banned.push(targetId);
    const name = nameOf(targetId);
    if (room.status === 'WAITING') dropFromWaiting(room, targetId);
    else {
      seatOf(room, targetId).state = 'removed';
      room.turn = null;
      advanceBots(room);
      room.status = room.game?.status ?? room.status;
    }
    room.notice = {
      type: 'removed',
      playerId: targetId,
      text: `${name} foi retirado(a) da mesa pelo dono.`,
      at: now(),
    };
  }

  // Quem volta retoma o lugar de onde o bot parou; o bot deixa de jogar por ele.
  function returnToSeat(room, playerId) {
    const seat = seatOf(room, playerId);
    if (!seat || seat.state !== 'away') return false;
    const moves = seat.moves ?? 0;
    seat.state = 'present';
    seat.moves = 0;
    room.autoPlays[playerId] = 0;
    room.seen[playerId] = now();
    room.notice = {
      type: 'returned',
      playerId,
      text: `${nameOf(playerId)} voltou à mesa${moves ? `; o bot jogou ${moves} vez(es) no lugar dele(a)` : ''}.`,
      at: now(),
    };
    return true;
  }

  function resume(roomId, profile) {
    const room = roomFor(roomId, profile.id);
    if (room.status === 'CLOSED' || !returnToSeat(room, profile.id))
      return room;
    save(room);
    return room;
  }

  function perform(profile, roomId, operation, body = {}) {
    const me = profileOf(profile.id);
    const room = roomFor(roomId, me.id);
    requireValue(room.status !== 'CLOSED', 'Esta mesa foi encerrada.', 410);
    if (operation === 'leave') leave(room, me);
    else if (operation === 'close') close(room, me);
    else if (operation === 'fill') fill(room, me);
    else if (operation === 'remove') removePlayer(room, me, body.playerId);
    else if (operation === 'action' || operation === 'rematch')
      act(room, me, operation, body);
    else throw new AppError('Operação não encontrada.', 404);
    save(room);
    return room;
  }

  function joinByCode(profile, code) {
    const { room } = findWhatsappInvitation(store, code, now());
    return joinRoom(profile, normalizeRoom(room));
  }

  /** Remove o favorito e encerra mesas do dono que dependiam dele. */
  function removeFavorite(profile, friendId) {
    const me = profileOf(profile.id);
    me.contacts = me.contacts.filter((id) => id !== friendId);
    store.saveProfile(me);
    favorites.remove(me.id, friendId);
    for (const row of store.db
      .prepare('SELECT data FROM rooms WHERE expires > ?')
      .all(now())) {
      const room = normalizeRoom(JSON.parse(row.data));
      if (
        room.ownerId === me.id &&
        room.status !== 'CLOSED' &&
        [...room.playerIds, room.pendingId, room.targetId].includes(friendId)
      ) {
        room.status = 'CLOSED';
        store.db
          .prepare('DELETE FROM invitations WHERE room_id = ?')
          .run(room.id);
        save(room);
      }
    }
  }

  function joinRoom(profile, room) {
    const me = profileOf(profile.id);
    requireValue(
      me.name && enabledGameIds(me).includes(room.gameId),
      'Informe seu nome e habilite este jogo para entrar.'
    );
    requireValue(
      !room.banned.includes(me.id),
      'O dono da mesa retirou você desta partida.',
      403
    );
    if (room.playerIds.includes(me.id)) return { room, already: true };
    requireValue(
      !room.targetId || room.targetId === me.id,
      'Este convite pertence a outro contato.',
      403
    );
    requireValue(
      room.status === 'WAITING' &&
        room.mode === 'online' &&
        !room.pendingId &&
        room.playerIds.length < room.capacity,
      'Esta mesa já está completa.',
      409
    );
    const owner = profileOf(room.ownerId);
    startRoom(room, me);
    if (!owner.contacts.includes(me.id)) {
      owner.contacts.push(me.id);
      store.saveProfile(owner);
    }
    // Entrar pelo link vale como aceite nos dois sentidos.
    favorites.befriend(owner.id, me.id);
    favorites.answerCalls(me.id, room.id, 'joined');
    save(room);
    return { room, already: false };
  }

  function listActive(profileId) {
    return store.db
      .prepare(
        `SELECT data FROM rooms WHERE expires > ? AND
        EXISTS (SELECT 1 FROM json_each(data, '$.playerIds') WHERE value = ?)
        AND json_extract(data, '$.status') != 'CLOSED' ORDER BY expires DESC LIMIT 10`
      )
      .all(now(), profileId)
      .map((row) => normalizeRoom(JSON.parse(row.data)))
      .filter((room) => stateOf(room, profileId) !== 'removed');
  }

  return {
    images,
    favorites,
    removeFavorite,
    joinRoom,
    normalizeRoom,
    advanceBots,
    roomFor,
    snapshot,
    save,
    startRoom,
    createRoom,
    act,
    leave,
    fill,
    close,
    removePlayer,
    resume,
    stateOf,
    perform,
    joinByCode,
    listActive,
    sweep,
    touch(roomId, playerId) {
      seenAt.set(`${roomId}:${playerId}`, now());
    },
    touchProfile(profileId) {
      for (const room of listActive(profileId)) markSeen(room, profileId);
    },
    onRoomChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
