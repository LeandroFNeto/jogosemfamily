const DAY = 86400000;
const HOUR = 3600000;
export const DECLINE_WAIT = 7 * DAY;
export const MAX_RECIPIENTS = 20;
export const CALL_GAP = 5 * 60000;
export const CALLS_PER_HOUR = 3;

/**
 * Favoritos permanentes, resultados de partidas e ranking. Tudo no SQLite.
 * Estados do favorito (do ponto de vista de quem chama): pending, accepted,
 * declined, blocked.
 */
export function createFavorites(store, now = () => Date.now()) {
  const { db } = store;

  const get = (ownerId, friendId) =>
    db
      .prepare('SELECT * FROM favorites WHERE owner_id = ? AND friend_id = ?')
      .get(ownerId, friendId) ?? null;

  function set(ownerId, friendId, state, extra = {}) {
    const current = get(ownerId, friendId);
    const payload =
      'payload' in extra ? extra.payload : (current?.call_payload ?? null);
    const retry =
      'retryAfter' in extra ? extra.retryAfter : (current?.retry_after ?? null);
    db.prepare(
      `INSERT INTO favorites (owner_id, friend_id, state, created_at, decided_at, call_payload, retry_after)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_id, friend_id) DO UPDATE SET state = excluded.state,
         decided_at = excluded.decided_at, call_payload = excluded.call_payload,
         retry_after = excluded.retry_after`
    ).run(
      ownerId,
      friendId,
      state,
      current?.created_at ?? now(),
      now(),
      payload ? JSON.stringify(payload) : null,
      retry
    );
  }

  const remove = (ownerId, friendId) =>
    db
      .prepare('DELETE FROM favorites WHERE owner_id = ? AND friend_id = ?')
      .run(ownerId, friendId);

  const list = (ownerId, states = ['accepted']) =>
    db
      .prepare(
        `SELECT * FROM favorites WHERE owner_id = ? AND state IN (${states.map(() => '?').join(',')}) ORDER BY created_at, friend_id`
      )
      .all(ownerId, ...states);

  /** Chamados diretos à espera de resposta de quem os recebeu. */
  const pendingFor = (friendId) =>
    db
      .prepare(
        "SELECT * FROM favorites WHERE friend_id = ? AND state = 'pending' AND call_payload IS NOT NULL ORDER BY decided_at DESC"
      )
      .all(friendId);

  /** Aceite nos dois sentidos (entrada pelo link, aprovação no site). */
  function befriend(aId, bId) {
    set(aId, bId, 'accepted', { payload: null, retryAfter: null });
    set(bId, aId, 'accepted', { payload: null, retryAfter: null });
  }

  // ---- chamados em massa
  const logCall = (batch, roomId, ownerId, friendId) =>
    db
      .prepare(
        'INSERT INTO call_log (batch, room_id, owner_id, friend_id, sent_at, answer) VALUES (?, ?, ?, ?, ?, NULL)'
      )
      .run(batch, roomId, ownerId, friendId, now());

  function callLimit(ownerId, roomId) {
    const last = db
      .prepare('SELECT max(sent_at) AS at FROM call_log WHERE room_id = ?')
      .get(roomId).at;
    if (last && now() - last < CALL_GAP)
      return {
        wait: Math.ceil((CALL_GAP - (now() - last)) / 1000),
        reason: 'room',
      };
    const recent = db
      .prepare(
        'SELECT batch, min(sent_at) AS at FROM call_log WHERE owner_id = ? AND sent_at > ? GROUP BY batch ORDER BY at'
      )
      .all(ownerId, now() - HOUR);
    if (recent.length >= CALLS_PER_HOUR)
      return {
        wait: Math.ceil((recent[0].at + HOUR - now()) / 1000),
        reason: 'hour',
      };
    return null;
  }

  const lastCallTo = (friendId) =>
    db
      .prepare(
        'SELECT * FROM call_log WHERE friend_id = ? ORDER BY sent_at DESC, rowid DESC LIMIT 1'
      )
      .get(friendId) ?? null;

  const hasCall = (friendId, roomId) =>
    Boolean(
      db
        .prepare('SELECT 1 FROM call_log WHERE friend_id = ? AND room_id = ?')
        .get(friendId, roomId)
    );

  const answerCalls = (friendId, roomId, answer) =>
    db
      .prepare(
        'UPDATE call_log SET answer = ? WHERE friend_id = ? AND room_id = ? AND answer IS NULL'
      )
      .run(answer, friendId, roomId);

  // ---- resultados e ranking
  function recordResult(room) {
    const humans = room.playerIds.filter((id) => !room.botIds.includes(id));
    if (!humans.length || room.game?.status !== 'FINISHED') return;
    const result = room.game.result ?? {};
    const winners = (
      result.winnerIds ??
      (result.cooperative ? humans : result.winnerId ? [result.winnerId] : [])
    ).filter((id) => humans.includes(id));
    const points = Object.fromEntries(
      winners.map((id) => [id, result.points ?? 0])
    );
    db.prepare(
      `INSERT OR IGNORE INTO match_results (id, room_id, round, game_id, ended_at, humans, winners, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `${room.id}:${room.round ?? 1}`,
      room.id,
      room.round ?? 1,
      room.gameId,
      now(),
      JSON.stringify(humans),
      JSON.stringify(winners),
      JSON.stringify(points)
    );
  }

  /** Pessoa e favoritos aceitos, ordenados por vitórias, taxa e partidas. */
  function ranking(profileId, gameId = null) {
    const group = new Set([
      profileId,
      ...list(profileId).map((row) => row.friend_id),
    ]);
    const rows = gameId
      ? db.prepare('SELECT * FROM match_results WHERE game_id = ?').all(gameId)
      : db.prepare('SELECT * FROM match_results').all();
    const stats = new Map(
      [...group].map((id) => [id, { id, wins: 0, games: 0 }])
    );
    for (const row of rows) {
      const humans = JSON.parse(row.humans);
      if (!humans.every((id) => group.has(id))) continue;
      const winners = JSON.parse(row.winners);
      for (const id of humans) {
        stats.get(id).games++;
        if (winners.includes(id)) stats.get(id).wins++;
      }
    }
    return [...stats.values()]
      .map((entry) => ({
        ...entry,
        rate: entry.games ? Math.round((entry.wins / entry.games) * 100) : 0,
      }))
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.rate - a.rate ||
          b.games - a.games ||
          a.id.localeCompare(b.id)
      );
  }

  return {
    get,
    set,
    remove,
    list,
    pendingFor,
    befriend,
    logCall,
    callLimit,
    lastCallTo,
    hasCall,
    answerCalls,
    recordResult,
    ranking,
  };
}

/** Copia `profile.contacts` para `favorites` como aceitos; seguro repetir. */
export function migrateContacts(db, now = Date.now()) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO favorites (owner_id, friend_id, state, created_at, decided_at) VALUES (?, ?, 'accepted', ?, ?)"
  );
  for (const row of db.prepare('SELECT data FROM profiles').all()) {
    const profile = JSON.parse(row.data);
    for (const friendId of profile.contacts ?? [])
      insert.run(profile.id, friendId, now, now);
  }
}
