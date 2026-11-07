import { createHash, randomInt } from 'node:crypto';
import { AppError, requireValue } from '../shared/errors.mjs';
import { parseJid } from './identity.mjs';
import {
  hashToken,
  WHATSAPP_CODE_PATTERN,
  normalizeWhatsappCode,
} from '../invitations/service.mjs';

const CHANNEL = 'whatsapp';
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const CODE_TTL = 10 * MINUTE;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 3;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LINK_LENGTH = 8;

const sha = (value) => createHash('sha256').update(value).digest('hex');
const INVALID = 'Código inválido ou expirado. Peça um novo código.';

/**
 * Recuperação de conta pelo número de WhatsApp registrado e vínculo de número a
 * perfis criados no site. O número só é aceito no formato do WhatsApp (DDI+DDD).
 */
export function createRecovery({ store, codec, send, now = () => Date.now() }) {
  function phoneHash(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    requireValue(
      digits.length >= 10 && digits.length <= 15,
      'Informe o número com DDI e DDD, somente dígitos (ex.: 5511999999999).'
    );
    return codec.hash(parseJid(`${digits}@c.us`).key);
  }

  const count = (column, value) =>
    store.db
      .prepare(
        `SELECT count(*) AS n FROM recovery_codes WHERE ${column} = ? AND created > ?`
      )
      .get(value, now() - HOUR).n;

  /** Responde igual existindo ou não perfil para o número (sem enumerar). */
  function request(phone, origin) {
    const hash = phoneHash(phone);
    const ip = sha(`ip:${origin ?? ''}`);
    requireValue(
      count('phone_hash', hash) < MAX_REQUESTS_PER_HOUR &&
        count('ip_hash', ip) < MAX_REQUESTS_PER_HOUR,
      'Muitos pedidos de código. Tente novamente em uma hora.',
      429
    );
    const identity = store.findIdentity(CHANNEL, hash);
    const id = hashToken(`rec:${now()}:${Math.random()}`).slice(0, 32);
    let codeHash = null;
    let code = null;
    if (identity) {
      code = String(randomInt(100000, 1000000));
      codeHash = sha(`${id}:${code}`);
    }
    store.db
      .prepare(
        'INSERT INTO recovery_codes (id, profile_id, phone_hash, ip_hash, code_hash, expires, attempts, created, used) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
      )
      .run(
        id,
        identity?.profile_id ?? null,
        hash,
        ip,
        codeHash,
        now() + CODE_TTL,
        now(),
        identity ? 0 : 1
      );
    if (identity)
      send(
        identity.profile_id,
        `🔐 Seu código de recuperação da Mesa em Família é *${code}*. Vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem.`
      );
    return { ok: true };
  }

  /** Devolve o id do perfil quando o código confere; caso contrário, erro genérico. */
  function verify(phone, code) {
    const hash = phoneHash(phone);
    const row = store.db
      .prepare(
        'SELECT * FROM recovery_codes WHERE phone_hash = ? AND used = 0 AND expires > ? ORDER BY created DESC LIMIT 1'
      )
      .get(hash, now());
    requireValue(row && row.profile_id, INVALID, 400);
    const given = String(code ?? '').replace(/\D/g, '');
    if (sha(`${row.id}:${given}`) !== row.code_hash) {
      const attempts = row.attempts + 1;
      store.db
        .prepare(
          'UPDATE recovery_codes SET attempts = ?, used = ? WHERE id = ?'
        )
        .run(attempts, attempts >= MAX_ATTEMPTS ? 1 : 0, row.id);
      throw new AppError(INVALID, 400);
    }
    store.db
      .prepare('UPDATE recovery_codes SET used = 1 WHERE phone_hash = ?')
      .run(hash);
    return row.profile_id;
  }

  function notifyAccess(profileId) {
    send(
      profileId,
      '⚠️ Sua conta da Mesa em Família foi acessada em outro aparelho. Se não foi você, responda *ajuda*.'
    );
  }

  /** Código mostrado no site; a pessoa o envia ao bot para registrar o número. */
  function issueLinkCode(profileId) {
    requireValue(
      !store.identityOf(CHANNEL, profileId),
      'Este perfil já tem um número de WhatsApp registrado.',
      409
    );
    let code = '';
    for (let i = 0; i < LINK_LENGTH; i++)
      code += ALPHABET[randomInt(ALPHABET.length)];
    store.db
      .prepare('DELETE FROM link_codes WHERE profile_id = ?')
      .run(profileId);
    const expires = now() + CODE_TTL;
    store.db
      .prepare('INSERT INTO link_codes VALUES (?, ?, ?)')
      .run(hashToken(`link:${code}`), profileId, expires);
    return { code, expires };
  }

  /**
   * Chamado quando o WhatsApp recebe `VINCULAR <código>`. O número passa a
   * pertencer ao perfil do site; perfis com nome nunca são mesclados.
   */
  function redeemLinkCode(rawCode, whatsappProfile) {
    const code = normalizeWhatsappCode(rawCode);
    const row =
      WHATSAPP_CODE_PATTERN.test(code) &&
      store.db
        .prepare('SELECT * FROM link_codes WHERE code_hash = ? AND expires > ?')
        .get(hashToken(`link:${code}`), now());
    requireValue(row, INVALID, 400);
    const target = store.getProfile(row.profile_id);
    requireValue(target, INVALID, 400);
    requireValue(
      !store.identityOf(CHANNEL, target.id),
      'Este perfil já tem um número de WhatsApp registrado.',
      409
    );
    if (whatsappProfile.id === target.id) return target;
    requireValue(
      !whatsappProfile.name,
      'Este número já tem um perfil com nome no WhatsApp. Não é possível vincular os dois perfis.',
      409
    );
    const identity = store.identityOf(CHANNEL, whatsappProfile.id);
    store.db
      .prepare(
        'UPDATE channel_identities SET profile_id = ? WHERE channel = ? AND id_hash = ?'
      )
      .run(target.id, CHANNEL, identity.id_hash);
    store.db
      .prepare('DELETE FROM conversations WHERE profile_id = ?')
      .run(whatsappProfile.id);
    store.db
      .prepare('DELETE FROM profiles WHERE id = ?')
      .run(whatsappProfile.id);
    store.db
      .prepare('DELETE FROM link_codes WHERE profile_id = ?')
      .run(target.id);
    store.saveConversation(target.id, { state: 'MENU' });
    return target;
  }

  return { request, verify, notifyAccess, issueLinkCode, redeemLinkCode };
}
