const { sqliteJson, sqlString } = require('./hapi-db');

function getCodexThread(dbPath, threadId) {
  const rows = sqliteJson(dbPath, `
    select id, rollout_path, title, cwd, updated_at_ms
    from threads
    where id = ${sqlString(threadId)}
    limit 1
  `);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    rolloutPath: row.rollout_path,
    title: row.title,
    cwd: row.cwd,
    updatedAtMs: row.updated_at_ms
  };
}

function updateCodexThreadTitle(dbPath, threadId, title, nowMs = Date.now()) {
  const normalized = typeof title === 'string' ? title.trim() : '';
  if (!dbPath || !threadId || !normalized) return { changed: false };
  const nowSeconds = Math.floor(nowMs / 1000);
  const rows = sqliteJson(dbPath, `
    update threads
    set title = ${sqlString(normalized)},
        updated_at = ${nowSeconds},
        updated_at_ms = ${nowMs}
    where id = ${sqlString(threadId)}
      and (title is null or title != ${sqlString(normalized)});
    select changes() as changes;
  `);
  return { changed: Number(rows[0]?.changes || 0) > 0 };
}

module.exports = { getCodexThread, updateCodexThreadTitle };
