export const gameCatalog = [
  {
    id: 'domino',
    name: 'Dominó',
    description: 'As peças de sempre, na companhia de quem você gosta.',
    solo: false,
    symbol: '⠿',
    shortName: 'Dominó',
    capacities: [2, 3, 4],
  },
  {
    id: 'cards',
    name: 'Truco paulista',
    description:
      'Vira, manilhas e duas equipes de três, com bots completando a mesa.',
    solo: false,
    symbol: '♠ ♥',
    shortName: 'Truco',
    capacities: [4],
  },
  {
    id: 'crossword',
    name: 'Palavras cruzadas',
    description: 'Uma pista de cada vez, com palavras do nosso dia a dia.',
    solo: true,
    symbol: 'ABC',
  },
  {
    id: 'puzzle',
    name: 'Quebra-cabeça',
    description: 'Junte as nove partes de uma imagem, no seu ritmo.',
    solo: true,
    symbol: '▦',
  },
  {
    id: 'cacheta',
    name: 'Cacheta',
    description: 'Compre, descarte e forme sequências e trincas com 9 cartas.',
    solo: false,
    symbol: '♣ ♦',
    shortName: 'Cacheta',
    capacities: [2, 3, 4],
  },
  {
    id: 'wordsearch',
    name: 'Caça-palavras',
    description: 'Ache as palavras escondidas na grade, sozinho ou em dupla.',
    solo: true,
    symbol: 'A–Z',
  },
];

/** Jogos que existiam antes da Cacheta e do caça-palavras. */
const LEGACY_GAME_IDS = ['domino', 'cards', 'crossword', 'puzzle'];

/** Jogos de um perfil novo: todos os do catálogo. */
export const allGameIds = () => gameCatalog.map((game) => game.id);

/**
 * Perfis antigos, sem lista própria, continuam com os quatro jogos que já
 * tinham; o familiar liga os novos no painel.
 */
export function enabledGameIds(profile) {
  return (
    profile.enabledGames ??
    LEGACY_GAME_IDS.filter(
      (id) => id !== 'domino' || profile.dominoEnabled !== false
    )
  );
}
