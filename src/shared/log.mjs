/**
 * Registro de eventos operacionais sem dados pessoais. Campos que costumam
 * carregar telefone ou conteúdo de mensagem são descartados, e qualquer texto
 * com uma sequência longa de dígitos (um número de telefone) é ocultado.
 */
const BLOCKED = new Set([
  'phone',
  'to',
  'from',
  'body',
  'address',
  'jid',
  'number',
  'message',
  'text',
  'name',
]);

const scrub = (value) =>
  typeof value === 'string' ? value.replace(/\d{8,}/g, '[oculto]') : value;

export function redact(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => !BLOCKED.has(key.toLowerCase()))
      .map(([key, value]) => [key, scrub(value)])
  );
}

export function createEventLog(sink = console) {
  const write = (level, method) => (event, fields) =>
    sink[method]?.(JSON.stringify({ level, event, ...redact(fields) }));
  return {
    info: write('info', 'log'),
    warn: write('warn', 'warn'),
    error: write('error', 'error'),
  };
}
