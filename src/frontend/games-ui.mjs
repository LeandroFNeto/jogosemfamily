import { escapeHtml as e, avatar, botTag, showHelp } from '/components.mjs';
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
let showNumbers = false;
let wordStart = null;
let wordDraft = '';
let dragFrom = null;
let cwGame = null;
let dragMoved = false;

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
  const draft = answerDraft.replace(/[^\p{L}]/gu, '');
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
            pos !== undefined && !cell.letter ? (draft[pos] ?? '') : '';
          const label = `Linha ${row + 1}, coluna ${col + 1}: ${cell.letter || 'vazia'}${cell.number ? ', início da pista ' + cell.number : ''}`;
          return `<button type="button" role="cell" class="crossword-cell${pos !== undefined ? ' in-word' : ''}${pos !== undefined && pos === Math.min(draft.length, chosen.length - 1) ? ' cursor' : ''}" data-cw-row="${row}" data-cw-col="${col}" aria-label="${label}" ${enabled ? '' : 'disabled'}><small aria-hidden="true">${cell.number}</small><b aria-hidden="true">${cell.letter || e(typed)}</b></button>`;
        })
        .join('')}</div>`
  ).join('');
  return `<section class="crossword-layout"><div>${chosen ? `<div class="cw-active" aria-live="polite"><span class="cw-badge">${chosen.number} ${chosen.direction === 'vertical' ? '↓' : '→'}</span><span>${e(chosen.clue)} <small>(${chosen.length} letras)</small></span></div>` : ''}<h2>${e(game.title)}</h2><div class="crossword-grid" role="table" aria-label="Grade de palavras cruzadas" style="grid-template-columns:repeat(${game.columns},minmax(0,1fr))">${gridHtml}</div><p class="fine">Toque num quadrado, veja a dica no alto e digite a palavra direto. As letras aparecem na grade. Acentos não são obrigatórios.</p></div>
    <div class="card clue-card">${remaining.length ? `<form id="answer-form" class="stack"><label>Escolha uma pista<select id="word-choice">${remaining.map((word) => `<option value="${word.id}" ${word.id === selectedWord ? 'selected' : ''}>${word.number} · ${word.direction} · ${word.length} letras</option>`).join('')}</select></label><p id="word-clue"><strong>${e(chosen.clue)}</strong></p><label>Sua resposta<input id="crossword-answer" value="${e(answerDraft)}" maxlength="50" autocomplete="off" autocapitalize="characters" spellcheck="false" required aria-describedby="word-clue"></label><button class="primary" type="submit" ${enabled ? '' : 'disabled'}>Conferir palavra</button></form>${game.feedback?.correct === false && game.feedback.playerId ? '<p role="status">Ainda não é essa palavra. Confira a pista na sua próxima vez.</p>' : ''}` : '<h3>Todas as palavras foram encontradas!</h3>'}
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

function trucoMarkup(game, meId, connected, players) {
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
  const nextStake = [1, 3, 6, 9, 12][
    [1, 3, 6, 9, 12].indexOf(game.pendingRaise?.value ?? game.stake) + 1
  ];
  const plays = game.trick.length ? game.trick : game.lastTrick;
  const order = game.playerIds;
  const at = order.indexOf(meId);
  const seatOf = (offset, place) => {
    const player = players.find(
      (item) => item.id === order[(at + offset) % order.length]
    );
    if (!player) return '';
    const turn =
      game.currentPlayerId === player.id && game.status === 'PLAYING';
    return `<div class="player-card truco-seat seat-${place}${turn ? ' active-player' : ''}">${avatar(player)}<strong>${e(player.name)}${botTag(player)}</strong></div>`;
  };
  const trucoSeats = `${seatOf(2, 'top')}${seatOf(1, 'left')}${seatOf(3, 'right')}`;
  const meSeat = players.find((item) => item.id === meId);
  const myTurnNow = game.currentPlayerId === meId && game.status === 'PLAYING';
  return `<section class="truco-summary card"><h2>Equipe A: ${game.teamPoints[0]} <span aria-hidden="true">×</span> Equipe B: ${game.teamPoints[1]}</h2><p>Você está na <strong>Equipe ${myTeam === 0 ? 'A' : 'B'}</strong>. Vence quem chegar a 12 pontos.</p><p>Mão ${game.handNumber} · Valendo ${game.stake} ponto(s).</p></section>
    ${game.phase === 'between' ? `<section class="card result-card"><h2>${game.lastHand.winnerTeam === null ? 'A mão empatou.' : `Equipe ${game.lastHand.winnerTeam === 0 ? 'A' : 'B'} ganhou ${game.lastHand.points} ponto(s).`}</h2><button id="next-hand" class="primary" ${connected ? '' : 'disabled'}>Próxima mão</button></section>` : ''}
    ${game.phase === 'eleven' || game.pendingRaise ? `<section class="card response-card"><h2>${game.phase === 'eleven' ? 'Mão de onze' : `Pedido para valer ${game.pendingRaise.value} pontos`}</h2><p>${canRespond ? 'A decisão está com você. Aceite ou corra antes que o tempo acabe.' : 'Aguardando a decisão de ' + e(players.find((player) => player.id === responder)?.name) + '.'}</p>${canRespond ? `<div class="button-row"><button class="primary" data-truco-action="accept">${game.phase === 'eleven' ? 'Jogar valendo 3' : 'Aceitar'}</button><button class="secondary" data-truco-action="fold">Correr</button>${game.phase !== 'eleven' && nextStake ? `<button class="secondary" data-truco-action="raise">Aumentar para ${nextStake}</button>` : ''}</div>` : ''}</section>` : ''}
    <section class="table truco-table truco-felt" aria-label="Cartas da vaza">${trucoSeats}<h2>${game.trick.length ? 'Vaza em andamento' : game.lastTrick.length ? 'Última vaza' : 'Escolha sua primeira carta'}</h2><div class="played-cards">${plays.map((play) => `<div data-motion="p-${play.card.id}"><span role="img" aria-label="${cardLabel(play.card)}">${cardMarkup(play.card)}</span><p>${e(players.find((player) => player.id === play.playerId)?.name)}</p></div>`).join('')}</div><div class="vira">Vira: <span role="img" aria-label="${cardLabel(game.vira)}">${cardMarkup(game.vira)}</span><span>manilha ${rankName(manilhaRank(game.vira))}</span></div><p>Vazas: ${game.trickWinners.map((team) => (team === null ? 'empate' : 'Equipe ' + (team === 0 ? 'A' : 'B'))).join(' · ') || 'nenhuma concluída'}</p></section>
    <div class="player-card truco-seat seat-me${myTurnNow ? ' active-player' : ''}">${avatar(meSeat)}<strong>${e(meSeat?.name)}${myTurnNow ? ' · sua vez' : ''}</strong></div>
    <section class="hand-section truco-hand"><h2>Suas cartas</h2><div class="card-hand">${game.hand
      .map((card) => {
        const manilha = card.rank === manilhaRank(game.vira);
        return `<button id="card-${card.id}" data-motion="h-${card.id}" data-card="${card.id}" class="card-button${manilha ? ' is-manilha' : ''}" aria-label="Jogar ${cardLabel(card)}${manilha ? ', manilha' : ''}" ${canPlay ? '' : 'disabled'}>${cardMarkup(card, { manilha })}${manilha ? '<span class="manilha-tag" aria-hidden="true">manilha</span>' : ''}</button>`;
      })
      .join(
        ''
      )}</div>${canPlay && nextStake && !game.teamPoints.includes(11) && (game.raiseAllowedTeam === null || game.raiseAllowedTeam === myTeam) ? `<button class="secondary" data-truco-action="raise">${game.stake === 1 ? 'Pedir Truco' : `Aumentar para ${nextStake}`}</button>` : ''}
    ${
      game.partnerHands
        ? `<h3>Cartas dos parceiros na mão de onze</h3>${Object.entries(
            game.partnerHands
          )
            .map(
              ([id, cards]) =>
                `<p>${e(players.find((player) => player.id === id)?.name)}: ${cards.map(cardLabel).join(', ')}</p>`
            )
            .join('')}`
        : ''
    }</section>`;
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
  return `<section class="puzzle-layout"><div><h2>Tema: ${e(game.theme.name)}</h2><div class="ws-grid ws-${game.size}" role="grid" aria-label="Grade com ${game.size} linhas e ${game.size} colunas">${rows}</div><p class="fine">${wordStart ? `Início na linha ${wordStart.row + 1}, coluna ${wordStart.col + 1}. Toque na última letra da palavra.` : 'Toque na primeira e na última letra de uma palavra, ou arraste por cima dela.'}</p></div>
    <aside class="card clue-card"><h2>Palavras para achar</h2><ul class="solved-words ws-words">${game.words
      .map(
        (word) =>
          `<li class="${word.found ? 'done' : ''}">${word.found ? `<s>${e(word.text)}</s> <span class="visually-hidden">encontrada</span>✓` : e(word.text)}</li>`
      )
      .join('')}</ul>
    <p><strong>${done} de ${total} encontradas.</strong></p>
    <form id="word-form" class="stack"><label>Ou digite uma palavra<input id="ws-word" value="${e(wordDraft)}" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><button class="primary" type="submit" ${enabled ? '' : 'disabled'}>Marcar palavra</button></form>
    ${game.feedback?.correct === false ? '<p role="status">Essa não valeu. Confira a lista na sua próxima vez.</p>' : ''}</aside></section>`;
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
    showNumbers = false;
    wordStart = null;
    wordDraft = '';
  }
  if (uiRevision !== room.revision) {
    selectedPiece = null;
    wordStart = null;
  }
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
      ? trucoMarkup(game, me.id, connected, players)
      : room.gameId === 'cacheta'
        ? cachetaMarkup(game, me.id, connected, players)
        : room.gameId === 'wordsearch'
          ? wordsearchMarkup(game, enabled)
          : room.gameId === 'crossword'
            ? crosswordMarkup(game, enabled)
            : puzzleMarkup(game, enabled);
  setContent(`<section class="game-page"><div class="game-top"><div><p class="eyebrow">A NOSSA MESA</p><h1>${e(metadata.name)} <span class="tag">${room.mode === 'bot' ? 'Contra bots' : 'Sem pressa'}</span></h1></div><button id="leave-room" class="quiet">Sair (um bot assume)</button></div>
    <section class="players additional-players" aria-label="Participantes" ${room.gameId === 'cards' ? 'hidden' : ''}>${(room.gameId === 'cards' ? [] : players).map((player, i) => `<div class="player-card${actor === player.id && !finished ? ' active-player' : ''}">${avatar(player)}<div><strong>${e(player.name)}${player.id === me.id ? ' (você)' : ''}${botTag(player)}</strong><small>${room.gameId === 'cards' ? `Equipe ${i % 2 === 0 ? 'A' : 'B'} · ` : ''}${game.score[player.id].wins} vitória(s) · ${game.score[player.id].points} ponto(s)</small>${game.progress ? `<small>${game.progress[player.id]} de ${room.gameId === 'puzzle' ? (game.size ?? 3) ** 2 : game.words.length} encontrados</small>` : ''}</div></div>`).join('')}</section>
    <div id="turn-status" tabindex="-1" class="turn-banner${enabled ? ' my-turn' : ''}" role="status" aria-live="polite"><strong>${e(status)}</strong><span>${room.mode === 'bot' ? 'Cada jogada sua dá uma vez ao bot.' : room.solo ? 'No seu ritmo, sem limite de tempo.' : 'Jogue com pessoas conhecidas, no tempo combinado.'}</span></div>
    ${content}
    ${finished ? `<section class="card result-card"><h2>Que tal mais uma?</h2><button id="rematch" class="primary" ${game.rematch.includes(me.id) || !connected ? 'disabled' : ''}>${game.rematch.includes(me.id) ? 'Aguardando os participantes…' : 'Jogar novamente'}</button></section>` : ''}
    <div class="game-bottom"><span class="connection">${connected ? '● Mesa conectada' : 'Reconectando…'}</span><button id="read-game" class="quiet">Ler instruções em voz alta</button><button id="game-help" class="quiet">Preciso de ajuda</button></div></section>`);
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
    ?.addEventListener('click', () => perform(onRematch));
  document
    .querySelector('#next-hand')
    ?.addEventListener('click', () =>
      perform(() => onAction({ type: 'next-hand' }))
    );
  document.querySelectorAll('[data-card]').forEach((button) => {
    button.onclick = () =>
      perform(() => onAction({ type: 'play', cardId: button.dataset.card }));
  });
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
      renderAdditionalGame(context);
    });
  const paintDraft = () => {
    const word = cwGame?.words.find((item) => item.id === selectedWord);
    if (!word) return;
    const letters = answerDraft.replace(/[^\p{L}]/gu, '');
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
      if (!word.answer && slot) slot.textContent = letters[i] ?? '';
      if (i === Math.min(letters.length, word.length - 1))
        cell.classList.add('cursor');
    }
  };
  document
    .querySelector('#crossword-answer')
    ?.addEventListener('input', (event) => {
      answerDraft = event.target.value;
      paintDraft();
      const word = cwGame?.words.find((item) => item.id === selectedWord);
      const letters = answerDraft.replace(/[^\p{L}]/gu, '');
      if (enabled && word && letters.length >= word.length)
        document.querySelector('#answer-form')?.requestSubmit();
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
      selectedWord = next.id;
      renderAdditionalGame(context);
      document.querySelector('#crossword-answer')?.focus();
    };
  });
  document
    .querySelector('#answer-form')
    ?.addEventListener('submit', (event) => {
      event.preventDefault();
      perform(async () => {
        await onAction({
          type: 'answer',
          wordId: selectedWord,
          answer: answerDraft,
        });
        answerDraft = '';
        const input = document.querySelector('#crossword-answer');
        if (input) input.value = '';
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
