import { requireValue } from '../shared/errors.mjs';
import { gameCatalog, enabledGameIds } from '../shared/games.mjs';

export const defaultPreferences = () => ({
  fontSize: 'large',
  contrast: false,
  speech: false,
});

export function validateProfile(data) {
  requireValue(
    typeof data.name === 'string' &&
      data.name.trim().length >= 2 &&
      data.name.trim().length <= 40,
    'Escreva um nome com 2 a 40 letras.'
  );
  requireValue(
    !/[\u0000-\u001f\u007f]/.test(data.name),
    'O nome contém caracteres inválidos.'
  );
  const photo = data.photo ?? '';
  requireValue(
    typeof photo === 'string' &&
      (photo === '' ||
        (photo.length <= 160000 &&
          /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))),
    'Escolha uma foto JPEG pequena.'
  );
  if (photo) {
    const bytes = Buffer.from(photo.split(',')[1], 'base64');
    requireValue(
      bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      'A foto não é um JPEG válido.'
    );
  }
  const prefs = data.preferences;
  requireValue(
    prefs &&
      ['normal', 'large', 'extra'].includes(prefs.fontSize) &&
      typeof prefs.contrast === 'boolean' &&
      typeof prefs.speech === 'boolean',
    'Preferências inválidas.'
  );
  requireValue(
    data.enabledGames !== undefined || typeof data.dominoEnabled === 'boolean',
    'Configuração dos jogos inválida.'
  );
  requireValue(
    data.enabledGames === undefined || Array.isArray(data.enabledGames),
    'Configuração dos jogos inválida.'
  );
  const enabledGames = enabledGameIds(data);
  requireValue(
    Array.isArray(enabledGames) &&
      enabledGames.length <= gameCatalog.length &&
      new Set(enabledGames).size === enabledGames.length &&
      enabledGames.every((id) => gameCatalog.some((game) => game.id === id)),
    'Escolha somente jogos disponíveis, sem repetir.'
  );
  return {
    name: data.name.trim(),
    photo,
    preferences: prefs,
    enabledGames,
    dominoEnabled: enabledGames.includes('domino'),
  };
}

export function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    photo: profile.photo,
    bot: profile.bot === true,
  };
}
