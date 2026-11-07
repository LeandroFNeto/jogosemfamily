import {
  escapeHtml as e,
  avatar,
  botTag,
  tileMarkup,
  openDialog,
  showHelp,
  turnSign,
  screenBar,
  gameSheet,
  bindGameMenu,
} from '/components.mjs';
import { applyPreferences, showAccessibility, speak } from '/accessibility.mjs';
import { readPhoto, showFamilyPanel } from '/family-panel.mjs';
import { gameCatalog, enabledGameIds } from '/games.mjs';
import { gameSetupFields, renderAdditionalGame } from '/games-ui.mjs';
import { mountTurnTimer, stopTurnTimer } from '/turn-timer.mjs';
import { tileLabel } from '/art.mjs';
import { animateNew } from '/motion.mjs';

const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
let me;
let room;
let invitation;
let sharedInvitation;
let stream;
let connected = false;
let busy = false;
let selected = null;
let announced = '';

async function api(path, method = 'GET', data) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    ...(data === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(
      payload.error || 'Não foi possível concluir. Tente novamente.'
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

function notify(message, error = false) {
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle('error', error);
}

async function perform(work) {
  if (busy) return;
  busy = true;
  main.setAttribute('aria-busy', 'true');
  notice.hidden = true;
  try {
    await work();
  } catch (error) {
    notify(error.message || 'A conexão falhou. Tente novamente.', true);
    if (room) {
      try {
        room = await api(`/rooms/${room.id}`);
        renderRoom();
      } catch {
        /* A mensagem da operação permanece visível. */
      }
    }
  } finally {
    busy = false;
    main.removeAttribute('aria-busy');
  }
}

async function saveProfile(profile) {
  await api('/me', 'PUT', profile);
  me = await api('/me');
  applyPreferences(me.preferences);
  if (!room) await route();
}

function navigate(path) {
  history.pushState(null, '', path);
  return route();
}

function setContent(html) {
  const focused = document.activeElement?.id;
  main.innerHTML = html;
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
}

function renderWelcome() {
  const invited = invitation?.owner;
  setContent(`<section class="welcome-grid">
    <div class="welcome-copy"><p class="eyebrow">UM LUGAR PARA ESTAR JUNTO</p>
      <h1>Uma boa partida.<br>Uma ótima <em>companhia.</em></h1>
      <p class="intro">Os jogos de sempre, com quem você gosta.<br>É só abrir, sentar à mesa e aproveitar.</p>
      <div class="welcome-note"><span aria-hidden="true">✓</span> Sem instalar nada <span aria-hidden="true">·</span> No seu tempo</div>
      <div class="domino-art" aria-hidden="true"><span>${tileMarkup({ a: 6, b: 6 }, { vertical: true })}</span><span>${tileMarkup({ a: 3, b: 5 }, { vertical: true })}</span><span>${tileMarkup({ a: 2, b: 4 }, { vertical: true })}</span></div>
    </div>
    <section class="card welcome-card" aria-labelledby="welcome-title">
      ${invited ? `<div class="person">${avatar(invited, true)}<p><strong>${e(invited.name)}</strong> convidou você para jogar ${e(invitation.gameName)}.</p></div>` : '<span class="small-mark" aria-hidden="true">☀</span>'}
      <h2 id="welcome-title">${invited ? 'Vamos entrar na mesa?' : 'Como podemos chamar você?'}</h2>
      <p>Seu nome ajuda a família a reconhecer você.</p>
      <form id="welcome-form" class="stack">
        <label>Seu nome<input id="player-name" name="playerName" autocomplete="given-name" placeholder="Ex.: Maria" minlength="2" maxlength="40" required></label>
        <label>Sua foto <span class="muted">(opcional)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
        <button class="primary" type="submit">${invited ? 'Continuar para o convite' : 'Vamos jogar'} <span aria-hidden="true">→</span></button>
      </form>
      <p class="fine">Aqui, você joga com pessoas conhecidas. Sem anúncios ou pedidos de pagamento.</p>
      ${me.whatsappAvailable ? '<button id="recover-access" class="quiet" type="button">Já joguei antes? Recuperar acesso</button>' : ''}
    </section>
  </section>`);
  document
    .querySelector('#recover-access')
    ?.addEventListener('click', renderRecovery);
  document.querySelector('#welcome-form').onsubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    perform(async () => {
      const photo = (await readPhoto(form.elements.photo.files[0])) || '';
      await saveProfile({ ...me, name: form.elements.playerName.value, photo });
    });
  };
}

function renderRecovery() {
  setContent(`<section class="centered card"><p class="eyebrow">RECUPERAR ACESSO</p><h1>Vamos achar o seu perfil.</h1>
    <p>Informe o número de WhatsApp que você registrou. Enviamos por lá um código de 6 dígitos, válido por 10 minutos.</p>
    <form id="recovery-request" class="stack"><label>Número de WhatsApp<input name="phone" inputmode="numeric" autocomplete="tel" placeholder="5511999999999" required></label><button class="primary" type="submit">Enviar código</button></form>
    <form id="recovery-verify" class="stack" hidden><label>Código recebido<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label><button class="primary" type="submit">Entrar no meu perfil</button></form>
    <p class="fine">Só é possível recuperar perfis que registraram o número. Sem número registrado, não há como recuperar: crie um novo perfil.</p>
    <a class="button quiet" href="/">Voltar</a></section>`);
  const request = document.querySelector('#recovery-request');
  const verify = document.querySelector('#recovery-verify');
  request.onsubmit = (event) => {
    event.preventDefault();
    perform(async () => {
      await api('/recovery/request', 'POST', {
        phone: request.elements.phone.value,
      });
      verify.hidden = false;
      verify.elements.code.focus();
      notify('Se o número estiver registrado, o código chegou ao WhatsApp.');
    });
  };
  verify.onsubmit = (event) => {
    event.preventDefault();
    perform(async () => {
      await api('/recovery/verify', 'POST', {
        phone: request.elements.phone.value,
        code: verify.elements.code.value,
      });
      await navigate('/');
    });
  };
}

function showRankingDialog() {
  const dialog = openDialog(
    'Ranking da família',
    `<label>Jogo<select id="ranking-game"><option value="">Todos os jogos</option>${gameCatalog.map((game) => `<option value="${game.id}">${e(game.name)}</option>`).join('')}</select></label><div id="ranking-body" aria-live="polite"></div>`
  );
  const body = dialog.querySelector('#ranking-body');
  const load = () =>
    perform(async () => {
      const game = dialog.querySelector('#ranking-game').value;
      const rows = await api(
        `/ranking${game ? `?game=${encodeURIComponent(game)}` : ''}`
      );
      body.innerHTML = rows.some((row) => row.games)
        ? `<ol class="ranking-list">${rows.map((row) => `<li><strong>${e(row.name)}${row.me ? ' (você)' : ''}</strong><span>${row.wins} vitória(s) em ${row.games} partida(s) · ${row.rate}%</span></li>`).join('')}</ol>`
        : '<p>Ainda não há partidas terminadas entre você e seus favoritos.</p>';
    });
  dialog.querySelector('#ranking-game').onchange = load;
  load();
}

function showLinkNumber() {
  perform(async () => {
    const result = await api('/link-code', 'POST', {});
    const dialog = openDialog(
      'Registrar meu número',
      `<p>No WhatsApp, envie ao bot a mensagem abaixo em até 10 minutos:</p><p><strong class="link-code">VINCULAR ${e(result.code)}</strong></p>${result.link ? `<p><a class="button primary" href="${e(result.link)}" target="_blank" rel="noopener">Abrir o WhatsApp</a></p>` : ''}<p class="fine">Com o número registrado, você poderá recuperar o acesso se perder este aparelho.</p>`
    );
    dialog.querySelector('#close-dialog').focus();
  });
}

function renderHome() {
  setContent(`<section class="home-intro"><p class="eyebrow">A MESA ESTÁ POSTA</p><h1>Olá, ${e(me.name)}.<br>Vamos <em>jogar juntos?</em></h1><p class="intro">Um convite, uma partida e uma boa conversa depois.</p></section>
    <section class="home-grid">
      <article class="game-card card">
        <div class="game-art" aria-hidden="true"><div>${tileMarkup({ a: 6, b: 4 }, { vertical: true })}</div><div>${tileMarkup({ a: 4, b: 2 }, { vertical: true })}</div><span class="art-caption">o clássico da família</span></div>
        <div class="game-description"><div class="section-heading"><h2>Dominó</h2><span class="tag">2 pessoas</span></div><p>As peças que você conhece.<br>A companhia que faz a diferença.</p>
          <form id="create-form" class="stack">
            ${gameSetupFields(gameCatalog[0], me)}
            ${me.contacts.length ? `<label>Com quem vamos jogar?<select id="contact-select" name="contact"><option value="">Convidar um familiar</option>${me.contacts.map((contact) => `<option value="${contact.id}">${e(contact.name)}</option>`).join('')}</select></label>` : ''}
            <button id="create-room" class="primary" type="submit" ${me.dominoEnabled ? '' : 'disabled'}>Jogar agora <span aria-hidden="true">→</span></button>
          </form>${me.dominoEnabled ? '<p class="fine">Convide um familiar ou escolha jogar contra o bot.</p>' : '<p>O dominó está desativado. Ative no painel do familiar.</p>'}
        </div>
      </article>
      <aside class="home-aside"><div class="note-card"><span class="small-mark" aria-hidden="true">♡</span><h2>Perto de quem importa.</h2><p>Jogue com seus filhos, netos e amigos, mesmo quando cada um está em sua casa.</p><div class="rule"></div><p><strong>No seu ritmo.</strong><br>Tempo generoso para decidir, e você escolhe quanto.</p></div>
        ${me.activeRooms.length ? `<div class="resume"><h3>Suas mesas abertas</h3>${me.activeRooms.map((active) => `<a class="resume-link" href="/mesa/${active.id}"><span>${e(gameCatalog.find((game) => game.id === active.gameId)?.name || 'Dominó')} · ${active.solo ? 'Individual' : `Mesa com ${e(active.name)}`}</span><span aria-hidden="true">→</span></a>`).join('')}</div>` : ''}
      </aside>
    </section>
    ${me.whatsappAvailable ? `<section class="card phone-card" aria-labelledby="phone-title"><h2 id="phone-title">Meu número de WhatsApp</h2>${me.phoneLinked ? '<p>✓ Número registrado. Se perder o acesso, use “Recuperar acesso” na tela inicial com este número.</p>' : '<p>Registre o seu número para poder recuperar o perfil se trocar de aparelho.</p><button id="link-number" class="secondary" type="button">Registrar meu número</button>'}</section>` : ''}
    <section class="card ranking-card" aria-labelledby="ranking-title"><h2 id="ranking-title">Ranking da família</h2><p>Vitórias entre você e seus favoritos.</p><button id="open-ranking" class="secondary" type="button">Ver ranking</button></section>
    <section class="more-games" aria-labelledby="more-games-title"><h2 id="more-games-title">Mais jeitos de estar junto</h2><div class="game-catalog">${gameCatalog
      .slice(1)
      .map(
        (game) =>
          `<article class="card catalog-card"><span class="catalog-symbol" aria-hidden="true">${game.symbol}</span><h2>${e(game.name)}</h2><p>${e(game.description)}</p><form class="stack" data-create-game="${game.id}">${gameSetupFields(game, me)}<button class="primary" type="submit" ${enabledGameIds(me).includes(game.id) ? '' : 'disabled'}>Jogar ${e(game.name)}</button></form>${enabledGameIds(me).includes(game.id) ? '' : '<p>Ative este jogo no painel do familiar.</p>'}</article>`
      )
      .join('')}</div></section>`);
  document
    .querySelector('#link-number')
    ?.addEventListener('click', showLinkNumber);
  document
    .querySelector('#open-ranking')
    .addEventListener('click', showRankingDialog);
  document.querySelector('#create-form').dataset.createGame = 'domino';
  document.querySelectorAll('[data-create-game]').forEach((form) => {
    const mode = form.elements.mode;
    const proportion = form.elements.proportion;
    const capacity = form.elements.capacity;
    const updateOptions = () => {
      const mixed =
        proportion && mode.value === 'online' && Number(capacity.value) > 2;
      form
        .querySelector('[data-proportion]')
        ?.toggleAttribute('hidden', !mixed);
      form.querySelector('[data-turn-option]').hidden = mode.value === 'solo';
      if (form.elements.contact)
        form.elements.contact.closest('label').hidden = mode.value !== 'online';
    };
    // Quebra-cabeça: a lista de imagens acompanha a dificuldade escolhida.
    const level = form.elements.level;
    if (level && form.elements.imageId) {
      const loadImages = () =>
        api(`/images?difficulty=${encodeURIComponent(level.value)}`)
          .then((items) => {
            form.elements.imageId.innerHTML = `<option value="">Sortear uma imagem</option>${items.map((item) => `<option value="${e(item.id)}">${e(item.title)}</option>`).join('')}`;
          })
          .catch(() => {});
      level.onchange = loadImages;
      loadImages();
    }
    mode.onchange = updateOptions;
    if (proportion) {
      proportion.onchange = updateOptions;
      capacity.onchange = updateOptions;
    }
    updateOptions();
    form.onsubmit = (event) => {
      event.preventDefault();
      const targetId =
        mode.value === 'online'
          ? event.currentTarget.elements.contact?.value || null
          : null;
      // Proporção pronta do Truco com amigos: "metade bots" ou "eu e bots".
      const mixed =
        proportion && mode.value === 'online' && Number(capacity.value) > 2;
      const allBots = mixed && proportion.value === 'bots';
      const botSeats =
        mixed && proportion.value === 'half'
          ? Math.floor(Number(capacity.value) / 2)
          : 0;
      perform(async () => {
        const result = await api('/rooms', 'POST', {
          gameId: form.dataset.createGame,
          mode: allBots ? 'bot' : mode.value,
          ...(botSeats ? { botSeats } : {}),
          difficulty: form.elements.difficulty.value,
          turnSeconds: Number(form.elements.turnSeconds.value),
          ...(form.elements.capacity
            ? { capacity: Number(form.elements.capacity.value) }
            : {}),
          usePhoto: form.elements.usePhoto?.checked || false,
          ...(form.elements.level
            ? {
                level: form.elements.level.value,
                imageId: form.elements.imageId?.value || undefined,
              }
            : {}),
          targetId,
        });
        sharedInvitation = result.invitation;
        await navigate(`/mesa/${result.room.id}`);
      });
    };
  });
}

function renderInvitation() {
  if (!me.name) return renderWelcome();
  setContent(`<section class="centered"><p class="eyebrow">UM CONVITE PARA VOCÊ</p><div class="card invitation-card">${avatar(invitation.owner, true)}
    <h1>${e(invitation.owner.name)} convidou você.</h1><p class="intro">Vamos jogar ${e(invitation.gameName)}?</p>
    <div class="safety"><strong>Você conhece essa pessoa?</strong><p>Confira o nome e a foto. Se não reconhecer, fale com seu familiar antes de entrar.</p></div>
    <p>Você vai entrar como <strong>${e(me.name)}</strong>.</p>
    <button id="join-room" class="primary" ${enabledGameIds(me).includes(invitation.gameId) ? '' : 'disabled'}>${invitation.isOwner ? 'Voltar à minha mesa' : 'Entrar na partida'} <span aria-hidden="true">→</span></button>
    ${enabledGameIds(me).includes(invitation.gameId) ? '' : '<p>Ative este jogo no painel do familiar para entrar.</p>'}
    <p class="fine">Convite válido até ${new Date(invitation.expires).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Sem pagamentos ou instalações.</p>
  </div></section>`);
  document.querySelector('#join-room').onclick = () =>
    perform(async () => {
      if (invitation.isOwner) return navigate(`/mesa/${invitation.roomId}`);
      const token = location.pathname.split('/')[2];
      const result = await api(`/invitations/${token}/join`, 'POST', {});
      history.replaceState(null, '', `/mesa/${result.id}`);
      await route();
    });
}

function invitationControls() {
  if (!sharedInvitation || sharedInvitation.expires <= Date.now())
    return '<button id="new-invitation" class="primary">Gerar convite para o familiar</button>';
  const link = `${location.origin}/entrar/${sharedInvitation.token}`;
  return `<label class="invite-link-label">Link do convite<input id="invite-link" readonly value="${e(link)}"></label>
    <div class="button-row"><button id="copy-invitation" class="primary">Copiar convite</button><a class="button secondary" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(`Oi! Vamos jogar ${gameCatalog.find((game) => game.id === room.gameId).name}? Sou ${me.name}. É só abrir este convite: ${link}`)}">Enviar pelo WhatsApp</a></div>
    <p class="fine">O link vale por até 2 horas e permite uma entrada. Envie somente para quem você conhece.</p>`;
}

// Jogos de vários jogadores aceitam bots nos lugares vazios; os individuais não.
function canFillRoom() {
  const game = gameCatalog.find((item) => item.id === room.gameId);
  return (
    game && !game.solo && room.mode === 'online' && room.status === 'WAITING'
  );
}

function renderWaiting() {
  const owner = room.ownerId === me.id;
  setContent(`<section class="centered"><p class="eyebrow">${e(gameCatalog.find((game) => game.id === room.gameId).name)} EM FAMÍLIA</p><div class="card waiting-card">
    <p>${room.players.length} de ${room.capacity} participantes confirmados.</p>
    <p id="missing-seats" class="fine">${room.capacity - room.players.length === 1 ? 'Falta 1 lugar.' : `Faltam ${room.capacity - room.players.length} lugares.`}${owner && me.phoneLinked ? ' Para chamar amigos pelo WhatsApp, mande <strong>convite</strong> ou <strong>chamar</strong> ao bot.' : ''}</p><div class="lobby-players">${room.players.map((player, i) => `<span>${e(player.name)}${botTag(player)}${room.gameId === 'cards' ? ` · Equipe ${i % 2 === 0 ? 'A' : 'B'}` : ''}</span>`).join('')}</div>
    <div class="person">${avatar(room.owner, true)}<div><h1>${owner ? 'Sua mesa está pronta.' : `A mesa de ${e(room.owner.name)}.`}</h1><p>${owner ? 'Agora só falta a boa companhia.' : 'Falta só confirmar a sua entrada.'}</p></div></div>
    ${owner && room.pending ? `<div class="approval"><h2>É o seu familiar?</h2><div class="person">${avatar(room.pending, true)}<strong>${e(room.pending.name)}</strong></div><p>Confirme apenas se reconhecer essa pessoa. Ela será adicionada aos seus contatos autorizados.</p><div class="button-row"><button id="approve-player" class="primary">Sim, conheço. Começar</button><button id="reject-player" class="secondary">Não conheço</button></div></div>` : owner ? `<h2>Convide alguém para jogar</h2><p>Envie um convite por pessoa. Confirme a entrada e gere o próximo até completar os ${room.capacity} lugares.</p>${invitationControls()}` : `<div class="waiting-symbol" aria-hidden="true">⋯</div><h2>${room.approved ? 'Aguardando os participantes' : 'Aguardando o familiar'}</h2><p>${room.approved ? 'Sua entrada foi confirmada. A mesa começa quando todos os lugares estiverem ocupados.' : 'Quem convidou vai confirmar seu nome e sua foto. A partida começa assim que vocês estiverem prontos.'}</p>`}
    ${canFillRoom() ? `<p class="fine">Se faltar gente, bots completam a mesa em poucos minutos${owner ? ' ou assim que você pedir' : ''}.</p>${owner ? '<button id="fill-room" class="secondary">Começar já, com bots nos lugares vazios</button>' : ''}` : ''}
    <p class="connection" role="status">${connected ? '● Conectado à mesa' : 'Reconectando à mesa…'}</p><button id="leave-room" class="quiet">${owner ? 'Encerrar esta mesa' : 'Cancelar minha entrada'}</button>
  </div></section>`);
  document.querySelector('#fill-room')?.addEventListener('click', () =>
    perform(async () => {
      room = await api(`/rooms/${room.id}/fill`, 'POST', {});
      renderRoom();
    })
  );
  document.querySelector('#approve-player')?.addEventListener('click', () =>
    perform(async () => {
      room = await api(`/rooms/${room.id}/approve`, 'POST', {
        playerId: room.pending.id,
      });
      sharedInvitation = null;
      me = await api('/me');
      renderRoom();
    })
  );
  document.querySelector('#reject-player')?.addEventListener('click', () =>
    perform(async () => {
      room = await api(`/rooms/${room.id}/reject`, 'POST', {
        playerId: room.pending.id,
      });
      sharedInvitation = null;
      renderRoom();
      notify('Entrada recusada. Gere um novo convite para o seu familiar.');
    })
  );
  document.querySelector('#new-invitation')?.addEventListener('click', () =>
    perform(async () => {
      sharedInvitation = await api(`/rooms/${room.id}/invite`, 'POST', {});
      renderRoom();
    })
  );
  document.querySelector('#copy-invitation')?.addEventListener('click', () =>
    perform(async () => {
      const input = document.querySelector('#invite-link');
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(input.value);
        notify('Convite copiado. Agora envie ao seu familiar.');
      } else {
        input.select();
        notify('O link está selecionado. Copie e envie ao seu familiar.');
      }
    })
  );
  document.querySelector('#leave-room').onclick = owner
    ? confirmClose
    : confirmLeave;
}

function sidesFor(board, tile) {
  if (!board.length) return ['right'];
  const sides = [];
  if ([tile.a, tile.b].includes(board[0].a)) sides.push('left');
  if ([tile.a, tile.b].includes(board.at(-1).b)) sides.push('right');
  return sides;
}

const playerName = (id) =>
  room.players.find((player) => player.id === id)?.name ?? 'Alguém';

function gameStatus() {
  const game = room.game;
  if (game.status === 'FINISHED') {
    const winner = room.players.find(
      (player) => player.id === game.result.winnerId
    );
    return winner
      ? `${winner.id === me.id ? 'Você ganhou' : `${winner.name} ganhou`} a rodada!`
      : 'A rodada terminou empatada.';
  }
  if (!connected) return 'Reconectando… Suas peças estão guardadas.';
  return game.currentPlayerId === me.id
    ? 'É a sua vez de jogar.'
    : `Agora é a vez de ${playerName(game.currentPlayerId)}.`;
}

// Lugares ao redor da mesa: você embaixo e os outros em sentido horário.
const SEAT_POSITIONS = {
  2: ['top'],
  3: ['left', 'right'],
  4: ['left', 'top', 'right'],
};

function dominoSeat(player, game, position) {
  const active =
    game.currentPlayerId === player.id && game.status === 'PLAYING';
  const count = game.handCounts[player.id];
  const backs = Array.from(
    { length: Math.min(count, 7) },
    () => '<span class="d-back"></span>'
  ).join('');
  return `<div class="d-seat d-${position}${active ? ' active-player' : ''}">${avatar(player)}<span class="seat-time" aria-hidden="true"></span><div class="d-info"><strong>${e(player.name)}</strong><small>${count} peça(s) · ${game.score[player.id].points} pt${room.online[player.id] ? '' : ' · sem conexão'}</small></div><span class="d-backs" aria-hidden="true">${backs}</span></div>`;
}

let justDragged = false;
let boardScroll = null;

// A mesa é um mapa: o dedo (ou o mouse) arrasta para os lados e, a cada
// jogada, ela rola sozinha até a peça nova.
function setupBoardPan() {
  const board = document.querySelector('.d-board-wrap .board');
  if (!board) return;
  const lastId = room.game.history.findLast?.(
    (item) => item.type === 'play'
  )?.tile;
  const lastEl = lastId && board.querySelector(`[data-motion="b-${lastId}"]`);
  if (lastEl && boardScroll?.last !== lastId)
    board.scrollLeft =
      lastEl.offsetLeft - board.clientWidth / 2 + lastEl.offsetWidth / 2;
  else if (boardScroll) board.scrollLeft = boardScroll.left;
  boardScroll = { last: lastId, left: board.scrollLeft };
  board.addEventListener('scroll', () => {
    boardScroll.left = board.scrollLeft;
  });
  let startX = null;
  let startLeft = 0;
  board.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') return;
    startX = event.clientX;
    startLeft = board.scrollLeft;
    board.classList.add('panning');
  });
  window.addEventListener('pointermove', (event) => {
    if (startX !== null)
      board.scrollLeft = startLeft - (event.clientX - startX);
  });
  window.addEventListener('pointerup', () => {
    startX = null;
    board.classList.remove('panning');
  });
}

// Arrastar uma peça da mão até a mesa (mouse, toque ou caneta). Tocar na peça
// continua funcionando; soltar na metade esquerda ou direita escolhe a ponta.
function setupDrag(game, playable, drop) {
  const wrap = document.querySelector('.d-board-wrap');
  if (!wrap) return;
  document.querySelectorAll('.tile-button.playable').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      if (event.button > 0) return;
      const tile = game.hand.find((item) => item.id === button.dataset.tile);
      const sides = playable(tile);
      const startX = event.clientX;
      const startY = event.clientY;
      let ghost = null;
      let side = null;
      const sideAt = (x, y) => {
        const rect = wrap.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
          return null;
        const wanted = x < rect.left + rect.width / 2 ? 'left' : 'right';
        return sides.includes(wanted) ? wanted : sides[0];
      };
      const move = (moved) => {
        if (!ghost) {
          if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < 8)
            return;
          ghost = button.querySelector('.tile').cloneNode(true);
          ghost.classList.add('drag-ghost');
          document.body.append(ghost);
          document.body.classList.add('dragging');
          wrap.dataset.valid = sides.join(' ');
        }
        ghost.style.left = `${moved.clientX}px`;
        ghost.style.top = `${moved.clientY}px`;
        side = sideAt(moved.clientX, moved.clientY);
        wrap.dataset.over = side ?? '';
      };
      const end = (finished) => {
        button.removeEventListener('pointermove', move);
        button.removeEventListener('pointerup', end);
        button.removeEventListener('pointercancel', end);
        document.body.classList.remove('dragging');
        delete wrap.dataset.over;
        delete wrap.dataset.valid;
        if (!ghost) return;
        ghost.remove();
        justDragged = true;
        setTimeout(() => (justDragged = false), 60);
        if (finished.type === 'pointerup' && side) drop(tile.id, side);
      };
      button.setPointerCapture?.(event.pointerId);
      button.addEventListener('pointermove', move);
      button.addEventListener('pointerup', end);
      button.addEventListener('pointercancel', end);
    });
  });
}

function renderPlaying() {
  const game = room.game;
  const myTurn =
    game.currentPlayerId === me.id && game.status === 'PLAYING' && connected;
  const playable = (tile) => sidesFor(game.board, tile);
  const hasMove = game.hand.some((tile) => playable(tile).length);
  if ((selected && !game.hand.some((tile) => tile.id === selected)) || !myTurn)
    selected = null;
  const chosen = game.hand.find((tile) => tile.id === selected);
  const status = gameStatus();
  const last = game.history.at(-1);
  const lastText = !last
    ? 'A primeira peça pode ser qualquer uma.'
    : `${playerName(last.playerId)} ${last.type === 'play' ? `jogou ${last.tile.replace('-', ' e ')}` : last.type === 'draw' ? 'comprou uma peça' : 'passou a vez'}.`;
  const order = game.playerIds;
  const start = order.indexOf(me.id);
  const others = order
    .map((_, i) => order[(start + i) % order.length])
    .slice(1)
    .map((id) => room.players.find((player) => player.id === id));
  const seats = others
    .map((player, i) =>
      dominoSeat(player, game, SEAT_POSITIONS[order.length][i])
    )
    .join('');
  const leftEnd = game.board.length ? game.board[0].a : '';
  const rightEnd = game.board.length ? game.board.at(-1).b : '';
  setContent(`<section class="game-page dgame game-screen">
    ${screenBar({ title: 'Dominó' })}
    ${gameSheet({ connected, readId: 'read-hand', readLabel: 'Ler minhas peças em voz alta', info: `<strong>Dominó</strong> · ${room.turn ? `${room.turnSeconds} s por jogada` : 'Sem pressa'} · ${game.score[me.id].points} pt` })}
    <div id="turn-status" tabindex="-1" class="turn-banner${myTurn ? ' my-turn' : ''}" role="status" aria-live="polite"><strong>${e(status)}</strong><span>${game.status === 'FINISHED' ? `Pontos nesta rodada: ${game.result.points}. ${game.result.reason === 'blocked' ? 'A mesa ficou fechada.' : 'Todas as peças foram jogadas.'}` : myTurn ? 'Toque numa peça ou arraste até a mesa.' : 'Aguarde a sua vez.'}</span></div>
    <div class="dtable" data-players="${order.length}">${seats}
      <section class="table d-board-wrap" aria-label="Peças na mesa">
        <div class="board${myTurn && hasMove ? ' can-play' : ''}${chosen ? ' choosing' : ''}" role="list" aria-label="Sequência de peças, da esquerda para a direita">${game.board.length ? game.board.map((tile, i) => `<span data-motion="b-${tile.id}" class="board-tile${i === 0 || i === game.board.length - 1 ? ' open-end' : ''}" role="listitem" aria-label="Peça ${i + 1}: ${tile.a} e ${tile.b}">${tileMarkup(tile)}</span>`).join('') : '<div class="empty-table"><span aria-hidden="true">⠿</span><p>A primeira peça começa<br>uma boa companhia.</p></div>'}</div>
        <div class="drop-zone drop-left" aria-hidden="true"><span>← ${leftEnd}</span></div><div class="drop-zone drop-right" aria-hidden="true"><span>${rightEnd || 'Solte aqui'} →</span></div>
      </section>
    </div>
    <p class="table-ends">${game.board.length ? `Pontas abertas: <strong>${leftEnd}</strong> e <strong>${rightEnd}</strong> · ${game.board.length} peça(s) na mesa` : 'Mesa vazia.'}</p>
    <p class="last-action">${e(lastText)}</p>
    ${
      game.status === 'FINISHED'
        ? `<section class="card result-card"><h2>Que tal mais uma?</h2><p>${game.result.reason === 'blocked' ? `Soma das peças: ${room.players.map((player) => `${e(player.name)} ${game.result.totals[player.id]}`).join(' · ')}.` : 'A melhor parte é jogar juntos.'}</p><button id="rematch" class="primary" ${game.rematch.includes(me.id) || !connected ? 'disabled' : ''}>${game.rematch.includes(me.id) ? 'Aguardando os outros…' : 'Jogar novamente'}</button>${game.rematch.length && !game.rematch.includes(me.id) ? '<p>Alguém quer jogar outra rodada.</p>' : ''}</section>`
        : `<section class="hand-section" aria-labelledby="hand-title"><div class="section-heading"><h2 id="hand-title">Suas peças <span class="muted">(${game.hand.length})</span></h2><span class="muted">${game.stockCount} para comprar</span></div>
      <div class="hand">${game.hand.map((tile) => `<button id="tile-${tile.id}" data-motion="h-${tile.id}" class="tile-button${myTurn && playable(tile).length ? ' playable' : ''}${tile.id === selected ? ' selected' : ''}" data-tile="${tile.id}" aria-label="${tileLabel(tile)}. ${playable(tile).length ? 'Encaixa na mesa.' : 'Não encaixa na mesa.'}" aria-pressed="${tile.id === selected}" ${myTurn && playable(tile).length ? '' : 'disabled'}>${tileMarkup(tile, { vertical: true })}<span class="tile-caption">${myTurn && playable(tile).length ? '✓ ' : ''}${tile.a} · ${tile.b}</span></button>`).join('')}</div>
      ${
        chosen
          ? `<div class="place-choice"><p>Onde colocar a peça <strong>${chosen.a} e ${chosen.b}</strong>?</p><div class="button-row">${playable(
              chosen
            )
              .map(
                (side) =>
                  `<button id="place-${side}" class="primary" data-side="${side}">${side === 'left' ? '← Na ponta esquerda' : 'Na ponta direita →'}</button>`
              )
              .join(
                ''
              )}<button id="cancel-selection" class="quiet">Escolher outra peça</button></div></div>`
          : ''
      }
      ${game.status === 'PLAYING' && !myTurn ? `<button class="primary wait-button" disabled>Aguarde a vez de ${e(playerName(game.currentPlayerId))}</button>` : ''}
      ${myTurn && !hasMove ? `<div class="draw-row"><p>Nenhuma peça encaixa agora.</p><button id="draw-pass" class="primary">${game.stockCount ? 'Comprar uma peça' : 'Passar a vez'}</button></div>` : ''}
    </section>`
    }
  </section>`);
  setupBoardPan();
  setupDrag(game, playable, (tileId, side) =>
    perform(() => sendAction({ type: 'play', tileId, side }))
  );
  if (myTurn && game.status === 'PLAYING')
    document
      .querySelector('.game-page')
      ?.insertAdjacentHTML(
        'beforeend',
        turnSign(`${room.id}:${room.revision}`, true)
      );
  bindGameMenu();
  document.querySelector('#leave-room').onclick = confirmLeave;
  document.querySelector('#game-help').onclick = showHelp;
  document.querySelector('#read-hand').onclick = () => {
    if (!('speechSynthesis' in window))
      return notify('Este navegador não oferece leitura em voz alta.');
    speak(
      `${status} Suas peças são: ${game.hand.map((tile) => `${tile.a} e ${tile.b}`).join('; ')}.`,
      true
    );
  };
  document.querySelectorAll('[data-tile]').forEach((button) => {
    button.onclick = () => {
      if (busy || !myTurn || justDragged) return;
      const tile = game.hand.find((tile) => tile.id === button.dataset.tile);
      const sides = playable(tile);
      if (sides.length === 1)
        perform(() =>
          sendAction({ type: 'play', tileId: tile.id, side: sides[0] })
        );
      else {
        selected = tile.id;
        renderRoom();
        document.querySelector('[data-side]')?.focus();
      }
    };
  });
  document.querySelectorAll('[data-side]').forEach((button) => {
    button.onclick = () =>
      perform(() =>
        sendAction({
          type: 'play',
          tileId: selected,
          side: button.dataset.side,
        })
      );
  });
  document.querySelector('#cancel-selection')?.addEventListener('click', () => {
    selected = null;
    renderRoom();
  });
  document
    .querySelector('#draw-pass')
    ?.addEventListener('click', () =>
      perform(() => sendAction({ type: game.stockCount ? 'draw' : 'pass' }))
    );
  document.querySelector('#rematch')?.addEventListener('click', () =>
    perform(async () => {
      room = await api(`/rooms/${room.id}/rematch`, 'POST', {
        revision: room.revision,
      });
      renderRoom();
    })
  );
  if (announced !== status) {
    announced = status;
    speak(status, me.preferences.speech);
  }
}

async function sendAction(action) {
  room = await api(`/rooms/${room.id}/action`, 'POST', {
    ...action,
    revision: room.revision,
  });
  selected = null;
  renderRoom();
  document.querySelector('#turn-status')?.focus({ preventScroll: true });
}

function confirmClose() {
  const dialog = openDialog(
    'Encerrar esta mesa?',
    '<p>A mesa será encerrada para todos os participantes. Você pode criar uma nova quando quiser.</p><div class="button-row"><button id="confirm-close" class="primary">Sim, encerrar para todos</button><button id="stay" class="secondary">Continuar na mesa</button></div>'
  );
  dialog.querySelector('#stay').onclick = () => dialog.close();
  dialog.querySelector('#confirm-close').onclick = () =>
    perform(async () => {
      await api(`/rooms/${room.id}/close`, 'POST', {});
      dialog.close();
      await navigate('/');
    });
}

function manageDialog() {
  const people = room.players.filter(
    (player) => !player.bot && player.id !== me.id && player.seat !== 'removed'
  );
  const dialog = openDialog(
    'Retirar alguém da mesa',
    people.length
      ? `<p>A pessoa retirada perde o lugar, um bot assume o jogo dela e ela não volta a esta mesa.</p><ul class="remove-list">${people.map((player) => `<li><span>${e(player.name)}</span><button class="secondary" data-remove="${player.id}">Retirar</button></li>`).join('')}</ul>`
      : '<p>Não há outra pessoa na mesa.</p>'
  );
  dialog.querySelectorAll('[data-remove]').forEach((button) => {
    button.onclick = () => {
      const target = people.find(
        (player) => player.id === button.dataset.remove
      );
      if (!window.confirm(`Retirar ${target.name} da mesa?`)) return;
      perform(async () => {
        room = await api(`/rooms/${room.id}/remove`, 'POST', {
          playerId: target.id,
        });
        dialog.close();
        renderRoom();
      });
    };
  });
}

// Lugares ausentes, avisos da mesa e ferramentas do dono.
function mountSeatInfo() {
  const page = main.querySelector('.game-page');
  if (!page || !room.game || !room.approved) return;
  const notes = room.players
    .filter((player) => ['away', 'removed'].includes(player.seat))
    .map(
      (player) =>
        `${e(player.name)} (${player.seat === 'away' ? 'ausente' : 'retirado(a)'}): um bot joga neste lugar`
    );
  if (room.notice?.text) notes.unshift(e(room.notice.text));
  const info = document.createElement('div');
  info.className = 'seat-info';
  info.setAttribute('role', 'status');
  info.innerHTML = notes.map((note) => `<p>${note}</p>`).join('');
  if (notes.length) page.querySelector('.screen-bar, .truco-top')?.after(info);
  if (room.ownerId === me.id && room.status === 'PLAYING') {
    const tools = document.createElement('div');
    tools.className = 'owner-tools';
    const others = room.players.some(
      (player) =>
        !player.bot && player.id !== me.id && player.seat !== 'removed'
    );
    tools.innerHTML = `${others ? '<button id="manage-players" class="quiet">Retirar jogador</button>' : ''}<button id="close-room" class="quiet">Encerrar mesa</button>`;
    page.querySelector('#menu-owner')?.append(tools);
    tools
      .querySelector('#manage-players')
      ?.addEventListener('click', manageDialog);
    tools.querySelector('#close-room').onclick = confirmClose;
  }
}

function confirmLeave() {
  const waiting = room.status === 'WAITING';
  const dialog = openDialog(
    'Sair desta mesa?',
    waiting
      ? '<p>Seu lugar será liberado.</p><div class="button-row"><button id="confirm-leave" class="primary">Sim, sair</button><button id="stay" class="secondary">Continuar na mesa</button></div>'
      : '<p>Um bot vai jogar no seu lugar e a mesa continua para os outros. Se voltar a esta página, você continua de onde o bot parou.</p><div class="button-row"><button id="confirm-leave" class="primary">Sim, sair</button><button id="stay" class="secondary">Continuar na mesa</button></div>'
  );
  dialog.querySelector('#stay').onclick = () => dialog.close();
  dialog.querySelector('#confirm-leave').onclick = () =>
    perform(async () => {
      await api(`/rooms/${room.id}/leave`, 'POST', {});
      dialog.close();
      await navigate('/');
    });
}

function renderRoom() {
  queueMicrotask(() => animateNew(main, room?.id));
  room.receivedAt ??= Date.now();
  stopTurnTimer();
  main.querySelector('.seat-info')?.remove();
  if (room.status === 'CLOSED') {
    stream?.close();
    setContent(
      room.closedReason === 'inactive'
        ? '<section class="centered card"><h1>Essa partida foi cancelada por falta de jogadores.</h1><p>Ninguém ficou na mesa por 5 minutos. Para jogar de novo, crie uma nova partida.</p><a class="button primary" href="/">Criar outra partida</a></section>'
        : '<section class="centered card"><h1>A mesa foi encerrada.</h1><p>Obrigado pela companhia. Vocês podem jogar juntos outra vez.</p><a class="button primary" href="/">Voltar ao início</a></section>'
    );
  } else if (room.game && room.approved) {
    if (room.gameId === 'domino') renderPlaying();
    else {
      const status = renderAdditionalGame({
        room,
        me,
        connected,
        setContent,
        perform,
        onAction: sendAction,
        onLeave: confirmLeave,
        // Depois de um redesenho só local (ex.: escolher carta), recoloca relógio e avisos.
        onRedraw: mountExtras,
        onRematch: async (extra = {}) => {
          room = await api(`/rooms/${room.id}/rematch`, 'POST', {
            revision: room.revision,
            ...extra,
          });
          renderRoom();
        },
      });
      if (announced !== status) {
        announced = status;
        speak(status, me.preferences.speech);
      }
    }
  } else renderWaiting();
  mountExtras();
}

function mountExtras() {
  const page = main.querySelector('.game-page');
  if (page && room.game && room.approved)
    mountTurnTimer({ room, me, container: page, receivedAt: room.receivedAt });
  main.querySelector('.seat-info')?.remove();
  mountSeatInfo();
}

function connectRoom() {
  connected = false;
  const events = new EventSource(`/api/rooms/${room.id}/events`);
  stream = events;
  events.onmessage = (event) => {
    if (stream !== events) return;
    const latest = JSON.parse(event.data);
    if (latest.revision < room.revision) return;
    connected = true;
    room = latest;
    renderRoom();
  };
  events.onerror = async () => {
    if (stream !== events) return;
    connected = false;
    renderRoom();
    try {
      await api(`/rooms/${room.id}`);
    } catch (error) {
      if (stream !== events || ![403, 404, 410].includes(error.status)) return;
      events.close();
      setContent(
        `<section class="centered card"><h1>Esta mesa não está mais disponível.</h1><p>${e(error.message)}</p><a class="button primary" href="/">Voltar ao início</a></section>`
      );
    }
  };
  events.addEventListener('removed', () => {
    if (stream !== events) return;
    events.close();
    setContent(
      '<section class="centered card"><h1>O dono da mesa retirou você desta partida.</h1><p>Você pode entrar em outras mesas normalmente.</p><a class="button primary" href="/">Voltar ao início</a></section>'
    );
  });
  events.addEventListener('revoked', () => {
    if (stream !== events) return;
    events.close();
    setContent(
      '<section class="centered card"><h1>A entrada não foi confirmada.</h1><p>Fale com seu familiar e peça um novo convite.</p><a class="button primary" href="/">Voltar ao início</a></section>'
    );
  });
}

async function route() {
  stream?.close();
  stream = null;
  room = null;
  selected = null;
  const path = location.pathname;
  me = await api('/me');
  applyPreferences(me.preferences);
  if (path.startsWith('/entrar/')) {
    invitation = await api(`/invitations/${path.split('/')[2]}`);
    renderInvitation();
  } else if (path.startsWith('/mesa/')) {
    room = await api(`/rooms/${path.split('/')[2]}`);
    renderRoom();
    if (room.status !== 'CLOSED') connectRoom();
  } else {
    invitation = null;
    sharedInvitation = null;
    me.name ? renderHome() : renderWelcome();
  }
}

document.querySelector('#help-button').onclick = () =>
  showHelp(room?.gameId || invitation?.gameId);
document.querySelector('#accessibility-button').onclick = () => {
  if (!me?.name)
    return notify('Informe seu nome para salvar suas preferências.');
  showAccessibility(me, saveProfile);
};
document.querySelector('#family-button').onclick = async () => {
  if (!me?.name) return notify('Informe seu nome para configurar o perfil.');
  try {
    me = await api('/me');
    showFamilyPanel(me, saveProfile, async (id) => {
      await api(`/contacts/${id}`, 'DELETE');
      me = await api('/me');
      if (!room) renderHome();
    });
  } catch (error) {
    notify(error.message, true);
  }
};
window.addEventListener('popstate', () => perform(route));
window.addEventListener('offline', () =>
  notify('Você está sem conexão. Vamos tentar reconectar à mesa.', true)
);
route().catch((error) => {
  setContent(
    `<section class="centered card"><h1>Não foi possível abrir esta mesa.</h1><p>${e(error.message)}</p><a class="button primary" href="/">Voltar ao início</a></section>`
  );
});
