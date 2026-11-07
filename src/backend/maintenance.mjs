import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createEventLog } from '../shared/log.mjs';

const DAY = 86400000;

export const DEFAULT_RETENTION = {
  messagesDays: 7,
  outboxDays: 7,
  roomsDays: 30,
};

export function retentionFromEnv(env = process.env) {
  const days = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
  };
  return {
    messagesDays: days(
      env.RETENTION_MESSAGES_DAYS,
      DEFAULT_RETENTION.messagesDays
    ),
    outboxDays: days(env.RETENTION_OUTBOX_DAYS, DEFAULT_RETENTION.outboxDays),
    roomsDays: days(env.RETENTION_ROOMS_DAYS, DEFAULT_RETENTION.roomsDays),
  };
}

const BACKUP_NAME = /^mesa-\d{8}\.db$/;
const stamp = (time) =>
  new Date(time).toISOString().slice(0, 10).replaceAll('-', '');

/**
 * Rotinas diárias: limpeza de dados antigos e cópia do banco. O estado
 * (quando cada uma rodou pela última vez) fica no banco, então reiniciar o
 * servidor não repete nem pula uma execução.
 *
 * A limpeza preserva resultados de partidas (`match_results`) e a lista de
 * favoritos; só apaga o que é descartável.
 */
export function createMaintenance({
  store,
  now = () => Date.now(),
  backupDir = null,
  keep = 7,
  retention = DEFAULT_RETENTION,
  log = createEventLog(),
}) {
  const db = store.db;
  const lastRun = (key) =>
    Number(
      db.prepare('SELECT value FROM maintenance_state WHERE key = ?').get(key)
        ?.value ?? 0
    );
  const markRun = (key) =>
    db
      .prepare(
        'INSERT INTO maintenance_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, now());

  function cleanup() {
    const at = now();
    const removed = {};
    const run = (name, sql, ...params) => {
      removed[name] = Number(db.prepare(sql).run(...params).changes);
    };
    run(
      'messages',
      'DELETE FROM processed_messages WHERE seen < ?',
      at - retention.messagesDays * DAY
    );
    run(
      'outbox',
      `DELETE FROM outbox WHERE (sent_at IS NOT NULL AND sent_at < ?) OR (dropped_at IS NOT NULL AND dropped_at < ?)`,
      at - retention.outboxDays * DAY,
      at - retention.outboxDays * DAY
    );
    run('codes', 'DELETE FROM recovery_codes WHERE expires < ?', at);
    // Mesas encerradas há mais tempo que o prazo; resultados e favoritos ficam.
    const limit = at - retention.roomsDays * DAY;
    run(
      'invitations',
      'DELETE FROM invitations WHERE room_id IN (SELECT id FROM rooms WHERE expires < ?)',
      limit
    );
    run('rooms', 'DELETE FROM rooms WHERE expires < ?', limit);
    markRun('cleanup');
    log.info('maintenance.cleanup', removed);
    return removed;
  }

  function backups() {
    if (!backupDir) return [];
    try {
      return readdirSync(backupDir)
        .filter((name) => BACKUP_NAME.test(name))
        .sort();
    } catch {
      return [];
    }
  }

  /** Copia o banco com `VACUUM INTO` (consistente, sem parar o servidor). */
  function backup() {
    if (!backupDir) return null;
    mkdirSync(backupDir, { recursive: true });
    const name = `mesa-${stamp(now())}.db`;
    const target = join(backupDir, name);
    rmSync(target, { force: true });
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    const all = backups();
    for (const old of all.slice(0, Math.max(0, all.length - keep)))
      rmSync(join(backupDir, old), { force: true });
    markRun('backup');
    log.info('maintenance.backup', { file: name, kept: backups().length });
    return target;
  }

  return {
    cleanup,
    backup,
    backups,
    // Chamado pela varredura: roda o que estiver com mais de 24 h.
    tick() {
      const at = now();
      const done = [];
      if (at - lastRun('cleanup') >= DAY) {
        cleanup();
        done.push('cleanup');
      }
      if (backupDir && at - lastRun('backup') >= DAY) {
        backup();
        done.push('backup');
      }
      return done;
    },
  };
}
