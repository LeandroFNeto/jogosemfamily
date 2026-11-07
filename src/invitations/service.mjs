import { randomBytes, randomInt, createHash } from 'node:crypto';
import { requireValue } from '../shared/errors.mjs';

export const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export function issueInvitation(store, room, now = Date.now()) {
  const token = newToken();
  const expires = Math.min(room.expires, now + 2 * 60 * 60 * 1000);
  store.db.prepare('DELETE FROM invitations WHERE room_id = ?').run(room.id);
  store.db
    .prepare('INSERT INTO invitations VALUES (?, ?, ?, NULL)')
    .run(hashToken(token), room.id, expires);
  return { token, expires };
}

export function findInvitation(store, token, now = Date.now()) {
  requireValue(
    typeof token === 'string' && /^[\w-]{43}$/.test(token),
    'Convite inválido ou expirado.',
    404
  );
  const invitation = store.db
    .prepare('SELECT * FROM invitations WHERE token_hash = ?')
    .get(hashToken(token));
  requireValue(
    invitation && invitation.expires > now,
    'Convite inválido ou expirado. Peça um novo link ao familiar.',
    404
  );
  const room = store.getRoom(invitation.room_id);
  requireValue(
    room && room.expires > now && room.status !== 'CLOSED',
    'Esta mesa já foi encerrada.',
    410
  );
  return { invitation, room };
}

// Convites do WhatsApp: código curto e fácil de digitar, sem 0/O/1/I, válido por
// 24 h e reutilizável até a mesa lotar (a vaga é controlada pela capacidade).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const WHATSAPP_CODE_LENGTH = 8;
export const WHATSAPP_CODE_PATTERN = new RegExp(
  `^[${CODE_ALPHABET}]{${WHATSAPP_CODE_LENGTH}}$`
);

export const normalizeWhatsappCode = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');

const whatsappHash = (code) => hashToken(`wa:${code}`);

export function issueWhatsappInvitation(store, room, now = Date.now()) {
  let code = '';
  for (let i = 0; i < WHATSAPP_CODE_LENGTH; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const expires = Math.min(room.expires, now + 24 * 60 * 60 * 1000);
  store.db.prepare('DELETE FROM invitations WHERE room_id = ?').run(room.id);
  store.db
    .prepare('INSERT INTO invitations VALUES (?, ?, ?, NULL)')
    .run(whatsappHash(code), room.id, expires);
  return { code, expires };
}

export function findWhatsappInvitation(store, rawCode, now = Date.now()) {
  const code = normalizeWhatsappCode(rawCode);
  const invalid =
    'Convite inválido ou expirado. Peça um novo link a quem convidou.';
  requireValue(WHATSAPP_CODE_PATTERN.test(code), invalid, 404);
  const invitation = store.db
    .prepare('SELECT * FROM invitations WHERE token_hash = ?')
    .get(whatsappHash(code));
  requireValue(invitation && invitation.expires > now, invalid, 404);
  const room = store.getRoom(invitation.room_id);
  requireValue(
    room && room.expires > now && room.status !== 'CLOSED',
    'Esta mesa já foi encerrada.',
    410
  );
  return { invitation, room };
}
