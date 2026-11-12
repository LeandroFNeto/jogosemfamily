import { AppError, requireValue } from '../shared/errors.mjs';
import { gameCatalog, enabledGameIds } from '../shared/games.mjs';
import { issueWhatsappInvitation } from '../invitations/service.mjs';
import { hasWebLink, issueWebLink } from '../invitations/web-links.mjs';
import { embeddedImageIds } from './menu-art.mjs';

import { DECLINE_WAIT, MAX_RECIPIENTS } from '../backend/favorites.mjs';

const DAY_MS = 86400000;
const CANCELLED = 'A partida foi cancelada: faltaram jogadores.';

const plain = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const LEVELS = [
  { id: 'easy', label: 'Fácil (9 peças, 3×3)' },
  { id: 'medium', label: 'Média (16 peças, 4×4)' },
  { id: 'hard', label: 'Difícil (25 peças, 5×5)' },
];
const WORDSEARCH_LEVELS = [
  { id: 'easy', label: 'Fácil (8×8, 6 palavras)' },
  { id: 'medium', label: 'Média (12×12, 10 palavras)' },
  { id: 'hard', label: 'Difícil (15×15, 14 palavras)' },
];
// Mesas de tamanho variável: lugares oferecidos por jogo (vêm do catálogo).
const seatLabel = (gameId, capacity) =>
  gameId === 'cards'
    ? `${capacity} lugares (${capacity / 2} contra ${capacity / 2})`
    : `${capacity} jogadores`;
const seatOptions = (gameId) =>
  gameCatalog
    .find((game) => game.id === gameId)
    .capacities.map((capacity) => ({
      capacity,
      label: seatLabel(gameId, capacity),
    }));

// Nomes aceitos no menu (já sem acento, hífen e maiúsculas).
const GAME_NAMES = {
  domino: 'domino',
  truco: 'cards',
  'truco paulista': 'cards',
  'palavras cruzadas': 'crossword',
  cruzadas: 'crossword',
  'quebra cabeca': 'puzzle',
  quebracabeca: 'puzzle',
  cacheta: 'cacheta',
  'caca palavras': 'wordsearch',
  cacapalavras: 'wordsearch',
};

const numbered = (items) =>
  items.map((item, index) => `*${index + 1}* — ${item}`).join('\n');

export function cleanName(value) {
  const name = String(value ?? '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  requireValue(
    name.length >= 2 &&
      name.length <= 40 &&
      !/[\u0000-\u001f\u007f]/.test(name),
    'Escreva um nome com 2 a 40 letras.'
  );
  return name;
}

/**
 * Máquina de conversa do bot. Cada telefone tem um perfil e um estado salvo no
 * SQLite; as regras de jogo ficam nos motores, acessados por `rooms`.
 */
export function createConversation({
  store,
  rooms,
  recovery,
  send,
  botNumber = '',
  // Origem web alcançável pelo celular; sem ela o bot não envia link de partida.
  webOrigin = '',
  now = () => Date.now(),
  log = console,
}) {
  const pendingRooms = new Set();
  const gameName = (id) =>
    gameCatalog.find((game) => game.id === id)?.name ?? id;

  function load(profile) {
    return (
      store.getConversation(profile.id) ?? {
        state: profile.name ? 'MENU' : 'NAME',
      }
    );
  }
  // Marcas de aviso (mesa já anunciada, fase e aviso vistos) atravessam as trocas de estado.
  const persist = (profile, convo) => {
    const { startedRoom, notified, noticeAt } = load(profile);
    store.saveConversation(profile.id, {
      startedRoom,
      notified,
      noticeAt,
      ...convo,
    });
  };

  const NO_WEB =
    'A partida na web não está disponível. Avise quem administra o bot.';

  // Um link por pessoa e mesa: fica ativo e só é reenviado quando a pessoa
  // pede (*jogo*). Se já existe um ativo, `plain` (se houver) vai no lugar.
  const recentLinks = new Map();
  const LINK_LOCK_MS = 30000;

  function sendWebLink(
    profileId,
    room,
    intro,
    { again = false, plain = '' } = {}
  ) {
    if (!webOrigin) return send(profileId, NO_WEB);
    // Trava: um link por pessoa. Envios automáticos em seguida não geram outro;
    // só um pedido explícito (*jogo*) troca o link.
    const last = recentLinks.get(profileId);
    if (
      !again &&
      last &&
      last.roomId === room.id &&
      now() - last.at < LINK_LOCK_MS
    ) {
      if (plain) send(profileId, plain);
      return;
    }
    if (!again && hasWebLink(store, profileId, room.id, now())) {
      if (plain) send(profileId, plain);
      return;
    }
    const { token } = issueWebLink(store, profileId, room.id, now());
    recentLinks.set(profileId, { roomId: room.id, at: now() });
    send(profileId, `${intro}\nSe precisar do link de novo, digite *jogo*.`);
    send(profileId, `${webOrigin}/m/${token}`);
  }

  // Resumo da última rodada, a partir do que já é gravado para o ranking.
  function resultLine(room) {
    const row = store.db
      .prepare(
        'SELECT winners, points FROM match_results WHERE room_id = ? ORDER BY round DESC LIMIT 1'
      )
      .get(room.id);
    const winners = row ? JSON.parse(row.winners) : [];
    if (!winners.length) return 'A rodada terminou.';
    const points = JSON.parse(row.points);
    return winners
      .map((id) => {
        const name = store.getProfile(id)?.name ?? 'Alguém';
        return points[id]
          ? `${name} venceu e fez ${points[id]} ponto(s).`
          : `${name} venceu.`;
      })
      .join('\n');
  }

  // O menu é a imagem enviada ao WhatsApp (números 1 a 6, fixos, na ordem do
  // catálogo). O texto abaixo é a reserva se a imagem não puder ser enviada.
  function menuText(profile) {
    const enabled = enabledGameIds(profile);
    const active = rooms.listActive(profile.id);
    return [
      '*Mesa em Família*',
      `Olá, ${profile.name}! Escolha o jogo:`,
      '',
      gameCatalog
        .map((game, index) =>
          enabled.includes(game.id) ? `*${index + 1}* — ${game.name}` : ''
        )
        .filter(Boolean)
        .join('\n'),
      '',
      active.length
        ? 'Partida em andamento: digite *jogo* para receber o link.'
        : '',
      'Digite *ajuda* se precisar.',
    ].join('\n');
  }

  function menuCaption(profile) {
    return [
      `Olá, ${profile.name}! Responda com o *número* ou o *nome* do jogo.`,
      rooms.listActive(profile.id).length
        ? 'Partida em andamento: digite *jogo* para receber o link.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // A imagem do menu leva o texto de apoio (se houver) como legenda; sem imagem, vai o texto todo.
  function sendMenu(profile, intro = '') {
    const join = (...parts) => parts.filter(Boolean).join('\n\n');
    send(profile.id, join(intro, menuText(profile)), {
      kind: 'image',
      asset: 'menu-jogos',
      caption: join(intro, menuCaption(profile)),
    });
  }

  // Toda decisão com opções numeradas vai como imagem (como o menu de jogos);
  // se a imagem falhar, o texto numerado a substitui.
  function askChoice(profile, asset, question, labels) {
    send(profile.id, `${question}\n${numbered(labels)}`, {
      kind: 'image',
      asset,
      caption: `${question}\nResponda com o *número* da imagem.`,
    });
  }

  // Sim ou não por botões; sem botões, a pessoa responde *SIM* ou *NÃO* em texto.
  function askYesNo(profile, question) {
    send(profile.id, `${question} Responda *SIM* ou *NÃO*.`, {
      kind: 'buttons',
      buttons: [
        { id: 'sim', text: 'Sim' },
        { id: 'nao', text: 'Não' },
      ],
    });
  }

  // Escolha por número (1 a 6) ou pelo nome do jogo, com ou sem acento e hífen.
  function pickGame(text) {
    const slug = text
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^(?:quero |vamos )?(?:jogar )?(?:de |o |a )?/, '');
    if (/^\d{1,2}$/.test(slug)) return gameCatalog[Number(slug) - 1]?.id;
    return GAME_NAMES[slug];
  }

  function helpText(inRoom) {
    return inRoom
      ? [
          '*Ajuda*',
          '• *jogo* — receber o link da partida',
          '• *convite* — convite para amigos (mesa que espera gente)',
          '• *chamar* — chamar seus favoritos',
          '• *revanche* — jogar de novo, quando acabar',
          '• *menu* — escolher outro jogo',
          '• *sair* — sair da mesa (um bot assume seu lugar)',
          '• *retirar* e *encerrar* — só para quem criou a mesa',
        ].join('\n')
      : [
          '*Ajuda*',
          'Responda com o número da opção. O jogo é na web, pelo link que eu envio.',
          '• *menu* — voltar ao início',
          '• *jogo* — receber o link da partida',
          '• *favoritos* — ver e remover favoritos',
          '• *ranking* — vitórias com seus favoritos (ex.: *ranking truco*)',
          '• *parar convites* — ninguém mais chama você',
        ].join('\n');
  }

  function inviteMessages(room) {
    const owner = store.getProfile(room.ownerId);
    const { code } = issueWhatsappInvitation(store, room, now());
    const link = botNumber
      ? `https://wa.me/${botNumber}?text=${encodeURIComponent(`ENTRAR ${code}`)}`
      : null;
    const missing = room.capacity - room.playerIds.length;
    return [
      `Mesa de *${gameName(room.gameId)}* criada. Encaminhe a mensagem abaixo para ${missing === 1 ? 'seu amigo' : `${missing} amigos`}:`,
      [
        `${owner.name} convidou você para jogar *${gameName(room.gameId)}*.`,
        link
          ? `Toque para entrar: ${link}`
          : `Envie *ENTRAR ${code}* para este número.`,
        link ? `Se não abrir, envie *ENTRAR ${code}* para este número.` : '',
        'Vale por 24 horas.',
      ]
        .filter(Boolean)
        .join('\n'),
      'Quando a mesa encher, a partida começa.',
    ];
  }

  function waitingText(room, meId) {
    const names = room.playerIds.map((id) => store.getProfile(id)?.name);
    return [
      `Mesa de *${gameName(room.gameId)}* esperando jogadores (${room.playerIds.length}/${room.capacity}):`,
      names.join(', '),
      room.ownerId === meId
        ? 'Digite *convite* para gerar o convite de novo.'
        : 'A partida começa na web quando a mesa encher.',
    ].join('\n');
  }

  // O jogo acontece na web: o WhatsApp só avisa o início (com o link). Tempo,
  // avisos de mesa, nova rodada e fim de partida ficam só na web; o link e o
  // resultado voltam apenas quando a pessoa pede (*jogo*).
  function sendView(room, profileId, { force = false, again = false } = {}) {
    const profile = store.getProfile(profileId);
    if (!profile || profile.bot) return;
    const snapshot = rooms.snapshot(room, profileId);
    if (!snapshot.game) return;
    const convo = load(profile);
    const finished = snapshot.game.status === 'FINISHED';
    const phase = finished ? `end:${room.round ?? 1}` : 'play';
    const first = convo.startedRoom !== room.id;
    if (!force && !first) return;
    persist(profile, {
      ...convo,
      state: 'IN_ROOM',
      roomId: room.id,
      startedRoom: room.id,
      notified: phase,
    });
    const name = gameName(room.gameId);
    if (finished) {
      const result = `${resultLine(room)}
Digite *revanche* para jogar de novo ou *menu* para outro jogo.`;
      if (!again) return send(profileId, result);
      return sendWebLink(profileId, room, result, { again });
    }
    const started = first
      ? `A partida de *${name}* começou.`
      : convo.notified?.startsWith('end')
        ? `Nova rodada de *${name}*.`
        : `Sua partida de *${name}* está na web.`;
    sendWebLink(profileId, room, `${started} Jogue pelo link:`, {
      again,
      plain: `${started} Use o link que já enviei.`,
    });
  }

  // Lembretes de tempo deixaram o WhatsApp: o cronômetro é avisado na web.
  function tick() {}

  function flush() {
    const ids = [...pendingRooms];
    pendingRooms.clear();
    for (const id of ids) {
      const room = rooms.normalizeRoom(store.getRoom(id));
      if (!room) continue;
      for (const playerId of room.playerIds) {
        try {
          const seat = rooms.stateOf(room, playerId);
          if (room.status === 'CLOSED') closedFor(room, playerId);
          else if (seat === 'removed') removedFor(room, playerId);
          else if (seat === 'away') continue;
          // Partida iniciada: nenhuma notificação automática no WhatsApp.
        } catch (error) {
          log.error?.('Falha ao avisar jogador:', error.message);
        }
      }
    }
  }

  function removedFor(room, playerId) {
    const profile = store.getProfile(playerId);
    if (!profile || profile.bot) return;
    const convo = load(profile);
    if (convo.roomId !== room.id) return;
    persist(profile, { state: 'MENU' });
    // Sem aviso automático: quem foi retirado vê isso na web e pede *menu*.
  }

  function closedFor(room, playerId) {
    const profile = store.getProfile(playerId);
    if (!profile || profile.bot) return;
    const convo = load(profile);
    if (convo.roomId !== room.id) return;
    persist(profile, { state: 'MENU' });
    // Sem aviso automático: a mesa encerrada aparece na web.
  }

  function onRoomChanged(room) {
    pendingRooms.add(room.id);
    queueMicrotask(flush);
  }

  function showCurrent(profile, convo, { again = false } = {}) {
    const room = convo.roomId ? store.getRoom(convo.roomId) : null;
    const active =
      room && room.expires > now() && room.status !== 'CLOSED'
        ? rooms.normalizeRoom(room)
        : rooms.listActive(profile.id)[0];
    if (!active) {
      persist(profile, { state: 'MENU' });
      sendMenu(profile, 'Você não tem partida em andamento.');
      return;
    }
    persist(profile, { ...convo, state: 'IN_ROOM', roomId: active.id });
    const current = rooms.normalizeRoom(
      store.getRoom(rooms.resume(active.id, profile).id)
    );
    if (current.game) sendView(current, profile.id, { force: true, again });
    else {
      send(profile.id, waitingText(current, profile.id));
      sendWebLink(profile.id, current, 'Abra a mesa na web enquanto espera:', {
        again,
      });
    }
  }

  function joinWithCode(profile, convo, code) {
    announceJoin(profile, rooms.joinByCode(profile, code));
  }

  function announceJoin(profile, { room, already }) {
    persist(profile, { state: 'IN_ROOM', roomId: room.id });
    if (already)
      return showCurrent(profile, { state: 'IN_ROOM', roomId: room.id });
    const owner = store.getProfile(room.ownerId);
    const missing = room.capacity - room.playerIds.length;
    send(
      profile.id,
      [
        `Você entrou na mesa de ${owner.name} (${gameName(room.gameId)}).`,
        missing > 0
          ? `Faltam ${missing} jogador(es). A partida começa na web quando a mesa encher.`
          : 'A mesa está completa.',
      ].join('\n')
    );
    if (missing > 0)
      sendWebLink(profile.id, room, 'Abra a mesa na web enquanto espera:');
    else {
      // Resposta ao pedido de quem entrou; os demais não recebem aviso.
      const full = rooms.normalizeRoom(store.getRoom(room.id));
      if (full?.game) sendView(full, profile.id, { force: true });
    }
  }

  function createAndAnnounce(profile, draft) {
    const body = { gameId: draft.gameId, mode: draft.mode };
    if (draft.capacity) body.capacity = draft.capacity;
    if (draft.botSeats) body.botSeats = draft.botSeats;
    if (draft.level) body.level = draft.level;
    if (draft.imageId) body.imageId = draft.imageId;
    const room = rooms.createRoom(profile, body);
    persist(profile, { state: 'IN_ROOM', roomId: room.id });
    if (room.mode === 'online') {
      for (const message of inviteMessages(room)) send(profile.id, message);
      sendWebLink(profile.id, room, 'Abra a sua mesa na web:');
      return;
    }
    sendView(room, profile.id, { force: true });
  }

  // Depois de definidos jogo, modo e lugares: proporção, dificuldade ou criação.
  function afterSeats(profile, next) {
    return createAndAnnounce(profile, next);
  }

  function showModeMenu(profile, convo, gameId) {
    const game = gameCatalog.find((item) => item.id === gameId);
    // Jogos individuais: sozinho ou em grupo, sem bots. Os demais podem ter
    // bots; eles também entram sozinhos se faltar gente ou alguém sair.
    const labels = game.solo
      ? ['Em grupo (eu gero um link para convidar)', 'Sozinho(a)']
      : ['Com amigos (bots entram se faltar gente)', 'Contra bots'];
    persist(profile, { state: 'PICK_MODE', draft: { gameId } });
    askChoice(
      profile,
      game.solo ? 'modo-grupo' : 'modo-mesa',
      `*${game.name}* — como você quer jogar?`,
      labels
    );
  }

  // ---- favoritos, ranking e chamados
  const favorites = rooms.favorites;
  const waitLabel = (seconds) =>
    seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`;

  function openRoom(roomId) {
    const stored = roomId ? store.getRoom(roomId) : null;
    if (!stored || stored.expires <= now() || stored.status === 'CLOSED')
      return null;
    return rooms.normalizeRoom(stored);
  }

  const inGame = (profileId) =>
    rooms
      .listActive(profileId)
      .some(
        (room) =>
          room.status === 'PLAYING' &&
          rooms.stateOf(room, profileId) === 'present'
      );

  function deliverCall(owner, friend, room) {
    send(
      friend.id,
      `${owner.name} quer jogar *${gameName(room.gameId)}*. Entrar?\nToque em um botão ou responda *ENTRAR* ou *AGORA NÃO*.`,
      {
        kind: 'buttons',
        buttons: [
          { id: `j:${room.id}`, text: 'Entrar' },
          { id: `x:${room.id}`, text: 'Agora não' },
        ],
      }
    );
  }

  function askConsent(owner, friend) {
    send(
      friend.id,
      `${owner.name} quer chamar você para jogar. Aceita receber convites de ${owner.name} e colocar nos favoritos?\nToque em um botão ou responda *SIM*, *NÃO* ou *BLOQUEAR*.`,
      {
        kind: 'buttons',
        buttons: [
          { id: `c:${owner.id}:y`, text: 'Sim' },
          { id: `c:${owner.id}:n`, text: 'Não' },
          { id: `c:${owner.id}:b`, text: 'Bloquear' },
        ],
      }
    );
  }

  function callFavorites(profile, convo) {
    const room = openRoom(convo.roomId);
    requireValue(
      room &&
        room.status === 'WAITING' &&
        room.ownerId === profile.id &&
        room.mode === 'online',
      'Você não tem uma mesa esperando amigos para chamar.'
    );
    requireValue(
      room.playerIds.length < room.capacity,
      'A mesa já está cheia.'
    );
    const limit = favorites.callLimit(profile.id, room.id);
    if (limit)
      throw new AppError(
        limit.reason === 'room'
          ? `Já chamei os favoritos para esta mesa. Aguarde ${waitLabel(limit.wait)} para chamar de novo.`
          : `Você já fez 3 chamados na última hora. Tente de novo em ${waitLabel(limit.wait)}.`
      );
    const batch = `${room.id}:${now()}`;
    let sent = 0;
    let asked = 0;
    let unavailable = 0;
    for (const row of favorites.list(profile.id, [
      'accepted',
      'pending',
      'declined',
    ])) {
      if (sent + asked >= MAX_RECIPIENTS) break;
      const friend = store.getProfile(row.friend_id);
      if (!friend || friend.bot || !friend.name) continue;
      if (room.playerIds.includes(friend.id) || room.banned.includes(friend.id))
        continue;
      if (
        friend.noInvites ||
        !store.identityOf('whatsapp', friend.id) ||
        inGame(friend.id) ||
        (row.state === 'declined' && (row.retry_after ?? 0) > now())
      ) {
        unavailable++;
        continue;
      }
      if (row.state === 'accepted') {
        deliverCall(profile, friend, room);
        sent++;
      } else {
        // Sem aceite: só a pergunta de consentimento é enviada; o chamado fica guardado.
        const fresh =
          row.state === 'pending' &&
          row.call_payload &&
          now() - row.decided_at < DAY_MS;
        favorites.set(profile.id, friend.id, 'pending', {
          payload: { roomId: room.id, gameId: room.gameId },
          retryAfter: null,
        });
        if (!fresh) askConsent(profile, friend);
        asked++;
      }
      favorites.logCall(batch, room.id, profile.id, friend.id);
    }
    if (!(sent + asked)) {
      return send(
        profile.id,
        'Nenhum favorito está disponível agora. Digite *convite* para gerar o link e encaminhar.'
      );
    }
    send(
      profile.id,
      [
        `Chamei ${sent} favorito(s) para a sua mesa de *${gameName(room.gameId)}*.`,
        asked ? `${asked} ainda precisa(m) aceitar seus convites.` : '',
        unavailable ? `${unavailable} não está(ão) disponível(is) agora.` : '',
        'Eu aviso quando alguém entrar.',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  function answerConsent(profile, ownerId, answer) {
    const row = favorites.get(ownerId, profile.id);
    const owner = store.getProfile(ownerId);
    if (!row || row.state !== 'pending' || !owner)
      return send(profile.id, 'Esse pedido já foi respondido.');
    const payload = row.call_payload ? JSON.parse(row.call_payload) : null;
    if (answer === 'y') {
      favorites.set(ownerId, profile.id, 'accepted', {
        payload: null,
        retryAfter: null,
      });
      send(
        profile.id,
        `Pronto! ${owner.name} está nos seus favoritos e pode chamar você.`
      );
      const room = openRoom(payload?.roomId);
      if (room && room.status === 'WAITING' && room.ownerId === ownerId)
        deliverCall(owner, profile, room);
      return;
    }
    if (answer === 'n') {
      favorites.set(ownerId, profile.id, 'declined', {
        payload: null,
        retryAfter: now() + DECLINE_WAIT,
      });
      return send(
        profile.id,
        `Tudo bem, não vou entregar convites de ${owner.name}.`
      );
    }
    favorites.set(ownerId, profile.id, 'blocked', {
      payload: null,
      retryAfter: null,
    });
    send(
      profile.id,
      `${owner.name} foi bloqueado(a): você não receberá mais convites.`
    );
  }

  function answerCall(profile, roomId, join) {
    if (!favorites.hasCall(profile.id, roomId))
      return send(profile.id, 'Este chamado não é mais válido.');
    if (!join) {
      favorites.answerCalls(profile.id, roomId, 'declined');
      return send(profile.id, 'Tudo bem! Fica para a próxima. ');
    }
    const stored = store.getRoom(roomId);
    const room = openRoom(roomId);
    if (!room) {
      persist(profile, { state: 'MENU' });
      favorites.answerCalls(profile.id, roomId, 'gone');
      return sendMenu(profile, 'Essa mesa não existe mais.');
    }
    if (room.playerIds.includes(profile.id))
      return showCurrent(profile, { state: 'IN_ROOM', roomId });
    if (
      room.status !== 'WAITING' ||
      room.pendingId ||
      room.playerIds.length >= room.capacity
    ) {
      favorites.answerCalls(profile.id, roomId, 'full');
      return send(profile.id, 'Infelizmente a sala está cheia.', {
        kind: 'buttons',
        buttons: [{ id: `n:${stored.gameId}`, text: 'Criar outra sala' }],
      });
    }
    announceJoin(profile, rooms.joinRoom(profile, room));
  }

  // Toques de botão dos chamados e do consentimento; devolve true se tratou.
  function handleCallTap(profile, rawText) {
    const tap = /^([cjxn]):([\w-]+)(?::([ynb]))?$/.exec(String(rawText).trim());
    if (!tap) return false;
    const [, kind, id, answer] = tap;
    if (kind === 'c') answerConsent(profile, id, answer);
    else if (kind === 'j') answerCall(profile, id, true);
    else if (kind === 'x') answerCall(profile, id, false);
    else {
      requireValue(
        enabledGameIds(profile).includes(id),
        'Este jogo não está habilitado para você.'
      );
      showModeMenu(profile, load(profile), id);
    }
    return true;
  }

  function showFavorites(profile, convo) {
    const friends = favorites
      .list(profile.id)
      .map((row) => store.getProfile(row.friend_id))
      .filter((friend) => friend?.name && !friend.bot);
    if (!friends.length)
      return send(
        profile.id,
        'Você ainda não tem favoritos. Quem entra nas suas mesas pelo link vira favorito automaticamente.'
      );
    persist(profile, { ...convo, favs: friends.map((friend) => friend.id) });
    send(
      profile.id,
      [
        '*Seus favoritos*',
        numbered(friends.map((friend) => friend.name)),
        '',
        'Para remover, digite *remover* e o número (ex.: *remover 2*).',
        'Em uma mesa com amigos, digite *chamar* para convidar todos de uma vez.',
        'Para parar de receber convites de qualquer pessoa, digite *parar convites*.',
      ].join('\n')
    );
  }

  function showRanking(profile, term) {
    const game = term
      ? gameCatalog.find((item) => plain(item.name).includes(term))
      : null;
    requireValue(!term || game, 'Não conheço esse jogo. Digite só *ranking*.');
    const rows = favorites.ranking(profile.id, game?.id ?? null);
    if (!rows.some((row) => row.games))
      return send(
        profile.id,
        'Ainda não há partidas terminadas entre você e seus favoritos.'
      );
    send(
      profile.id,
      [
        `*Ranking*${game ? ` — ${game.name}` : ''}`,
        ...rows.map((row, index) => {
          const name = store.getProfile(row.id)?.name ?? 'Jogador';
          return `${index + 1}. ${name}${row.id === profile.id ? ' (você)' : ''} — ${row.wins} vitória(s) em ${row.games} partida(s) (${row.rate}%)`;
        }),
      ].join('\n')
    );
  }

  function step(profile, convo, text) {
    const choice = /^\d{1,2}$/.test(text) ? Number(text) : null;
    const draft = convo.draft ?? {};
    if (convo.state === 'MENU') {
      const gameId = pickGame(text);
      requireValue(
        gameId,
        'Não entendi. Responda com o número (1 a 6) ou o nome do jogo, como na imagem, ou digite *ajuda*.'
      );
      requireValue(
        enabledGameIds(profile).includes(gameId),
        `${gameName(gameId)} está desligado no painel do familiar. Escolha outro jogo.`
      );
      return showModeMenu(profile, convo, gameId);
    }
    if (convo.state === 'PICK_MODE') {
      const game = gameCatalog.find((item) => item.id === draft.gameId);
      const modes = game.solo ? ['online', 'solo'] : ['online', 'bot'];
      requireValue(
        choice && modes[choice - 1],
        'Não entendi. Responda com o número de uma das opções.'
      );
      const next = { ...draft, mode: modes[choice - 1] };
      if (draft.gameId === 'puzzle') {
        persist(profile, { state: 'PICK_LEVEL', draft: next });
        return askChoice(
          profile,
          'nivel-quebra-cabeca',
          'Qual a dificuldade do quebra-cabeça?',
          LEVELS.map((level) => level.label)
        );
      }
      if (draft.gameId === 'wordsearch') {
        persist(profile, { state: 'PICK_WORD_LEVEL', draft: next });
        return askChoice(
          profile,
          'nivel-caca-palavras',
          'Qual a dificuldade do caça-palavras?',
          WORDSEARCH_LEVELS.map((level) => level.label)
        );
      }
      const sized = gameCatalog.find((item) => item.id === draft.gameId);
      if (sized.capacities?.length === 1 && next.mode !== 'solo')
        return afterSeats(profile, { ...next, capacity: sized.capacities[0] });
      if (sized.capacities && next.mode !== 'solo') {
        persist(profile, { state: 'PICK_SEATS', draft: next });
        const options = seatOptions(draft.gameId);
        const question = `Quantos lugares na mesa de ${sized.shortName}?`;
        const labels = options.map((seat) => seat.label);
        // A imagem mostra 2, 3 e 4 jogadores; outras combinações ficam em texto.
        if (options.map((seat) => seat.capacity).join() === '2,3,4')
          return askChoice(profile, 'lugares', question, labels);
        return send(profile.id, `${question}\n${numbered(labels)}`);
      }
      return createAndAnnounce(profile, next);
    }
    if (convo.state === 'PICK_WORD_LEVEL') {
      requireValue(
        choice && WORDSEARCH_LEVELS[choice - 1],
        'Não entendi. Responda com 1, 2 ou 3.'
      );
      const next = { ...draft, level: WORDSEARCH_LEVELS[choice - 1].id };
      return createAndAnnounce(profile, next);
    }
    if (convo.state === 'PICK_SEATS') {
      const seats = seatOptions(draft.gameId);
      requireValue(
        choice && seats[choice - 1],
        'Não entendi. Responda com o número de uma das opções.'
      );
      return afterSeats(profile, {
        ...draft,
        capacity: seats[choice - 1].capacity,
      });
    }
    if (convo.state === 'PICK_LEVEL') {
      requireValue(
        choice && LEVELS[choice - 1],
        'Não entendi. Responda com 1, 2 ou 3.'
      );
      const level = LEVELS[choice - 1].id;
      const images = rooms.images.list(level).slice(0, 8);
      persist(profile, {
        state: 'PICK_IMAGE',
        draft: { ...draft, level },
        imageIds: images.map((image) => image.id),
      });
      const question = 'Qual imagem?';
      const labels = [
        'Sortear uma imagem',
        ...images.map((image) => image.title),
      ];
      // A folha mostra as imagens do acervo embutido; se a lista mudou, só texto.
      if (
        images.map((image) => image.id).join() ===
        embeddedImageIds(level).join()
      )
        return askChoice(profile, `imagens-${level}`, question, labels);
      return send(
        profile.id,
        `${question}
${numbered(labels)}`
      );
    }
    if (convo.state === 'PICK_IMAGE') {
      requireValue(
        choice && choice <= (convo.imageIds?.length ?? 0) + 1,
        'Não entendi. Responda com o número da imagem.'
      );
      const next = {
        ...draft,
        ...(choice > 1 ? { imageId: convo.imageIds[choice - 2] } : {}),
      };
      if (next.mode === 'bot') {
        return createAndAnnounce(profile, next);
      }
      return createAndAnnounce(profile, next);
    }
    if (convo.state === 'CONFIRM_CLOSE') {
      if (['sim', 's'].includes(text)) {
        rooms.perform(profile, convo.roomId, 'close');
        return;
      }
      persist(profile, { ...convo, state: 'IN_ROOM' });
      return send(
        profile.id,
        'Tudo bem, a mesa continua. Digite *estado* para vê-la.'
      );
    }
    if (convo.state === 'PICK_REMOVE') {
      const target = convo.removable?.[choice - 1];
      requireValue(
        choice && target,
        'Não entendi. Responda com o número da pessoa, ou digite *estado* para cancelar.'
      );
      persist(profile, { ...convo, state: 'CONFIRM_REMOVE', targetId: target });
      return askYesNo(
        profile,
        `Retirar *${store.getProfile(target).name}* da mesa? Um bot assume o lugar.`
      );
    }
    if (convo.state === 'CONFIRM_REMOVE') {
      if (['sim', 's'].includes(text)) {
        const name = store.getProfile(convo.targetId)?.name;
        persist(profile, { state: 'IN_ROOM', roomId: convo.roomId });
        rooms.perform(profile, convo.roomId, 'remove', {
          playerId: convo.targetId,
        });
        return send(profile.id, `${name} foi retirado(a) da mesa.`);
      }
      persist(profile, { state: 'IN_ROOM', roomId: convo.roomId });
      return send(profile.id, 'Tudo bem, ninguém foi retirado.');
    }
    if (convo.state === 'CONFIRM_LEAVE') {
      if (['sim', 's'].includes(text)) {
        const roomId = convo.roomId;
        persist(profile, { state: 'MENU', roomId });
        rooms.perform(profile, roomId, 'leave');
        return send(
          profile.id,
          'Você saiu e um bot assumiu o seu lugar. Digite *jogo* para voltar ou *menu* para outro jogo.'
        );
      }
      persist(profile, { ...convo, state: 'IN_ROOM' });
      return send(
        profile.id,
        'Tudo bem, a mesa continua. Digite *estado* para vê-la.'
      );
    }
    if (convo.state === 'IN_ROOM') return playTurn(profile, convo);
    persist(profile, { state: 'MENU' });
    return sendMenu(profile);
  }

  // Dentro da mesa o WhatsApp não aceita jogadas: devolve o link da web.
  function playTurn(profile, convo) {
    const stored = convo.roomId ? store.getRoom(convo.roomId) : null;
    if (!stored || stored.expires <= now() || stored.status === 'CLOSED') {
      persist(profile, { state: 'MENU' });
      return sendMenu(
        profile,
        stored?.closedReason === 'inactive'
          ? CANCELLED
          : 'Essa mesa expirou ou foi encerrada.'
      );
    }
    if (rooms.stateOf(rooms.normalizeRoom(stored), profile.id) === 'removed') {
      persist(profile, { state: 'MENU' });
      return sendMenu(profile, 'O dono da mesa retirou você desta partida.');
    }
    const room = rooms.normalizeRoom(
      store.getRoom(rooms.resume(stored.id, profile).id)
    );
    if (!room.game) return showCurrent(profile, convo);
    sendWebLink(profile.id, room, 'Jogue pelo link:', {
      plain:
        'O jogo é na web, pelo link que já enviei. Para receber de novo, digite *jogo*.',
    });
  }

  function rematch(profile, convo) {
    const room = openRoom(convo.roomId) ?? rooms.listActive(profile.id)[0];
    requireValue(room, 'Você não tem partida para repetir. Digite *menu*.');
    const current = rooms.normalizeRoom(store.getRoom(room.id));
    requireValue(
      current.game?.status === 'FINISHED',
      'A revanche só abre quando a rodada terminar.'
    );
    rooms.perform(profile, current.id, 'rematch', {
      revision: current.revision,
    });
  }

  function handleText(profile, rawText) {
    const text = plain(rawText);
    let convo = load(profile);
    const invite = String(rawText)
      .trim()
      .match(/^entrar\s+([\w\s-]{1,24})$/i);

    const link = String(rawText)
      .trim()
      .match(/^vincular\s+([\w\s-]{1,24})$/i);
    if (link) {
      const target = recovery.redeemLinkCode(link[1], profile);
      return send(
        target.id,
        `Número registrado no perfil de *${target.name || 'você'}*. Para recuperar o acesso ao site, use “Recuperar acesso” com este número.`
      );
    }

    if (invite) {
      if (!profile.name) {
        persist(profile, {
          state: 'NAME',
          asked: true,
          pendingCode: invite[1],
        });
        return send(
          profile.id,
          'Você foi convidado para jogar. Qual é o seu *nome*?'
        );
      }
      return joinWithCode(profile, convo, invite[1]);
    }

    if (!profile.name) {
      if (convo.state !== 'NAME' || !convo.asked) {
        persist(profile, { ...convo, state: 'NAME', asked: true });
        return send(
          profile.id,
          [
            'Olá! Eu sou o bot da *Mesa em Família*. Você escolhe o jogo e convida amigos por aqui. A partida é na web, pelo link que eu envio.',
            'Digite *menu* para recomeçar e *ajuda* para ver os comandos.',
            'Qual é o seu *nome*?',
          ].join('\n')
        );
      }
      const name = cleanName(rawText);
      profile.name = name;
      store.saveProfile({ ...store.getProfile(profile.id), name });
      if (convo.pendingCode) {
        const code = convo.pendingCode;
        persist(profile, { state: 'MENU' });
        return joinWithCode(profile, convo, code);
      }
      persist(profile, { state: 'MENU' });
      return sendMenu(profile, `Prazer, ${name}!`);
    }

    if (handleCallTap(profile, rawText)) return;
    // Sem botões (WHATSAPP_INTERACTIVE=off): respostas em texto aos pedidos pendentes.
    if (convo.state === 'MENU') {
      const consent = favorites.pendingFor(profile.id)[0];
      const answers = { sim: 'y', nao: 'n', bloquear: 'b' };
      if (consent && answers[text])
        return answerConsent(profile, consent.owner_id, answers[text]);
      const call = favorites.lastCallTo(profile.id);
      if (call && !call.answer && ['entrar', 'agora nao'].includes(text))
        return answerCall(profile, call.room_id, text === 'entrar');
    }
    if (text === 'favoritos') return showFavorites(profile, convo);
    const removal = /^remover\s+(\d{1,2})$/.exec(text);
    if (removal) {
      const friendId = convo.favs?.[Number(removal[1]) - 1];
      requireValue(
        friendId,
        'Digite *favoritos* para ver a lista e depois *remover* com o número.'
      );
      const name = store.getProfile(friendId)?.name ?? 'Essa pessoa';
      rooms.removeFavorite(profile, friendId);
      persist(profile, {
        ...convo,
        favs: convo.favs.filter((id) => id !== friendId),
      });
      return send(profile.id, `${name} saiu dos seus favoritos.`);
    }
    if (text === 'parar convites' || text === 'receber convites') {
      const stop = text === 'parar convites';
      store.saveProfile({ ...store.getProfile(profile.id), noInvites: stop });
      return send(
        profile.id,
        stop
          ? 'Pronto: ninguém mais chama você. Digite *receber convites* para voltar atrás.'
          : 'Pronto: seus favoritos podem chamar você.'
      );
    }
    const ranking = /^ranking(?:\s+(.{2,20}))?$/.exec(text);
    if (ranking) return showRanking(profile, ranking[1]);
    if (text === 'chamar') return callFavorites(profile, convo);
    if (['menu', 'inicio', 'oi', 'ola', 'start'].includes(text)) {
      persist(profile, { state: 'MENU' });
      return sendMenu(profile);
    }
    if (text === 'ajuda' || text === 'help')
      return send(profile.id, helpText(convo.state === 'IN_ROOM'));
    if (['estado', 'jogo', 'mesa', 'partida'].includes(text))
      return showCurrent(profile, convo, { again: true });
    if (text === 'convite') {
      const room = convo.roomId
        ? rooms.normalizeRoom(store.getRoom(convo.roomId))
        : null;
      requireValue(
        room && room.status === 'WAITING' && room.ownerId === profile.id,
        'Você não tem uma mesa esperando amigos.'
      );
      for (const message of inviteMessages(room)) send(profile.id, message);
      return;
    }
    if (text === 'sair') {
      if (!['IN_ROOM', 'CONFIRM_LEAVE', 'CONFIRM_CLOSE'].includes(convo.state))
        return send(
          profile.id,
          'Você não está em nenhuma mesa. Digite *menu* para jogar.'
        );
      persist(profile, { ...convo, state: 'CONFIRM_LEAVE' });
      return askYesNo(
        profile,
        'Sair da mesa? Um bot assume o seu lugar e você volta com *jogo*.'
      );
    }
    if (text === 'encerrar' || text === 'retirar') {
      const room = convo.roomId
        ? rooms.normalizeRoom(store.getRoom(convo.roomId))
        : null;
      requireValue(
        room && room.status !== 'CLOSED',
        'Você não está em nenhuma mesa. Digite *menu* para jogar.'
      );
      requireValue(
        room.ownerId === profile.id,
        text === 'encerrar'
          ? 'Só quem criou a mesa pode encerrá-la. Digite *sair* e um bot assume o seu lugar.'
          : 'Só quem criou a mesa pode retirar alguém.'
      );
      if (text === 'encerrar') {
        persist(profile, { ...convo, state: 'CONFIRM_CLOSE' });
        return askYesNo(profile, 'Encerrar a mesa para todos?');
      }
      const removable = room.playerIds.filter(
        (id) => id !== profile.id && !room.botIds.includes(id)
      );
      requireValue(removable.length, 'Não há outra pessoa na mesa.');
      persist(profile, { ...convo, state: 'PICK_REMOVE', removable });
      return send(
        profile.id,
        `Quem você quer retirar?\n${numbered(removable.map((id) => store.getProfile(id).name))}`
      );
    }
    if (text === 'revanche') return rematch(profile, convo);
    return step(
      profile,
      convo,
      convo.state === 'IN_ROOM' ? String(rawText).trim() : text
    );
  }

  async function handle(profile, rawText) {
    try {
      handleText(profile, String(rawText ?? ''));
    } catch (error) {
      if (error instanceof AppError) send(profile.id, `${error.message}`);
      else {
        log.error?.('Falha na conversa:', error.message);
        send(
          profile.id,
          'Não consegui concluir agora. Tente de novo em instantes ou digite *menu*.'
        );
      }
    }
  }

  return { handle, onRoomChanged, flush, menuText, tick };
}
