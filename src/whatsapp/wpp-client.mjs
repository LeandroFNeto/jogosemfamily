/**
 * Cliente mínimo do WPPConnect server (mesma API usada pelo Tech-Saas):
 * token por sessão, start-session com webhook, status, QR Code e send-message.
 */
export function normalizeStatus(raw, qrcode) {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (
    (value.includes('CONNECT') && !value.includes('DISCONNECT')) ||
    value.includes('INCHAT') ||
    value.includes('ISLOGGED')
  )
    return 'CONNECTED';
  if (value.includes('QR') || value.includes('INIT') || qrcode) return 'QRCODE';
  return 'DISCONNECTED';
}

const asDataUrl = (qrcode) =>
  !qrcode || qrcode === 'null'
    ? null
    : qrcode.startsWith('data:')
      ? qrcode
      : `data:image/png;base64,${qrcode}`;

export function createWppClient({
  url,
  secretKey,
  session,
  webhookUrl,
  fetchImpl = fetch,
  timeoutMs = 15000,
}) {
  let token = '';
  let qrcode = null;
  const base = String(url).replace(/\/$/, '');

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = `Bearer ${await getToken()}`;
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 && auth) {
      token = '';
      const error = new Error('Token do WPPConnect recusado.');
      error.unauthorized = true;
      throw error;
    }
    if (!response.ok)
      throw new Error(`WPPConnect respondeu ${response.status}.`);
    return response.json().catch(() => ({}));
  }

  async function getToken() {
    if (token) return token;
    const response = await fetchImpl(
      `${base}/api/${session}/${secretKey}/generate-token`,
      { method: 'POST', signal: AbortSignal.timeout(timeoutMs) }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.token !== 'string')
      throw new Error('Não foi possível gerar o token do WPPConnect.');
    token = data.token;
    return token;
  }

  async function withRetry(operation) {
    try {
      return await operation();
    } catch (error) {
      if (!error.unauthorized) throw error;
      return operation();
    }
  }

  function toStatus(body) {
    const incoming = asDataUrl(body?.qrcode);
    if (incoming) qrcode = incoming;
    const status = normalizeStatus(body?.status, incoming);
    if (status === 'CONNECTED') qrcode = null;
    return {
      session,
      status,
      qrcodeBase64: status === 'QRCODE' ? qrcode : null,
    };
  }

  return {
    session,
    rememberQrcode(raw) {
      qrcode = asDataUrl(raw) ?? qrcode;
    },
    async status() {
      try {
        return toStatus(
          await withRetry(() => request(`/api/${session}/status-session`))
        );
      } catch {
        return { session, status: 'DISCONNECTED', qrcodeBase64: null };
      }
    },
    async start() {
      const current = await this.status();
      if (current.status === 'CONNECTED') return current;
      try {
        return toStatus(
          await withRetry(() =>
            request(`/api/${session}/start-session`, {
              method: 'POST',
              body: { webhook: webhookUrl, waitQrCode: false },
            })
          )
        );
      } catch {
        return this.status();
      }
    },
    async sendButtons(address, message, buttons) {
      await withRetry(() =>
        request(`/api/${session}/send-buttons`, {
          method: 'POST',
          body: {
            phone: address,
            isGroup: false,
            message,
            options: { useTemplateButtons: true, buttons },
          },
        })
      );
    },
    async sendList(address, message, rows) {
      await withRetry(() =>
        request(`/api/${session}/send-list-message`, {
          method: 'POST',
          body: {
            phone: address,
            isGroup: false,
            description: message,
            buttonText: 'Ver opções',
            sections: [{ title: 'Opções', rows }],
          },
        })
      );
    },
    async sendImage(address, { base64, filename, caption }) {
      await withRetry(() =>
        request(`/api/${session}/send-image`, {
          method: 'POST',
          body: { phone: address, isGroup: false, filename, caption, base64 },
        })
      );
    },
    async sendText(address, message) {
      await withRetry(() =>
        request(`/api/${session}/send-message`, {
          method: 'POST',
          body: { phone: address, isGroup: false, message },
        })
      );
    },
  };
}
