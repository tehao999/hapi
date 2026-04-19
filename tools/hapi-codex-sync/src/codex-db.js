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

module.exports = { getCodexThread };
