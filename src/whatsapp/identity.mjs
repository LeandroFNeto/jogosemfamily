import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

/**
 * Normaliza um JID do WhatsApp. Telefones (`@c.us`, `@s.whatsapp.net`) e
 * identificadores ocultos (`@lid`) nunca se misturam: cada tipo tem sua chave.
 */
export function parseJid(jid) {
  if (typeof jid !== 'string') return null;
  const match = jid
    .trim()
    .match(/^(\d{6,20})(?::\d+)?@(c\.us|s\.whatsapp\.net|lid)$/);
  if (!match) return null;
  const [, digits, server] = match;
  const kind = server === 'lid' ? 'lid' : 'phone';
  return {
    key: `${kind}:${digits}`,
    address: kind === 'lid' ? `${digits}@lid` : `${digits}@c.us`,
  };
}

export function maskJid(jid) {
  const digits = String(jid ?? '').match(/\d+/)?.[0];
  if (!digits) return '[sem-numero]';
  return digits.length <= 4
    ? '****'
    : `${digits.slice(0, 2)}****${digits.slice(-2)}`;
}

export function createIdentityCodec(secret) {
  requireSecret(secret);
  const hmacKey = createHash('sha256').update(`hash:${secret}`).digest();
  const aesKey = createHash('sha256').update(`seal:${secret}`).digest();
  return {
    hash: (key) => createHmac('sha256', hmacKey).update(key).digest('hex'),
    seal(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
      const body = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    open(sealed) {
      const raw = Buffer.from(sealed, 'base64');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        aesKey,
        raw.subarray(0, 12)
      );
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 8)
    throw new Error('Configure um segredo de pelo menos 8 caracteres.');
}
