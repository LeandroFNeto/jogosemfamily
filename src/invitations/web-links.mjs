import { requireValue } from '../shared/errors.mjs';
import { hashToken, newToken } from './service.mjs';

export const WEB_LINK_TTL = 24 * 60 * 60 * 1000;

const PATH = /^[\w-]{43}$/;

/**
 * Emite o link pessoal que leva do WhatsApp à mesa na web. Guarda só o hash do
 * token. O link fica ativo por 24 horas e pode ser aberto de novo; pedir outro
 * (*jogo*) invalida o anterior da mesma pessoa e mesa.
 */
// Cada pessoa tem um único link ativo: pedir outro invalida o anterior.
export function issueWebLink(store, profileId, roomId, now = Date.now()) {
  const token = newToken();
  store.db.prepare('DELETE FROM web_links WHERE profile_id = ?').run(profileId);
  store.db
    .prepare('INSERT INTO web_links VALUES (?, ?, ?, ?, NULL)')
    .run(hashToken(token), profileId, roomId, now + WEB_LINK_TTL);
  return { token, expires: now + WEB_LINK_TTL };
}

/** Já existe um link ativo desta pessoa para esta mesa? */
export function hasWebLink(store, profileId, roomId, now = Date.now()) {
  return Boolean(
    store.db
      .prepare(
        'SELECT 1 FROM web_links WHERE profile_id = ? AND room_id = ? AND expires > ?'
      )
      .get(profileId, roomId, now)
  );
}

/**
 * Resgata o link e devolve perfil e mesa. Token inexistente ou vencido recebe a
 * mesma resposta, sem revelar se ele existiu.
 */
export function redeemWebLink(store, token, now = Date.now()) {
  const invalid = () =>
    requireValue(
      false,
      'Este link não vale mais. Digite *jogo* no WhatsApp para receber um novo.',
      404
    );
  if (typeof token !== 'string' || !PATH.test(token)) invalid();
  const found = store.db
    .prepare(
      'SELECT profile_id, room_id FROM web_links WHERE token_hash = ? AND expires > ?'
    )
    .get(hashToken(token), now);
  if (!found) invalid();
  return { profileId: found.profile_id, roomId: found.room_id };
}

/** Confere se o link ainda vale (prévias de link só fazem GET). */
export function peekWebLink(store, token, now = Date.now()) {
  if (typeof token !== 'string' || !PATH.test(token)) return false;
  return Boolean(
    store.db
      .prepare('SELECT 1 FROM web_links WHERE token_hash = ? AND expires > ?')
      .get(hashToken(token), now)
  );
}
