const CONNECTION_EVENTS = [
  'status-find',
  'statusfind',
  'autoclose',
  'browserclose',
  'onack',
  'onpresencechanged',
  'onparticipantschanged',
  'incomingcall',
  'closesession',
  'onreactionmessage',
  'onrevokedmessage',
  'onpollresponse',
  'onupdatelabel',
];
const MAX_AGE_SECONDS = 120;

const text = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

// O WPPConnect envia identificadores ora como texto, ora como objeto.
function flexible(value) {
  if (value == null) return null;
  if (typeof value === 'string') return text(value);
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (typeof value === 'object') {
    if (text(value._serialized)) return value._serialized;
    if (value.user && value.server) return `${value.user}@${value.server}`;
    if (value.id) return flexible(value.id);
  }
  return null;
}

function parseId(id) {
  if (id == null) return { fromMe: null, remote: null, serialized: null };
  if (typeof id === 'string') {
    const match = id.match(/^(true|false)_([^_]+@[^_]+)/);
    return {
      fromMe: match ? match[1] === 'true' : null,
      remote: match ? match[2] : id.includes('@') ? id : null,
      serialized: id,
    };
  }
  const serialized = flexible(id._serialized);
  const fromSerialized = serialized ? parseId(serialized) : null;
  return {
    fromMe:
      typeof id.fromMe === 'boolean'
        ? id.fromMe
        : (fromSerialized?.fromMe ?? null),
    remote:
      flexible(id.remoteJid) ??
      flexible(id.remote) ??
      fromSerialized?.remote ??
      null,
    serialized,
  };
}

export function parseWebhook(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object')
    return { kind: 'ignore', reason: 'payload' };
  const eventName = (
    text(payload.event) ??
    text(payload.type) ??
    ''
  ).toLowerCase();
  const sender = flexible(payload.sender);
  const id = parseId(payload.id);

  if (text(payload.qrcode) || eventName === 'qrcode')
    return { kind: 'qrcode', qrcode: text(payload.qrcode) };
  if (CONNECTION_EVENTS.some((name) => eventName.includes(name)))
    return { kind: 'connection', event: eventName };

  const fromMe =
    eventName === 'onselfmessage' ||
    (typeof payload.fromMe === 'boolean'
      ? payload.fromMe
      : (id.fromMe ?? payload.data?.key?.fromMe ?? false));
  const rawJid =
    text(payload.remoteJid) ??
    text(payload.from) ??
    text(payload.data?.key?.remoteJid) ??
    id.remote ??
    sender;
  const jid =
    rawJid?.includes('@lid') &&
    sender &&
    /@(c\.us|s\.whatsapp\.net)$/.test(sender)
      ? sender
      : rawJid;
  const tapped =
    text(payload.selectedButtonId) ??
    text(payload.content?.selectedButtonId) ??
    text(payload.listResponse?.singleSelectReply?.selectedRowId) ??
    text(payload.selectedRowId);
  const body =
    tapped ??
    text(payload.body) ??
    text(typeof payload.content === 'string' ? payload.content : null) ??
    text(payload.content?.body) ??
    text(payload.content?.conversation) ??
    text(payload.data?.message?.conversation);

  if (fromMe) return { kind: 'ignore', reason: 'fromMe' };
  const stamp = Number(payload.timestamp ?? payload.t);
  if (Number.isFinite(stamp) && stamp > 0) {
    const seconds = stamp > 1e11 ? Math.floor(stamp / 1000) : stamp;
    if (Math.floor(now / 1000) - seconds > MAX_AGE_SECONDS)
      return { kind: 'ignore', reason: 'old' };
  }
  const lowered = (jid ?? '').toLowerCase();
  if (
    payload.isGroupMsg === true ||
    payload.isGroup === true ||
    lowered.includes('@g.us')
  )
    return { kind: 'ignore', reason: 'group' };
  if (
    eventName === 'status' ||
    lowered.includes('status@') ||
    lowered.includes('@broadcast')
  )
    return { kind: 'ignore', reason: 'status' };
  const type = text(payload.type)?.toLowerCase();
  const tapType = [
    'buttons_response',
    'list_response',
    'template_button_reply',
  ];
  if (type ? type !== 'chat' && !(tapped && tapType.includes(type)) : !body)
    return { kind: 'ignore', reason: 'type' };
  if (!body || !jid) return { kind: 'ignore', reason: 'empty' };

  return {
    kind: 'message',
    jid,
    text: body,
    messageId: id.serialized ?? null,
    timestamp: Number.isFinite(stamp) ? stamp : null,
  };
}
