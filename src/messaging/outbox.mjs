import { createEventLog } from '../shared/log.mjs';

export const DEFAULT_TTL_MS = 10 * 60000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera antes da próxima tentativa: 2^n segundos, no máximo 60. */
export const backoffMs = (attempts) => Math.min(2 ** attempts, 60) * 1000;

/**
 * Fila de saída durável. Toda mensagem é gravada no banco antes do envio e só
 * é marcada como enviada depois da confirmação do provedor. Cada destinatário
 * tem a própria fila, em ordem de criação: se a mais antiga falha, as seguintes
 * esperam. Mensagens pendentes além do prazo são descartadas e contadas.
 */
export function createOutbox({
  store,
  provider,
  codec,
  now = () => Date.now(),
  sendIntervalMs = 1000,
  ttlMs = DEFAULT_TTL_MS,
  log = createEventLog(),
}) {
  const db = store.db;
  const counters = { sent: 0, dropped: 0, errors: 0 };
  const workers = new Map();

  const insert = db.prepare(
    `INSERT INTO outbox (to_hash, to_sealed, body, interactive, created_at, expires_at, attempts, next_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  );
  const pendingRow = db.prepare(
    `SELECT * FROM outbox WHERE to_hash = ? AND sent_at IS NULL AND dropped_at IS NULL
     ORDER BY id LIMIT 1`
  );

  /** Grava uma mensagem (ou várias partes, em ordem) para o endereço. */
  function enqueue(address, parts, { ttl = ttlMs } = {}) {
    const at = now();
    const hash = codec.hash(address);
    const sealed = codec.seal(address);
    for (const part of parts)
      insert.run(
        hash,
        sealed,
        part.body,
        part.interactive ? JSON.stringify(part.interactive) : null,
        at,
        at + ttl,
        at
      );
    pump();
  }

  function dropExpired() {
    const at = now();
    const result = db
      .prepare(
        `UPDATE outbox SET dropped_at = ? WHERE sent_at IS NULL AND dropped_at IS NULL AND expires_at <= ?`
      )
      .run(at, at);
    const dropped = Number(result.changes);
    if (dropped) {
      counters.dropped += dropped;
      log.warn('outbox.dropped', { count: dropped });
    }
  }

  async function work(hash) {
    for (;;) {
      dropExpired();
      const row = pendingRow.get(hash);
      if (!row || row.next_at > now()) return;
      try {
        await provider.send(
          codec.open(row.to_sealed),
          row.body,
          row.interactive ? JSON.parse(row.interactive) : undefined
        );
        db.prepare('UPDATE outbox SET sent_at = ? WHERE id = ?').run(
          now(),
          row.id
        );
        counters.sent++;
      } catch (error) {
        const attempts = row.attempts + 1;
        counters.errors++;
        db.prepare(
          'UPDATE outbox SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?'
        ).run(
          attempts,
          now() + backoffMs(attempts),
          String(error.code ?? error.name ?? 'ERROR').slice(0, 40),
          row.id
        );
        log.warn('outbox.send_failed', {
          id: Number(row.id),
          attempts,
          error: String(error.code ?? error.name ?? 'ERROR'),
        });
        return;
      }
      if (sendIntervalMs) await sleep(sendIntervalMs);
    }
  }

  /** Dispara o envio das filas com mensagens vencidas, uma por destinatário. */
  function pump() {
    dropExpired();
    const hashes = db
      .prepare(
        `SELECT DISTINCT to_hash FROM outbox WHERE sent_at IS NULL AND dropped_at IS NULL`
      )
      .all()
      .map((row) => row.to_hash);
    for (const hash of hashes) {
      if (workers.has(hash)) continue;
      const running = work(hash)
        .catch((error) =>
          log.error('outbox.worker_failed', { error: error.name })
        )
        .finally(() => {
          workers.delete(hash);
          // Mensagem gravada enquanto a fila terminava: recomeça já.
          try {
            const next = pendingRow.get(hash);
            if (next && next.next_at <= now()) pump();
          } catch {
            // banco já fechado (encerramento): nada a retomar
          }
        });
      workers.set(hash, running);
    }
  }

  return {
    enqueue,
    pump,
    counters,
    pending: () =>
      Number(
        db
          .prepare(
            'SELECT count(*) AS n FROM outbox WHERE sent_at IS NULL AND dropped_at IS NULL'
          )
          .get().n
      ),
    // Aguarda os envios em andamento (usado em testes e no encerramento).
    async idle() {
      while (workers.size) await Promise.allSettled([...workers.values()]);
    },
  };
}
