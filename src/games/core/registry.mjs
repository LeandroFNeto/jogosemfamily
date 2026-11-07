import * as domino from '../domino/engine.mjs';
import * as cards from '../cards/engine.mjs';
import * as crossword from '../crossword/engine.mjs';
import * as puzzle from '../puzzle/engine.mjs';
import * as cacheta from '../cacheta/engine.mjs';
import * as wordsearch from '../wordsearch/engine.mjs';
import { gameCatalog } from '../../shared/games.mjs';
import { requireValue } from '../../shared/errors.mjs';

const engines = { domino, cards, crossword, puzzle, cacheta, wordsearch };
const games = new Map(
  gameCatalog.map((game) => [game.id, { ...game, ...engines[game.id] }])
);

export function getGameEngine(id) {
  requireValue(games.has(id), 'Este jogo ainda não está disponível.');
  return games.get(id);
}
