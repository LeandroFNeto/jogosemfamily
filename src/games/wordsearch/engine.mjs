import { requireValue } from '../../shared/errors.mjs';
import { pick, shuffle, systemRng } from '../core/rng.mjs';
import {
  createRound,
  requirePlayer,
  finishTogether,
  finishCompetitive,
  recordAction,
  rematch,
} from '../core/round.mjs';
import { themes } from './words.mjs';

/** Tamanho da grade, quantidade de palavras e faixa de tamanho por nível. */
export const LEVELS = {
  easy: { size: 8, count: 6, min: 4, max: 7 },
  medium: { size: 12, count: 10, min: 4, max: 9 },
  hard: { size: 15, count: 14, min: 5, max: 12 },
};
const FORWARD = [
  [0, 1], // →
  [1, 0], // ↓
];
const DIAGONAL = [
  [1, 1], // ↘
  [-1, 1], // ↗
];
const REVERSED = [
  [0, -1], // ←
  [-1, 0], // ↑
  [-1, -1], // ↖
  [1, -1], // ↙
];
export const DIRECTIONS = {
  easy: FORWARD,
  medium: [...FORWARD, ...DIAGONAL],
  hard: [...FORWARD, ...DIAGONAL, ...REVERSED],
};
const LETTERS = 'AAAAEEEEIIIOOOUUBCDFGHJLMNPQRSTVXZ';
const ATTEMPTS = 300;

export const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();

/**
 * Coloca as palavras na grade. Devolve null se alguma não coube; quem chama
 * sorteia outro conjunto de palavras.
 */
function place(words, level, rng) {
  const { size } = LEVELS[level];
  const cells = Array.from({ length: size }, () => Array(size).fill(''));
  const placements = [];
  for (const text of [...words].sort((a, b) => b.length - a.length)) {
    let done = false;
    for (let attempt = 0; attempt < ATTEMPTS && !done; attempt++) {
      const [dr, dc] = pick(DIRECTIONS[level], rng);
      const row = rng.int(size);
      const col = rng.int(size);
      const endRow = row + dr * (text.length - 1);
      const endCol = col + dc * (text.length - 1);
      if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size)
        continue;
      let fits = true;
      for (let i = 0; i < text.length && fits; i++) {
        const cell = cells[row + dr * i][col + dc * i];
        fits = cell === '' || cell === text[i];
      }
      if (!fits) continue;
      for (let i = 0; i < text.length; i++)
        cells[row + dr * i][col + dc * i] = text[i];
      placements.push({
        text,
        start: { row, col },
        end: { row: endRow, col: endCol },
      });
      done = true;
    }
    if (!done) return null;
  }
  for (const line of cells)
    for (let col = 0; col < size; col++)
      if (!line[col]) line[col] = LETTERS[rng.int(LETTERS.length)];
  return { grid: cells.map((line) => line.join('')), placements };
}

export function generate(level, rng = systemRng, themeId) {
  const config = LEVELS[level];
  requireValue(config, 'Escolha a dificuldade: fácil, média ou difícil.');
  for (let round = 0; round < 50; round++) {
    const theme =
      themes.find((item) => item.id === themeId) ?? pick(themes, rng);
    const pool = theme.words.filter(
      (word) => word.length >= config.min && word.length <= config.max
    );
    if (pool.length < config.count) continue;
    const words = shuffle([...pool], rng).slice(0, config.count);
    const placed = place(words, level, rng);
    if (placed)
      return {
        theme,
        grid: placed.grid,
        placements: placed.placements
          .sort((a, b) => a.text.localeCompare(b.text))
          .map((item, index) => ({ id: `w${index + 1}`, ...item })),
      };
  }
  throw new Error('Não foi possível montar a grade.');
}

export function createGame(
  playerIds,
  previousScore = {},
  { competitive = false, level = 'easy', theme, rng = systemRng } = {}
) {
  requireValue(
    playerIds.length <= 2,
    'O caça-palavras recebe até duas pessoas.'
  );
  const made = generate(level, rng, theme);
  return {
    ...createRound(playerIds, previousScore),
    level,
    theme: { id: made.theme.id, name: made.theme.name },
    size: LEVELS[level].size,
    grid: made.grid,
    placements: made.placements,
    competitive,
    found: [],
    foundByPlayer: Object.fromEntries(playerIds.map((id) => [id, []])),
    currentPlayerId: competitive ? playerIds[0] : null,
    feedback: {},
  };
}

function readLine(game, start, end) {
  const inside = (cell) =>
    cell &&
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.row < game.size &&
    cell.col >= 0 &&
    cell.col < game.size;
  requireValue(inside(start) && inside(end), 'Marque letras dentro da grade.');
  const rows = end.row - start.row;
  const cols = end.col - start.col;
  requireValue(
    (rows !== 0 || cols !== 0) &&
      (rows === 0 || cols === 0 || Math.abs(rows) === Math.abs(cols)),
    'Marque em linha reta: horizontal, vertical ou diagonal.'
  );
  const steps = Math.max(Math.abs(rows), Math.abs(cols));
  let text = '';
  for (let i = 0; i <= steps; i++)
    text +=
      game.grid[start.row + Math.sign(rows) * i][
        start.col + Math.sign(cols) * i
      ];
  return text;
}

const foundFor = (game, playerId) =>
  game.competitive ? game.foundByPlayer[playerId] : game.found;

export function processAction(game, playerId, action) {
  requirePlayer(game, playerId);
  if (game.competitive) {
    requireValue(game.currentPlayerId === playerId, 'Aguarde a sua vez.', 409);
    if (action.type === 'pass') {
      game.currentPlayerId = game.playerIds.find((id) => id !== playerId);
      recordAction(game, { playerId, type: 'pass' });
      return game;
    }
  }
  requireValue(
    action.type === 'mark' || action.type === 'word',
    'Marque uma palavra na grade ou digite uma da lista.'
  );
  const found = foundFor(game, playerId);
  const remaining = game.placements.filter(
    (item) => !found.some((entry) => entry.wordId === item.id)
  );
  let match = null;
  let marked = null;
  if (action.type === 'mark') {
    const text = readLine(game, action.start, action.end);
    const reversed = [...text].reverse().join('');
    match = remaining.find(
      (item) => item.text === text || item.text === reversed
    );
    if (match) {
      const forward = match.text === text;
      marked = {
        start: forward ? action.start : action.end,
        end: forward ? action.end : action.start,
      };
    }
  } else {
    requireValue(
      typeof action.text === 'string' && action.text.length <= 40,
      'Digite uma palavra da lista.'
    );
    match = remaining.find((item) => item.text === normalize(action.text));
    if (match) marked = { start: match.start, end: match.end };
  }
  if (match) found.push({ wordId: match.id, by: playerId, ...marked });
  else
    requireValue(
      game.competitive,
      action.type === 'mark'
        ? 'Esse trecho não forma uma palavra da lista. Tente de novo.'
        : 'Essa palavra não está na lista ou já foi encontrada.'
    );
  game.feedback[playerId] = {
    playerId,
    correct: Boolean(match),
    wordId: match?.id ?? null,
  };
  recordAction(game, { playerId, type: action.type, correct: Boolean(match) });
  if (found.length === game.placements.length) {
    if (game.competitive) finishCompetitive(game, playerId);
    else finishTogether(game);
    game.currentPlayerId = null;
  } else if (game.competitive)
    game.currentPlayerId = game.playerIds.find((id) => id !== playerId);
  return game;
}

export function publicGame(game, playerId) {
  requireValue(
    game.playerIds.includes(playerId),
    'Jogador não autorizado.',
    403
  );
  // A solução (`placements`) nunca sai do servidor: só as posições das
  // palavras que quem pede já encontrou.
  const { placements, found: sharedFound, foundByPlayer, ...state } = game;
  const mine = foundFor(game, playerId);
  return {
    ...state,
    feedback: game.feedback[playerId] || null,
    found: mine,
    progress: Object.fromEntries(
      game.playerIds.map((id) => [id, foundFor(game, id).length])
    ),
    words: placements.map((item) => {
      const entry = mine.find((it) => it.wordId === item.id);
      return {
        id: item.id,
        text: item.text,
        length: item.text.length,
        found: Boolean(entry),
        start: entry?.start ?? null,
        end: entry?.end ?? null,
      };
    }),
  };
}

export const requestRematch = (game, playerId) =>
  rematch(game, playerId, createGame, {
    competitive: game.competitive,
    level: game.level,
  });
