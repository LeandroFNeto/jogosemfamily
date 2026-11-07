import {
  escapeHtml as e,
  avatar,
  botTag,
  showHelp,
  turnSign,
  callSign,
  menuButton,
  gameSheet,
  screenBar,
  bindGameMenu,
} from '/components.mjs';
import { gameCatalog } from '/games.mjs';
import { speak } from '/accessibility.mjs';
import {
  BACK_LABEL,
  cardBackSvg,
  cardLabel,
  cardSvg,
  manilhaRank,
  rankName,
} from '/art.mjs';

/**
 * Regra da cruz (padrão ocidental, vale para todo jogo de mesa): quem vê a tela
 * fica embaixo e a vez segue no sentido horário: esquerda, topo, direita.
 */
export const CROSS_PLACES = {
  1: ['bottom'],
  2: ['bottom', 'top'],
  3: ['bottom', 'left', 'right'],
  4: ['bottom', 'left', 'top', 'right'],
};
export function crossOrder(players, playerIds, meId) {
  const ids = playerIds?.length ? playerIds : players.map((p) => p.id);
  const start = Math.max(0, ids.indexOf(meId));
  const places = CROSS_PLACES[ids.length] || CROSS_PLACES[4];
  return ids
    .map((_, i) => ids[(start + i) % ids.length])
    .map((id, i) => ({
      player: players.find((p) => p.id === id),
      place: places[i] || 'top',
    }))
    .filter((seat) => seat.player);
}

export function gameSetupFields(game, me) {
  return `<label>Modo de jogo<select name="mode" id="mode-${game.id}">${game.solo ? '<option value="solo">Jogar sozinho</option>' : ''}<option value="online">${game.solo ? 'Em grupo, com familiares' : `Com familiar${game.capacities ? 'es' : ''}`}</option>${game.solo ? '' : '<option value="bot">Contra o bot</option>'}</select></label>
    <input type="hidden" name="difficulty" value="medium">
    <label data-turn-option>Tempo para cada jogada<select name="turnSeconds" id="turn-${game.id}"><option value="60" selected>60 segundos</option><option value="30">30 segundos</option><option value="90">90 segundos</option><option value="0">Sem limite de tempo</option></select></label>
    ${game.capacities ? `${game.capacities.length > 1 ? `<label>Participantes no total<select name="capacity">${game.capacities.map((n) => `<option value="${n}">${n} participantes</option>`).join('')}</select></label>` : `<input type="hidden" name="capacity" value="${game.capacities[0]}"><p class="fine">Mesa de ${game.capacities[0]} jogadores${game.id === 'cards' ? ' (2 contra 2)' : ''}. Se faltar gente, bots completam a mesa.</p>`}` : ''}
    ${game.id === 'wordsearch' ? '<label>Dificuldade do caça-palavras<select name="level"><option value="easy">Fácil (8×8, 6 palavras)</option><option value="medium">Média (12×12, 10 palavras)</option><option value="hard">Difícil (15×15, 14 palavras)</option></select></label>' : ''}
    ${game.id === 'puzzle' ? '<label>Dificuldade do quebra-cabeça<select name="level"><option value="easy">Fácil (9 partes)</option><option value="medium">Média (16 partes)</option><option value="hard">Difícil (25 partes)</option></select></label><label>Imagem<select name="imageId"><option value="">Sortear uma imagem</option></select></label>' : ''}
    ${game.id === 'puzzle' && me.photo ? '<label class="check"><input type="checkbox" name="usePhoto"> Usar minha foto na imagem</label>' : ''}`;
}

export { cardLabel };
function cardMarkup(card, { manilha = false } = {}) {
  return `<span class="playing-card${manilha ? ' manilha' : ''}" aria-hidden="true">${cardSvg(card)}</span>`;
}
const backMarkup = () =>
  `<span class="playing-card card-back" role="img" aria-label="${BACK_LABEL}">${cardBackSvg()}</span>`;

let uiRoom = '';
let uiRevision = -1;
let selectedPiece = null;
let selectedWord = '';
let answerDraft = '';
let cwCursor = 0;
// Letras da resposta, uma por casa (vazio quando a casa está livre).
const draftLetters = (length) =>
  Array.from({ length }, (_, i) => {
    const char = answerDraft[i] ?? '';
    return /\p{L}/u.test(char) ? char.toLocaleUpperCase('pt-BR') : '';
  });
const packLetters = (letters) => letters.map((l) => l || ' ').join('');
cwCursor = 0;
let showNumbers = false;
let wordStart = null;
let wordDraft = '';
let dragFrom = null;
let cwGame = null;
let dragMoved = false;
let selectedCard = null;
let cardDrag = null;
let cardJustDragged = false;

function crosswordMarkup(game, enabled) {
  const cells = Array.from({ length: game.rows * game.columns }, () => null);
  for (const word of game.words) {
    for (let i = 0; i < word.length; i++) {
      const row = word.row + (word.direction === 'vertical' ? i : 0);
      const col = word.column + (word.direction === 'horizontal' ? i : 0);
      const index = row * game.columns + col;
      cells[index] ??= { letter: '', number: '' };
      if (i === 0) cells[index].number = word.number;
      if (word.answer) cells[index].letter = word.answer[i];
    }
  }
  const remaining = game.words.filter((word) => !game.solved.includes(word.id));
  if (!remaining.some((word) => word.id === selectedWord)) {
    selectedWord = remaining[0]?.id || '';
    answerDraft = '';
    cwCursor = 0;
  }
  const chosen = remaining.find((word) => word.id === selectedWord);
  cwGame = game;
  const active = new Map();
  if (chosen)
    for (let i = 0; i < chosen.length; i++) {
      const row = chosen.row + (chosen.direction === 'vertical' ? i : 0);
      const col = chosen.column + (chosen.direction === 'horizontal' ? i : 0);
      active.set(row * game.columns + col, i);
    }
  const letters = draftLetters(chosen?.length ?? 0);
  const cursor = Math.min(cwCursor, Math.max(0, (chosen?.length ?? 1) - 1));
  const gridHtml = Array.from(
    { length: game.rows },
    (_, row) =>
      `<div role="row" class="crossword-row">${cells
        .slice(row * game.columns, (row + 1) * game.columns)
        .map((cell, col) => {
          if (!cell)
            return '<span class="crossword-block" role="cell" aria-label="Sem letra"></span>';
          const index = row * game.columns + col;
          const pos = active.get(index);
          const typed =
            pos !== undefined && !cell.letter ? (letters[pos] ?? '') : '';
          const label = `Linha ${row + 1}, coluna ${col + 1}: ${cell.letter || 'vazia'}${cell.number ? ', início da pista ' + cell.number : ''}`;
          return `<button type="button" role="cell" class="crossword-cell${pos !== undefined ? ' in-word' : ''}${pos !== undefined && pos === cursor ? ' cursor' : ''}" data-cw-row="${row}" data-cw-col="${col}" aria-label="${label}" ${enabled ? '' : 'disabled'}><small aria-hidden="true">${cell.number}</small><b aria-hidden="true">${cell.letter || e(typed)}</b></button>`;
        })
        .join('')}</div>`
  ).join('');
  return `<section class="crossword-layout"><div>${chosen ? `<div class="cw-active" aria-live="polite"><span class="cw-badge">${chosen.number} ${chosen.direction === 'vertical' ? '↓' : '→'}</span><span>${e(chosen.clue)} <small>(${chosen.length} letras)</small></span></div>` : ''}<h2>${e(game.title)}</h2><div class="crossword-grid" role="table" aria-label="Grade de palavras cruzadas" style="grid-template-columns:repeat(${game.columns},minmax(0,1fr))">${gridHtml}</div><p class="fine">Toque num quadrado, veja a dica no alto e digite a palavra direto. As letras aparecem na grade. Acentos não são obrigatórios.</p></div>
    <div class="card clue-card">${remaining.length ? `<form id="answer-form" class="stack"><label>Escolha uma pista<select id="word-choice">${remaining.map((word) => `<option value="${word.id}" ${word.id === selectedWord ? 'selected' : ''}>${word.number} · ${word.direction} · ${word.length} letras</option>`).join('')}</select></label><p id="word-clue"><strong>${e(chosen.clue)}</strong></p><div id="crossword-answer" class="answer-boxes" role="group" aria-label="Sua resposta" aria-describedby="word-clue">${letters.map((letter, i) => `<input class="answer-box${i === cursor ? ' cursor' : ''}" data-i="${i}" value="${e(letter)}" maxlength="2" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Letra ${i + 1} de ${letters.length}" ${enabled ? '' : 'disabled'}>`).join('')}</div><p class="fine" id="answer-hint">Digite as letras, toque numa casa para trocar ou apague. Enter confere a palavra.</p><button class="primary" type="submit" ${enabled ? '' : 'disabled'}>Conferir palavra</button></form>${game.feedback?.correct === false && game.feedback.playerId ? '<p role="status">Ainda não é essa palavra. Confira a pista na sua próxima vez.</p>' : ''}` : '<h3>Todas as palavras foram encontradas!</h3>'}
    <h3 class="solved-heading">Palavras encontradas: ${game.solved.length} de ${game.words.length}</h3><ul class="solved-words">${
      game.words
        .filter((word) => word.answer)
        .map((word) => `<li>${word.number} · ${e(word.answer)}</li>`)
        .join('') || '<li>Vamos descobrir a primeira?</li>'
    }</ul></div></section>`;
}

// Peça de quebra-cabeça com encaixes: o desenho das pontas depende só da
// peça, então as peças se encaixam de verdade quando estão no lugar certo.
const flagV = (r, c) => ((r * 5 + c * 3) % 2 ? 1 : -1);
const flagH = (r, c) => ((r * 3 + c * 7 + 1) % 2 ? 1 : -1);
function jigsawEdge(x1, y1, x2, y2, flag) {
  if (!flag) return `L${x2} ${y2}`;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const point = (t, h) =>
    `${(x1 + dx * t + dy * h * flag).toFixed(1)} ${(y1 + dy * t - dx * h * flag).toFixed(1)}`;
  return `L${point(0.35, 0)}C${point(0.35, 0.05)} ${point(0.3, 0.12)} ${point(0.3, 0.2)}C${point(0.3, 0.3)} ${point(0.7, 0.3)} ${point(0.7, 0.2)}C${point(0.7, 0.12)} ${point(0.65, 0.05)} ${point(0.65, 0)}L${x2} ${y2}`;
}
function jigsawSvg(piece, size, image, placed) {
  const cell = 600 / size;
  const r = Math.floor(piece / size);
  const c = piece % size;
  const x = c * cell;
  const y = r * cell;
  const top = r ? -flagH(r - 1, c) : 0;
  const right = c < size - 1 ? flagV(r, c) : 0;
  const bottom = r < size - 1 ? flagH(r, c) : 0;
  const left = c ? -flagV(r, c - 1) : 0;
  const path = `M${x} ${y}${jigsawEdge(x, y, x + cell, y, top)}${jigsawEdge(x + cell, y, x + cell, y + cell, right)}${jigsawEdge(x + cell, y + cell, x, y + cell, bottom)}${jigsawEdge(x, y + cell, x, y, left)}Z`;
  const m = cell * 0.25;
  return `<svg class="jigsaw${placed ? ' placed' : ''}" viewBox="${x - m} ${y - m} ${cell + 2 * m} ${cell + 2 * m}" aria-hidden="true" focusable="false"><defs><clipPath id="jp-${piece}"><path d="${path}"/></clipPath></defs><image href="${e(image)}" width="600" height="600" preserveAspectRatio="xMidYMid slice" clip-path="url(#jp-${piece})"/><path class="jigsaw-edge" d="${path}"/></svg>`;
}

function puzzleMarkup(game, enabled) {
  const size = game.size ?? 3;
  const total = size * size;
  const cell = 600 / size;
  if (!enabled) selectedPiece = null;
  return `<section class="puzzle-layout"><div><div class="puzzle-grid size-${size}" role="group" aria-label="Quebra-cabeça de ${total} partes">${game.pieces.map((piece, index) => `<button id="piece-${index}" class="puzzle-piece${selectedPiece === index ? ' selected-piece' : ''}" data-piece="${index}" aria-pressed="${selectedPiece === index}" aria-label="Posição ${index + 1}. Parte ${piece + 1} da imagem.${piece === index ? ' No lugar certo.' : ''}" ${enabled ? '' : 'disabled'}>${jigsawSvg(piece, size, game.image, piece === index)}${showNumbers ? `<span class="piece-number" aria-hidden="true">${piece + 1}</span>` : ''}</button>`).join('')}</div><p class="fine">${selectedPiece === null ? 'Toque em uma parte e depois em outra para trocar as duas de lugar.' : `Parte na posição ${selectedPiece + 1} selecionada. Agora escolha com qual posição trocar.`}</p></div><aside class="card clue-card"><h2>Imagem de referência</h2><img class="puzzle-reference" src="${e(game.image)}" alt="Imagem completa que será montada"><label class="check"><input id="show-piece-numbers" type="checkbox" ${showNumbers ? 'checked' : ''}> Mostrar números de ajuda</label><p>Coloque as partes na ordem de 1 a ${total}, da esquerda para a direita, de cima para baixo.</p><p><strong>${game.progress[game.playerIds[0]] ?? 0} de ${total} posições na primeira montagem.</strong></p><p>${game.moves} troca(s) na sua montagem.</p></aside></section>`;
}

// Truco: tela única de mesa (celular primeiro). Placar no canto, menu de três
// risquinhos, mesa com os lugares e a mão embaixo. Tocar numa carta a levanta;
// arrastar até o centro (ou "Jogar esta carta") a lança.
const TRUCO_STAKES = [1, 3, 6, 9, 12];

function trucoMarkup(
  game,
  meId,
  connected,
  players,
  status,
  enabled,
  key,
  thinking
) {
  const myTeam = game.playerIds.indexOf(meId) % 2;
  const responder =
    game.phase === 'eleven'
      ? game.decisionPlayerId
      : game.pendingRaise?.responderId;
  const canPlay =
    connected &&
    game.status === 'PLAYING' &&
    game.phase === 'play' &&
    !game.pendingRaise &&
    game.currentPlayerId === meId;
  const canRespond = connected && responder === meId;
  const nextStake =
    TRUCO_STAKES[
      TRUCO_STAKES.indexOf(game.pendingRaise?.value ?? game.stake) + 1
    ];
  if (!canPlay || !game.hand.some((card) => card.id === selectedCard))
    selectedCard = null;
  const plays = game.trick.length ? game.trick : game.lastTrick;
  const order = game.playerIds;
  const at = order.indexOf(meId);
  const nameOf = (id) => e(players.find((player) => player.id === id)?.name);
  // Cada carta jogada fica na direção de quem a lançou: em cruz sobre a mesa.
  const placeOf = (playerId) =>
    ['bottom', 'left', 'top', 'right'][
      (order.indexOf(playerId) - at + order.length) % order.length
    ];
  const seatOf = (offset, place) => {
    const player = players.find(
      (item) => item.id === order[(at + offset) % order.length]
    );
    if (!player) return '';
    const turn =
      game.currentPlayerId === player.id && game.status === 'PLAYING';
    const doubt = thinking?.doubt && thinking.playerId === player.id;
    return `<div class="player-card truco-seat seat-${place}${turn ? ' active-player' : ''}${doubt ? ' doubting' : ''}">${doubt ? '<span class="doubt" aria-hidden="true">🤔 hmm…</span>' : ''}${avatar(player)}<span class="seat-time" aria-hidden="true"></span><strong>${e(player.name)}${botTag(player)}</strong></div>`;
  };
  const meSeat = players.find((item) => item.id === meId);
  const myTurnNow = game.currentPlayerId === meId && game.status === 'PLAYING';
  const wonBy = (team) => game.trickWinners.filter((w) => w === team).length;
  const label = (team) => (team === 0 ? 'A' : 'B');
  const canRaise =
    canPlay &&
    nextStake &&
    !game.teamPoints.includes(11) &&
    (game.raiseAllowedTeam === null || game.raiseAllowedTeam === myTeam);
  const finished = game.status === 'FINISHED';
  const decision = () =>
    `<section class="truco-overlay" aria-label="Decisão"><h2>${game.phase === 'eleven' ? 'Mão de onze' : `Pedido para valer ${game.pendingRaise.value} pontos`}</h2><p>${canRespond ? 'A decisão está com você.' : 'Aguardando a decisão de ' + nameOf(responder) + '.'}</p>${canRespond ? `<div class="button-row"><button class="primary" data-truco-action="accept">${game.phase === 'eleven' ? 'Jogar valendo 3' : 'Aceitar'}</button><button class="secondary" data-truco-action="fold">Correr</button>${game.phase !== 'eleven' && nextStake ? `<button class="secondary" data-truco-action="raise">Aumentar para ${nextStake}</button>` : ''}</div>` : ''}${
      game.partnerHands
        ? Object.entries(game.partnerHands)
            .map(
              ([id, cards]) =>
                `<p class="fine">${nameOf(id)}: ${cards.map(cardLabel).join(', ')}</p>`
            )
            .join('')
        : ''
    }</section>`;
  const overlay = finished
    ? `<section class="truco-overlay" aria-label="Fim da partida"><h2>${e(status)}</h2><button id="rematch" class="primary" ${game.rematch.includes(meId) || !connected ? 'disabled' : ''}>${game.rematch.includes(meId) ? 'Aguardando os participantes…' : 'Jogar novamente'}</button></section>`
    : game.phase === 'between'
      ? `<section class="truco-overlay" aria-label="Fim da mão"><h2>${game.lastHand.winnerTeam === null ? 'A mão empatou.' : `Equipe ${label(game.lastHand.winnerTeam)} ganhou ${game.lastHand.points} ponto(s).`}</h2><button id="next-hand" class="primary" ${connected ? '' : 'disabled'}>Próxima mão</button></section>`
      : game.phase === 'eleven' || game.pendingRaise
        ? decision()
        : '';
  const hint = !connected
    ? 'Reconectando à mesa…'
    : canPlay
      ? selectedCard
        ? ''
        : 'Toque numa carta para escolher. Depois arraste até o centro.'
      : '';
  const mine = myTeam;
  const theirs = 1 - myTeam;
  return `<section class="game-page truco-screen">
    <header class="truco-top">
      <div class="truco-summary" aria-label="Placar">
        <h2 class="visually-hidden">Equipe A: ${game.teamPoints[0]} × Equipe B: ${game.teamPoints[1]}</h2>
        <div class="score-grid" aria-hidden="true"><span></span><span>Vazas</span><span>Pontos</span><span>Valendo</span><b class="us">NÓS</b><span>${wonBy(mine)}</span><span>${game.teamPoints[mine]}</span><b class="stake">${game.stake}</b><b>ELES</b><span>${wonBy(theirs)}</span><span>${game.teamPoints[theirs]}</span></div>
        <p class="visually-hidden">Você está na Equipe ${label(myTeam)}. Vence quem chegar a 12 pontos. Mão ${game.handNumber}, valendo ${game.stake} ponto(s).</p>
      </div>
      ${menuButton()}
    </header>
    ${gameSheet({ connected, readId: 'read-game', readLabel: 'Ler instruções em voz alta' })}
    <div id="turn-status" tabindex="-1" class="truco-status${enabled ? ' my-turn' : ''}" role="status" aria-live="polite">${enabled && !finished ? 'Sua vez!' : e(status)}</div>
    <div class="truco-stage">
      <section class="table truco-table truco-felt" aria-label="Mesa de truco">
        ${seatOf(2, 'top')}${seatOf(1, 'left')}${seatOf(3, 'right')}
        <h2 class="visually-hidden">${game.trick.length ? 'Vaza em andamento' : game.lastTrick.length ? 'Última vaza' : 'Escolha sua primeira carta'}</h2>
        <div class="truco-center" id="truco-drop"><div class="played-cards">${plays.map((play) => `<div class="at-${placeOf(play.playerId)}" data-motion="p-${play.card.id}"><span role="img" aria-label="${cardLabel(play.card)}">${cardMarkup(play.card)}</span><p>${nameOf(play.playerId)}</p></div>`).join('')}</div>${plays.length || !canPlay ? '' : '<span class="drop-hint" aria-hidden="true">Solte a carta aqui</span>'}</div>
        <div class="vira">Vira <span role="img" aria-label="${cardLabel(game.vira)}">${cardMarkup(game.vira)}</span><span>manilha ${rankName(manilhaRank(game.vira))}</span></div>
        <div class="player-card truco-seat seat-me${myTurnNow ? ' active-player' : ''}">${avatar(meSeat)}<span class="seat-time" aria-hidden="true"></span><strong>${e(meSeat?.name)}${myTurnNow ? ' · sua vez' : ''}</strong></div>
        ${overlay}
        ${turnSign(key, enabled && game.status === 'PLAYING')}
        ${callSign(`${game.handNumber}:${game.pendingRaise?.value}:${game.pendingRaise?.requesterId}`, game.pendingRaise ? { 3: 'TRUCO!', 6: 'SEIS!', 9: 'NOVE!', 12: 'DOZE!' }[game.pendingRaise.value] : '')}
      </section>
    </div>
    <footer class="truco-dock">
      ${canRaise ? `<button class="truco-call" data-truco-action="raise" type="button">${game.stake === 1 ? 'TRUCO' : `${nextStake}!`}</button>` : ''}
      <div class="truco-slot">${selectedCard && canPlay ? '<button id="play-picked" class="primary truco-play" type="button">Jogar esta carta (ou arraste)</button>' : `<p class="truco-hint" aria-live="polite">${hint}</p>`}</div>
      <div class="card-hand">${game.hand
        .map((card) => {
          const manilha = card.rank === manilhaRank(game.vira);
          const picked = card.id === selectedCard;
          return `<button id="card-${card.id}" data-motion="h-${card.id}" data-card="${card.id}" type="button" class="card-button${manilha ? ' is-manilha' : ''}${picked ? ' picked' : ''}" aria-pressed="${picked}" aria-label="${picked ? 'Selecionada: ' : 'Escolher '}${cardLabel(card)}${manilha ? ', manilha' : ''}" ${canPlay ? '' : 'disabled'}>${cardMarkup(card, { manilha })}${manilha ? '<span class="manilha-tag" aria-hidden="true">manilha</span>' : ''}</button>`;
        })
        .join('')}</div>
    </footer>
  </section>`;
}

// Truco: seleção por toque, arrastar até o centro e menu de três risquinhos.
function setupTruco({ perform, onAction, context }) {
  const play = (cardId) => perform(() => onAction({ type: 'play', cardId }));
  bindGameMenu();
  document.querySelector('#play-picked')?.addEventListener('click', () => {
    if (selectedCard) play(selectedCard);
  });
  const drop = document.querySelector('#truco-drop');
  document.querySelectorAll('[data-card]:not([disabled])').forEach((button) => {
    button.addEventListener('click', () => {
      if (cardJustDragged) return;
      selectedCard =
        selectedCard === button.dataset.card ? null : button.dataset.card;
      renderAdditionalGame(context);
      context.onRedraw?.();
    });
    button.addEventListener('pointerdown', (event) => {
      if (event.button > 0) return;
      const startX = event.clientX;
      const startY = event.clientY;
      let ghost = null;
      const over = (x, y) => {
        const rect = document
          .querySelector('.truco-felt')
          ?.getBoundingClientRect();
        const dock = document
          .querySelector('.truco-dock')
          ?.getBoundingClientRect();
        return Boolean(
          rect &&
          dock &&
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y < dock.top - 8
        );
      };
      const move = (moved) => {
        if (!ghost) {
          if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < 8)
            return;
          ghost = button.querySelector('.playing-card').cloneNode(true);
          ghost.classList.add('card-ghost');
          document.body.append(ghost);
          document.body.classList.add('dragging');
          button.classList.add('picked', 'dragging-source');
        }
        ghost.style.left = `${moved.clientX}px`;
        ghost.style.top = `${moved.clientY}px`;
        drop.classList.toggle('hot', over(moved.clientX, moved.clientY));
      };
      const finish = (ended, cancelled) => {
        button.removeEventListener('pointermove', move);
        button.removeEventListener('pointerup', end);
        button.removeEventListener('pointercancel', end);
        cardDrag = null;
        document.body.classList.remove('dragging');
        drop.classList.remove('hot');
        button.classList.remove('dragging-source');
        if (!ghost) return;
        ghost.remove();
        cardJustDragged = true;
        setTimeout(() => (cardJustDragged = false), 80);
        if (!cancelled && over(ended.clientX, ended.clientY))
          play(button.dataset.card);
        else if (!cancelled) {
          selectedCard = button.dataset.card;
          renderAdditionalGame(context);
          context.onRedraw?.();
        }
      };
      const end = (ended) => finish(ended, ended.type === 'pointercancel');
      cardDrag = { cancel: () => finish(event, true) };
      button.setPointerCapture?.(event.pointerId);
      button.addEventListener('pointermove', move);
      button.addEventListener('pointerup', end);
      button.addEventListener('pointercancel', end);
    });
  });
}

const suitOrder = ['clubs', 'diamonds', 'hearts', 'spades', 'joker'];
const byCard = (a, b) =>
  suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit) || a.rank - b.rank;
const names = (players, id) =>
  players.find((player) => player.id === id)?.name ?? 'Jogador';

function cachetaMarkup(game, meId, connected, players) {
  const mine =
    connected && game.status === 'PLAYING' && game.currentPlayerId === meId;
  const canDraw = mine && game.phase === 'draw';
  const canDiscard = mine && game.phase === 'discard';
  const top = game.discardTop;
  const others = players
    .filter((player) => player.id !== meId)
    .map(
      (player) => `${e(player.name)}: ${game.handCounts[player.id]} carta(s)`
    )
    .join(' · ');
  const reveal = game.revealed
    ? `<section class="card result-card"><h2>${game.result.draw ? 'Ninguém conseguiu bater.' : 'Cartas na mesa'}</h2>${Object.entries(
        game.revealed
      )
        .map(
          ([id, info]) =>
            `<h3>${e(names(players, id))}${id === game.result.winnerId ? ' bateu' : ''}</h3><p>Jogos: ${info.melds.map((meld) => meld.cards.map(cardLabel).join(', ')).join(' | ') || 'nenhum'}</p><p>Fora de jogos: ${info.leftover.map(cardLabel).join(', ') || 'nenhuma carta'}</p>`
        )
        .join('')}</section>`
    : '';
  return `<section class="card cacheta-table" aria-label="Monte e descarte"><div class="cacheta-piles">
      <div class="stock-pile">${game.stockCount ? backMarkup() : ''}<button id="draw-stock" class="primary" ${canDraw && game.stockCount ? '' : 'disabled'}>Comprar do monte (${game.stockCount})</button></div>
      <div class="discard-pile">${top ? `<span data-motion="d-${top.id}" role="img" aria-label="Topo do descarte: ${cardLabel(top)}">${cardMarkup(top)}</span>` : ''}<button id="draw-discard" class="secondary" ${canDraw && top ? '' : 'disabled'}>Pegar ${top ? e(cardLabel(top)) : 'o descarte'}</button></div>
    </div><p class="fine">${others}</p></section>
    ${reveal}
    <section class="hand-section"><h2>Suas cartas</h2><div class="card-hand">${[
      ...game.hand,
    ]
      .sort(byCard)
      .map(
        (card) =>
          `<button data-discard="${card.id}" data-motion="h-${card.id}" class="card-button" aria-label="${canDiscard ? 'Descartar ' : ''}${cardLabel(card)}" ${canDiscard && card.id !== game.takenFromDiscard ? '' : 'disabled'}>${cardMarkup(card)}</button>`
      )
      .join('')}</div>
    <p class="fine">${canDraw ? 'Compre uma carta do monte ou pegue a do descarte.' : canDiscard ? 'Toque em uma carta para descartá-la' + (game.knockCardIds.length ? ' ou toque em Bater: suas cartas já formam jogos.' : '.') : ''}</p>
    ${canDiscard && game.knockCardIds.length ? `<button id="knock" class="primary" data-knock="${game.knockCardIds.includes(game.takenFromDiscard) ? '' : game.knockCardIds[0]}">Bater</button>` : ''}</section>`;
}

function wordsearchMarkup(game, enabled) {
  const cells = new Set();
  for (const word of game.words) {
    if (!word.found) continue;
    const rows = Math.sign(word.end.row - word.start.row);
    const cols = Math.sign(word.end.col - word.start.col);
    for (let i = 0; i < word.length; i++)
      cells.add(`${word.start.row + rows * i},${word.start.col + cols * i}`);
  }
  if (!enabled) wordStart = null;
  const total = game.words.length;
  const done = game.words.filter((word) => word.found).length;
  const rows = game.grid
    .map(
      (line, row) =>
        `<div role="row" class="ws-row">${[...line]
          .map((letter, col) => {
            const found = cells.has(`${row},${col}`);
            const start = wordStart?.row === row && wordStart?.col === col;
            return `<button role="gridcell" class="ws-cell${found ? ' found' : ''}${start ? ' start' : ''}" data-cell data-row="${row}" data-col="${col}" aria-label="Linha ${row + 1}, coluna ${col + 1}: ${letter}${found ? ', parte de palavra encontrada' : ''}${start ? ', início da marcação' : ''}" ${enabled ? '' : 'disabled'}>${letter}</button>`;
          })
          .join('')}</div>`
    )
    .join('');
  // As que faltam ficam no começo da lista; as encontradas vão para o fim.
  const ordered = [
    ...game.words.filter((word) => !word.found),
    ...game.words.filter((word) => word.found),
  ];
  return `<section class="ws-layout"><div class="ws-board"><h2>Tema: ${e(game.theme.name)}</h2><div class="ws-grid ws-${game.size}" role="grid" aria-label="Grade com ${game.size} linhas e ${game.size} colunas">${rows}</div><p class="fine">${wordStart ? `Início na linha ${wordStart.row + 1}, coluna ${wordStart.col + 1}. Toque na última letra da palavra.` : 'Toque na primeira e na última letra de uma palavra, ou arraste por cima dela.'}</p></div>
    <aside class="card clue-card"><h2>Palavras para achar</h2><ul class="solved-words ws-words">${ordered
      .map(
        (word) =>
          `<li class="${word.found ? 'done' : ''}">${word.found ? `<s>${e(word.text)}</s> <span class="visually-hidden">encontrada</span>✓` : e(word.text)}</li>`
      )
      .join('')}</ul>
    <p><strong>${done} de ${total} encontradas.</strong></p>
    <form id="word-form" class="stack"><label>Ou digite uma palavra<input id="ws-word" value="${e(wordDraft)}" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><button class="primary" type="submit" ${enabled ? '' : 'disabled'}>Marcar palavra</button></form>
    ${game.feedback?.correct === false ? '<p role="status">Essa não valeu. Confira a lista na sua próxima vez.</p>' : ''}</aside></section>`;
}

const LEVEL_NAMES = { easy: 'Fácil', medium: 'Média', hard: 'Difícil' };
const LEVEL_ORDER = ['easy', 'medium', 'hard'];

// Tela de fim de partida: jogar de novo e, onde há níveis, subir a dificuldade.
function endMarkup(room, game, status, meId, connected) {
  const waiting = game.rematch.includes(meId) || !connected;
  const level =
    room.gameId === 'wordsearch'
      ? game.level
      : room.gameId === 'puzzle'
        ? { 3: 'easy', 4: 'medium', 5: 'hard' }[game.size]
        : null;
  const next = level ? LEVEL_ORDER[LEVEL_ORDER.indexOf(level) + 1] : null;
  const again = `<button id="rematch" class="primary" ${waiting ? 'disabled' : ''}>${game.rematch.includes(meId) ? 'Aguardando os participantes…' : 'Jogar novamente'}</button>`;
  if (!['wordsearch', 'crossword', 'puzzle'].includes(room.gameId))
    return `<section class="card result-card"><h2>Que tal mais uma?</h2>${again}</section>`;
  return `<div class="end-screen" role="dialog" aria-modal="true" aria-labelledby="end-title"><div class="end-card"><p class="end-stars" aria-hidden="true">★ ★ ★</p><h2 id="end-title">${e(status)}</h2>${level ? `<p>Dificuldade desta partida: <strong>${LEVEL_NAMES[level]}</strong>.</p>` : ''}${again}${next ? `<button id="harder" class="secondary" data-level="${next}" ${waiting ? 'disabled' : ''}>Aumentar dificuldade (${LEVEL_NAMES[next]})</button>` : level ? '<p class="fine">Você já está na dificuldade mais alta.</p>' : ''}<a class="end-home" href="/">Voltar ao início</a></div></div>`;
}

export function renderAdditionalGame(context) {
  const {
    room,
    me,
    connected,
    setContent,
    perform,
    onAction,
    onLeave,
    onRematch,
  } = context;
  if (uiRoom !== room.id) {
    uiRoom = room.id;
    selectedPiece = null;
    selectedWord = '';
    answerDraft = '';
    cwCursor = 0;
    showNumbers = false;
    wordStart = null;
    wordDraft = '';
    selectedCard = null;
  }
  if (uiRevision !== room.revision) {
    selectedPiece = null;
    wordStart = null;
  }
  if (uiRevision !== room.revision) selectedCard = null;
  cardDrag?.cancel();
  uiRevision = room.revision;
  const game = room.game;
  const players = room.players;
  const metadata = gameCatalog.find((item) => item.id === room.gameId);
  const finished = game.status === 'FINISHED';
  const winnerIds = game.result?.winnerIds || [game.result?.winnerId];
  const winner = players.find((player) => player.id === game.result?.winnerId);
  const actor =
    game.decisionPlayerId ||
    game.pendingRaise?.responderId ||
    game.currentPlayerId;
  const status = finished
    ? game.result.cooperative
      ? 'Desafio concluído. Vocês conseguiram!'
      : winnerIds.includes(me.id)
        ? 'Você ganhou!'
        : winner
          ? `${winner.name} ganhou.`
          : game.result.draw
            ? 'Ninguém bateu: a rodada empatou.'
            : 'Rodada concluída.'
    : !connected
      ? 'Reconectando à mesa…'
      : actor
        ? actor === me.id
          ? room.gameId === 'cacheta'
            ? game.phase === 'draw'
              ? 'É a sua vez: compre uma carta.'
              : 'Agora descarte uma carta ou bata.'
            : 'É a sua vez de jogar.'
          : `Agora é a vez de ${players.find((player) => player.id === actor)?.name}.`
        : room.solo
          ? 'Vamos resolver com calma.'
          : 'Vocês estão jogando juntos.';
  const enabled = connected && !finished && (!actor || actor === me.id);
  const content =
    room.gameId === 'cards'
      ? ''
      : room.gameId === 'cacheta'
        ? cachetaMarkup(game, me.id, connected, players)
        : room.gameId === 'wordsearch'
          ? wordsearchMarkup(game, enabled)
          : room.gameId === 'crossword'
            ? crosswordMarkup(game, enabled)
            : puzzleMarkup(game, enabled);
  setContent(
    room.gameId === 'cards'
      ? trucoMarkup(
          game,
          me.id,
          connected,
          players,
          status,
          enabled,
          `${room.id}:${room.revision}`,
          room.thinking
        )
      : `<section class="game-page game-screen game-${room.gameId}">${screenBar({ title: e(metadata.name) })}${gameSheet({ connected, readId: 'read-game', readLabel: 'Ler instruções em voz alta', info: `<strong>${e(metadata.name)}</strong> · ${room.mode === 'bot' ? 'Contra bots' : 'Sem pressa'}` })}
    <section class="players additional-players cross-seats" data-seats="${players.length}" aria-label="Participantes" ${room.gameId === 'cards' ? 'hidden' : ''}>${crossOrder(
      room.gameId === 'cards' ? [] : players,
      game.playerIds,
      me.id
    )
      .map(
        ({ player, place }, i) =>
          `<div class="player-card seat-${place}${actor === player.id && !finished ? ' active-player' : ''}">${avatar(player)}<span class="seat-time" aria-hidden="true"></span><div><strong>${e(player.name)}${player.id === me.id ? ' (você)' : ''}${botTag(player)}</strong><small>${room.gameId === 'cards' ? `Equipe ${i % 2 === 0 ? 'A' : 'B'} · ` : ''}${game.score[player.id].wins} vitória(s) · ${game.score[player.id].points} ponto(s)</small>${game.progress ? `<small>${game.progress[player.id]} de ${room.gameId === 'puzzle' ? (game.size ?? 3) ** 2 : game.words.length} encontrados</small>` : ''}</div></div>`
      )
      .join('')}</section>
    <div id="turn-status" tabindex="-1" class="turn-banner${enabled ? ' my-turn' : ''}" role="status" aria-live="polite"><strong>${e(status)}</strong><span>${room.mode === 'bot' ? 'Cada jogada sua dá uma vez ao bot.' : room.solo ? 'No seu ritmo, sem limite de tempo.' : 'Jogue com pessoas conhecidas, no tempo combinado.'}</span></div>
    ${content}
    ${finished ? endMarkup(room, game, status, me.id, connected) : ''}
  </section>`
  );
  if (room.gameId !== 'cards' && actor === me.id && !finished && connected)
    document
      .querySelector('.game-page')
      ?.insertAdjacentHTML(
        'beforeend',
        turnSign(`${room.id}:${room.revision}`, true)
      );
  bindGameMenu();
  document.querySelector('#leave-room').onclick = onLeave;
  document.querySelector('#game-help').onclick = () => showHelp(room.gameId);
  document.querySelector('#read-game').onclick = () =>
    speak(
      `${status} ${
        room.gameId === 'cards' || room.gameId === 'cacheta'
          ? 'Suas cartas são ' + game.hand.map(cardLabel).join(', ')
          : room.gameId === 'wordsearch'
            ? 'Palavras para achar: ' +
              game.words
                .filter((word) => !word.found)
                .map((word) => word.text)
                .join(', ')
            : room.gameId === 'crossword'
              ? document.querySelector('#word-clue')?.textContent ||
                'Todas as palavras foram encontradas.'
              : 'Escolha duas partes da imagem para trocar suas posições.'
      }`,
      true
    );
  document
    .querySelector('#rematch')
    ?.addEventListener('click', () => perform(() => onRematch()));
  document.querySelector('#harder')?.addEventListener('click', (event) => {
    const level = event.currentTarget.dataset.level;
    perform(() => onRematch({ level }));
  });
  document
    .querySelector('#next-hand')
    ?.addEventListener('click', () =>
      perform(() => onAction({ type: 'next-hand' }))
    );
  if (room.gameId === 'cards') setupTruco({ perform, onAction, context });
  document
    .querySelector('#draw-stock')
    ?.addEventListener('click', () =>
      perform(() => onAction({ type: 'draw-stock' }))
    );
  document
    .querySelector('#draw-discard')
    ?.addEventListener('click', () =>
      perform(() => onAction({ type: 'draw-discard' }))
    );
  document.querySelector('#knock')?.addEventListener('click', (event) =>
    perform(() =>
      onAction({
        type: 'knock',
        ...(event.currentTarget.dataset.knock
          ? { cardId: event.currentTarget.dataset.knock }
          : {}),
      })
    )
  );
  document.querySelectorAll('[data-discard]').forEach((button) => {
    button.onclick = () =>
      perform(() =>
        onAction({ type: 'discard', cardId: button.dataset.discard })
      );
  });
  // Caça-palavras: toque no início e no fim, ou arraste sobre a palavra.
  const cellAt = (element) => {
    const cell = element?.closest?.('[data-cell]');
    return cell
      ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
      : null;
  };
  const same = (a, b) => a && b && a.row === b.row && a.col === b.col;
  const grid = document.querySelector('.ws-grid');
  const clearPreview = () =>
    document
      .querySelectorAll('.ws-cell.preview')
      .forEach((cell) => cell.classList.remove('preview'));
  const paintPreview = (from, to) => {
    clearPreview();
    const dr = to.row - from.row;
    const dc = to.col - from.col;
    if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    for (let i = 0; i <= steps; i++)
      document
        .querySelector(
          `[data-row="${from.row + Math.sign(dr) * i}"][data-col="${from.col + Math.sign(dc) * i}"]`
        )
        ?.classList.add('preview');
  };
  grid?.addEventListener('pointerdown', (event) => {
    dragFrom = enabled ? cellAt(event.target) : null;
  });
  grid?.addEventListener('pointermove', (event) => {
    if (!dragFrom) return;
    const over = cellAt(
      document.elementFromPoint(event.clientX, event.clientY)
    );
    if (over) paintPreview(dragFrom, over);
  });
  grid?.addEventListener('pointercancel', () => {
    dragFrom = null;
    clearPreview();
  });
  grid?.addEventListener('pointerup', (event) => {
    const end = cellAt(document.elementFromPoint(event.clientX, event.clientY));
    const start = dragFrom;
    dragFrom = null;
    clearPreview();
    if (!start || !end || same(start, end)) return;
    event.preventDefault();
    wordStart = null;
    perform(() => onAction({ type: 'mark', start, end }));
  });
  document.querySelectorAll('[data-cell]').forEach((button) => {
    button.onclick = () => {
      if (!enabled) return;
      const cell = cellAt(button);
      if (!wordStart) {
        wordStart = cell;
        renderAdditionalGame(context);
      } else if (same(wordStart, cell)) {
        wordStart = null;
        renderAdditionalGame(context);
      } else {
        const start = wordStart;
        wordStart = null;
        perform(() => onAction({ type: 'mark', start, end: cell }));
      }
    };
  });
  document.querySelector('#ws-word')?.addEventListener('input', (event) => {
    wordDraft = event.target.value;
  });
  document.querySelector('#word-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = wordDraft;
    perform(async () => {
      await onAction({ type: 'word', text });
      wordDraft = '';
    });
  });
  document.querySelectorAll('[data-truco-action]').forEach((button) => {
    button.onclick = () =>
      perform(() => onAction({ type: button.dataset.trucoAction }));
  });
  document
    .querySelector('#word-choice')
    ?.addEventListener('change', (event) => {
      selectedWord = event.target.value;
      answerDraft = '';
      cwCursor = 0;
      renderAdditionalGame(context);
    });
  const paintDraft = () => {
    const word = cwGame?.words.find((item) => item.id === selectedWord);
    if (!word) return;
    const letters = draftLetters(word.length);
    document.querySelectorAll('.crossword-cell').forEach((cell) => {
      cell.classList.remove('cursor');
    });
    for (let i = 0; i < word.length; i++) {
      const row = word.row + (word.direction === 'vertical' ? i : 0);
      const col = word.column + (word.direction === 'horizontal' ? i : 0);
      const cell = document.querySelector(
        `[data-cw-row="${row}"][data-cw-col="${col}"]`
      );
      if (!cell) continue;
      const slot = cell.querySelector('b');
      if (!word.answer && slot) slot.textContent = letters[i];
      if (i === cwCursor) cell.classList.add('cursor');
    }
    document.querySelectorAll('.answer-box').forEach((box, i) => {
      box.classList.toggle('cursor', i === cwCursor);
    });
  };
  // Uma casa por letra: digitar avança, apagar volta, e qualquer casa pode ser trocada.
  const boxes = [...document.querySelectorAll('.answer-box')];
  const focusBox = (index) => {
    const box = boxes[Math.max(0, Math.min(index, boxes.length - 1))];
    box?.focus();
    box?.select();
  };
  const setLetter = (index, letter) => {
    const letters = draftLetters(boxes.length);
    letters[index] = letter;
    answerDraft = packLetters(letters);
    boxes[index].value = letter;
  };
  boxes.forEach((box, i) => {
    box.addEventListener('focus', () => {
      cwCursor = i;
      box.select();
      paintDraft();
    });
    box.addEventListener('input', () => {
      const typed = [...box.value].filter((char) => /\p{L}/u.test(char));
      // Digitar sobre uma casa cheia troca a letra pela nova.
      const letter = (typed.at(-1) ?? '').toLocaleUpperCase('pt-BR');
      setLetter(i, letter);
      if (letter && i < boxes.length - 1) focusBox(i + 1);
      else paintDraft();
    });
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        if (box.value) setLetter(i, '');
        else if (event.key === 'Backspace' && i > 0) {
          setLetter(i - 1, '');
          focusBox(i - 1);
          return;
        }
        paintDraft();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusBox(i - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusBox(i + 1);
      }
    });
  });
  document.querySelectorAll('[data-cw-row]').forEach((button) => {
    button.onclick = () => {
      if (!enabled || !cwGame) return;
      const row = Number(button.dataset.cwRow);
      const col = Number(button.dataset.cwCol);
      const covering = cwGame.words.filter((word) => {
        if (cwGame.solved.includes(word.id)) return false;
        for (let i = 0; i < word.length; i++) {
          const r = word.row + (word.direction === 'vertical' ? i : 0);
          const c = word.column + (word.direction === 'horizontal' ? i : 0);
          if (r === row && c === col) return true;
        }
        return false;
      });
      if (!covering.length) return;
      const starting = covering.find(
        (word) => word.row === row && word.column === col
      );
      const current = covering.findIndex((word) => word.id === selectedWord);
      const next =
        current >= 0 && covering.length > 1
          ? covering[(current + 1) % covering.length]
          : (starting ?? covering[0]);
      if (next.id !== selectedWord) answerDraft = '';
      cwCursor = 0;
      selectedWord = next.id;
      renderAdditionalGame(context);
      document.querySelector('.answer-box')?.focus();
    };
  });
  document
    .querySelector('#answer-form')
    ?.addEventListener('submit', (event) => {
      event.preventDefault();
      const letters = draftLetters(boxes.length);
      const empty = letters.indexOf('');
      if (empty >= 0) {
        const hint = document.querySelector('#answer-hint');
        if (hint) hint.textContent = 'Faltam letras. Preencha todas as casas.';
        focusBox(empty);
        return;
      }
      perform(async () => {
        await onAction({
          type: 'answer',
          wordId: selectedWord,
          answer: letters.join(''),
        });
        answerDraft = '';
        cwCursor = 0;
        boxes.forEach((box) => (box.value = ''));
        paintDraft();
        focusBox(0);
      });
    });
  document
    .querySelector('#show-piece-numbers')
    ?.addEventListener('change', (event) => {
      showNumbers = event.target.checked;
      renderAdditionalGame(context);
    });
  document.querySelectorAll('[data-piece]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      if (!enabled || event.button > 0) return;
      const from = Number(button.dataset.piece);
      const startX = event.clientX;
      const startY = event.clientY;
      let ghost = null;
      const move = (moved) => {
        if (!ghost) {
          if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < 8)
            return;
          ghost = button.querySelector('svg').cloneNode(true);
          ghost.classList.add('piece-ghost');
          ghost.style.width = `${button.offsetWidth * 1.5}px`;
          document.body.append(ghost);
        }
        ghost.style.left = `${moved.clientX}px`;
        ghost.style.top = `${moved.clientY}px`;
      };
      const end = (finished) => {
        button.removeEventListener('pointermove', move);
        button.removeEventListener('pointerup', end);
        button.removeEventListener('pointercancel', end);
        if (!ghost) return;
        ghost.remove();
        dragMoved = true;
        setTimeout(() => (dragMoved = false), 60);
        const target = document
          .elementFromPoint(finished.clientX, finished.clientY)
          ?.closest('[data-piece]');
        if (finished.type === 'pointerup' && target) {
          const to = Number(target.dataset.piece);
          if (to !== from) {
            selectedPiece = null;
            perform(() => onAction({ type: 'swap', from, to }));
          }
        }
      };
      button.setPointerCapture?.(event.pointerId);
      button.addEventListener('pointermove', move);
      button.addEventListener('pointerup', end);
      button.addEventListener('pointercancel', end);
    });
    button.onclick = () => {
      if (!enabled || dragMoved) return;
      const index = Number(button.dataset.piece);
      if (selectedPiece === null) {
        selectedPiece = index;
        renderAdditionalGame(context);
      } else if (selectedPiece === index) {
        selectedPiece = null;
        renderAdditionalGame(context);
      } else {
        const from = selectedPiece;
        selectedPiece = null;
        perform(() => onAction({ type: 'swap', from, to: index }));
      }
    };
  });
  return status;
}
