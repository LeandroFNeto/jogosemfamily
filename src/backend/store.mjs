import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrateContacts } from './favorites.mjs';

export function openStore(filename) {
  if (filename !== ':memory:')
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invitations (
      token_hash TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), expires INTEGER NOT NULL,
      used_by TEXT REFERENCES profiles(id)
    );
    CREATE TABLE IF NOT EXISTS channel_identities (
      channel TEXT NOT NULL, id_hash TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id),
      address TEXT NOT NULL, PRIMARY KEY (channel, id_hash)
    );
    CREATE TABLE IF NOT EXISTS conversations (
      profile_id TEXT PRIMARY KEY REFERENCES profiles(id), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS processed_messages (
      id TEXT PRIMARY KEY, seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recovery_codes (
      id TEXT PRIMARY KEY, profile_id TEXT, phone_hash TEXT NOT NULL, ip_hash TEXT NOT NULL,
      code_hash TEXT, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS link_codes (
      code_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS favorites (
      owner_id TEXT NOT NULL, friend_id TEXT NOT NULL, state TEXT NOT NULL,
      created_at INTEGER NOT NULL, decided_at INTEGER NOT NULL,
      call_payload TEXT, retry_after INTEGER, PRIMARY KEY (owner_id, friend_id)
    );
    CREATE TABLE IF NOT EXISTS match_results (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL, round INTEGER NOT NULL, game_id TEXT NOT NULL,
      ended_at INTEGER NOT NULL, humans TEXT NOT NULL, winners TEXT NOT NULL, points TEXT NOT NULL,
      UNIQUE (room_id, round)
    );
    CREATE TABLE IF NOT EXISTS call_log (
      batch TEXT NOT NULL, room_id TEXT NOT NULL, owner_id TEXT NOT NULL, friend_id TEXT NOT NULL,
      sent_at INTEGER NOT NULL, answer TEXT
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT, to_hash TEXT NOT NULL, to_sealed TEXT NOT NULL,
      body TEXT NOT NULL, interactive TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, sent_at INTEGER,
      dropped_at INTEGER, last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS web_links (
      token_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
      room_id TEXT NOT NULL, expires INTEGER NOT NULL, used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS maintenance_state (
      key TEXT PRIMARY KEY, value INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(to_hash, id) WHERE sent_at IS NULL AND dropped_at IS NULL;
    CREATE INDEX IF NOT EXISTS favorites_friend ON favorites(friend_id, state);
    CREATE INDEX IF NOT EXISTS call_log_owner ON call_log(owner_id, sent_at);
    CREATE INDEX IF NOT EXISTS call_log_friend ON call_log(friend_id, sent_at);
    CREATE INDEX IF NOT EXISTS recovery_codes_phone ON recovery_codes(phone_hash, created);
    CREATE INDEX IF NOT EXISTS recovery_codes_ip ON recovery_codes(ip_hash, created);
    CREATE INDEX IF NOT EXISTS channel_identities_profile ON channel_identities(profile_id);
    CREATE INDEX IF NOT EXISTS processed_messages_seen ON processed_messages(seen);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE INDEX IF NOT EXISTS rooms_expiry ON rooms(expires);
  `);
  migrateContacts(db);
  const read = (table, id) => {
    const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id);
    return row ? JSON.parse(row.data) : null;
  };
  return {
    db,
    getProfile: (id) => read('profiles', id),
    saveProfile(profile) {
      db.prepare(
        'INSERT INTO profiles VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'
      ).run(profile.id, JSON.stringify(profile));
      // `contacts` ainda é gravado pelo código web: espelha como favorito aceito.
      const now = Date.now();
      const mirror = db.prepare(
        `INSERT INTO favorites (owner_id, friend_id, state, created_at, decided_at)
         VALUES (?, ?, 'accepted', ?, ?)
         ON CONFLICT(owner_id, friend_id) DO UPDATE SET state = 'accepted', decided_at = excluded.decided_at, call_payload = NULL
         WHERE state != 'accepted'`
      );
      for (const friendId of profile.contacts ?? [])
        mirror.run(profile.id, friendId, now, now);
    },
    getRoom: (id) => read('rooms', id),
    saveRoom: (room) =>
      db
        .prepare(
          'INSERT INTO rooms VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, expires=excluded.expires'
        )
        .run(room.id, JSON.stringify(room), room.expires),
    findIdentity: (channel, idHash) =>
      db
        .prepare(
          'SELECT profile_id, address FROM channel_identities WHERE channel = ? AND id_hash = ?'
        )
        .get(channel, idHash) ?? null,
    identityOf: (channel, profileId) =>
      db
        .prepare(
          'SELECT id_hash, address FROM channel_identities WHERE channel = ? AND profile_id = ?'
        )
        .get(channel, profileId) ?? null,
    saveIdentity: (channel, idHash, profileId, address) =>
      db
        .prepare(
          'INSERT INTO channel_identities VALUES (?, ?, ?, ?) ON CONFLICT(channel, id_hash) DO UPDATE SET address=excluded.address'
        )
        .run(channel, idHash, profileId, address),
    getConversation: (profileId) => {
      const row = db
        .prepare('SELECT data FROM conversations WHERE profile_id = ?')
        .get(profileId);
      return row ? JSON.parse(row.data) : null;
    },
    saveConversation: (profileId, data) =>
      db
        .prepare(
          'INSERT INTO conversations VALUES (?, ?) ON CONFLICT(profile_id) DO UPDATE SET data=excluded.data'
        )
        .run(profileId, JSON.stringify(data)),
    markProcessed: (id, now) =>
      Number(
        db
          .prepare('INSERT OR IGNORE INTO processed_messages VALUES (?, ?)')
          .run(id, now).changes
      ) === 1,
    // Limpeza rápida (a cada minuto): só o que já não vale nada. Mensagens
    // processadas, fila de saída e mesas antigas seguem a retenção diária em
    // `maintenance.mjs`.
    cleanup(now) {
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
      db.prepare('DELETE FROM link_codes WHERE expires < ?').run(now);
      db.prepare('DELETE FROM web_links WHERE expires < ?').run(now);
      db.prepare('DELETE FROM invitations WHERE expires < ?').run(now);
    },
    close: () => db.close(),
  };
}
