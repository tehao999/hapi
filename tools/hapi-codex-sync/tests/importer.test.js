const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { importRolloutFile } = require('../src/importer');

function tempHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'importer-test-'));
  const dbPath = path.join(dir, 'hapi.db');
  const rolloutPath = path.join(dir, 'rollout.jsonl');
  execFileSync('sqlite3', [dbPath, `
    create table sessions (
      id text primary key, tag text, namespace text not null default 'default', machine_id text,
      created_at integer not null, updated_at integer not null, metadata text, metadata_version integer default 1,
      agent_state text, agent_state_version integer default 1, model text, model_reasoning_effort text, effort text,
      todos text, todos_updated_at integer, team_state text, team_state_updated_at integer,
      active integer default 0, active_at integer, seq integer default 0
    );
    create table messages (id text primary key, session_id text not null, content text not null, created_at integer not null, seq integer not null, local_id text);
    create unique index idx_messages_local_id on messages(session_id, local_id) where local_id is not null;
    insert into sessions (id,tag,namespace,created_at,updated_at,metadata,seq)
    values ('hapi-1','tag-1','default',1000,1000,'{"codexSessionId":"codex-1","path":"/tmp/project","flavor":"codex"}',0);
  `]);
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    { timestamp: '2026-04-18T05:00:01.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'desktop asks' } },
    { timestamp: '2026-04-18T05:00:02.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_1', arguments: '{"cmd":"pwd"}' } },
    { timestamp: '2026-04-18T05:00:03.000Z', type: 'event_msg', payload: { type: 'token_count' } },
    { timestamp: '2026-04-18T05:00:04.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'done', phase: 'final_answer' } }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
  return { dbPath, rolloutPath };
}

test('imports supported rollout events into matching HAPI session and skips duplicates', () => {
  const { dbPath, rolloutPath } = tempHarness();
  const first = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 1 });
  const second = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 1 });

  assert.deepEqual(first, { read: 5, converted: 3, inserted: 3, skipped: 2, missingSession: false });
  assert.deepEqual(second, { read: 5, converted: 3, inserted: 0, skipped: 5, missingSession: false });

  const rows = JSON.parse(execFileSync('sqlite3', ['-json', dbPath, 'select seq,local_id,content from messages order by seq']).toString());
  assert.equal(rows.length, 3);
  assert.match(rows[0].local_id, /^codex:codex-1:2:/);
  assert.equal(JSON.parse(rows[0].content).role, 'user');
  assert.equal(JSON.parse(rows[2].content).content.data.message, 'done');
});

test('can start importing from a later line', () => {
  const { dbPath, rolloutPath } = tempHarness();
  const result = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 5 });
  assert.deepEqual(result, { read: 1, converted: 1, inserted: 1, skipped: 0, missingSession: false });
});

test('reports missing HAPI session without inserting anything', () => {
  const { dbPath, rolloutPath } = tempHarness();
  const result = importRolloutFile({ hapiDbPath: dbPath, threadId: 'missing-codex', rolloutPath, fromLine: 1 });
  assert.deepEqual(result, { read: 0, converted: 0, inserted: 0, skipped: 0, missingSession: true });
});

test('imports supported rollout events through live sink without direct DB inserts', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 5, converted: 3, inserted: 3, skipped: 2, missingSession: false });
  assert.equal(writes.length, 3);
  assert.equal(writes[0].sessionId, 'hapi-1');
  assert.match(writes[0].localId, /^codex:codex-1:2:/);
  assert.equal(writes[0].message.role, 'user');

  const rows = JSON.parse(execFileSync('sqlite3', ['-json', dbPath, 'select * from messages']).toString() || '[]');
  assert.equal(rows.length, 0);
});

test('live sink dedupes exact semantic duplicates within the same batch', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'same final answer' }],
        phase: 'final_answer'
      }
    },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'same final answer', phase: 'final_answer' }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 3, converted: 2, inserted: 1, skipped: 2, missingSession: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.role, 'agent');
  assert.equal(writes[0].message.content.data.message, 'same final answer');
});

test('live sink dedupes nearby assistant message duplicates even when timestamps differ slightly', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'same commentary line', phase: 'commentary' }
    },
    {
      timestamp: '2026-04-18T05:00:01.001Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'same commentary line' }],
        phase: 'commentary'
      }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 3, converted: 2, inserted: 1, skipped: 2, missingSession: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.role, 'agent');
  assert.equal(writes[0].message.content.data.message, 'same commentary line');
});

test('live sink dedupes nearby user message duplicates in all mode when timestamps differ slightly', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'desktop duplicated user line\n' }]
      }
    },
    {
      timestamp: '2026-04-18T05:00:01.001Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'desktop duplicated user line\n' }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    mode: 'all',
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 3, converted: 2, inserted: 1, skipped: 2, missingSession: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.role, 'user');
  assert.equal(writes[0].message.content.text, 'desktop duplicated user line\n');
});

test('live sink keeps only the shortest repeated user message variant for the same timestamp', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'hapi手机端可以加信息通知吗\n' }
    },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: 'hapi手机端可以加信息通知吗\n\nhapi手机端可以加信息通知吗\n\nhapi手机端可以加信息通知吗\n'
      }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 3, converted: 2, inserted: 1, skipped: 2, missingSession: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.role, 'user');
  assert.equal(writes[0].message.content.text, 'hapi手机端可以加信息通知吗\n');
});

test('user-only mode writes deduped user messages and skips agent/tool events', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'desktop live message\n' }]
      }
    },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'desktop live message\n' }
    },
    {
      timestamp: '2026-04-18T05:00:02.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'desktop live message\n' }]
      }
    },
    {
      timestamp: '2026-04-18T05:00:03.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'assistant should stay out of user-only live sync' }],
        phase: 'final_answer'
      }
    },
    {
      timestamp: '2026-04-18T05:00:04.000Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command', call_id: 'call_1', arguments: '{"cmd":"pwd"}' }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    mode: 'user-only',
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 6, converted: 3, inserted: 1, skipped: 5, missingSession: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.role, 'user');
  assert.equal(writes[0].message.content.text, 'desktop live message\n');
});

test('live sink stops at retryable passive sync rejections and returns nextFromLine for retry', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    { timestamp: '2026-04-18T05:00:01.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'first line' } },
    { timestamp: '2026-04-18T05:00:02.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'second line', phase: 'commentary' } }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    sink: {
      async write(item) {
        writes.push(item);
        if (writes.length === 2) {
          return { inserted: false, reason: 'stale-generation' };
        }
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, {
    read: 3,
    converted: 2,
    inserted: 1,
    skipped: 1,
    missingSession: false,
    nextFromLine: 3
  });
  assert.equal(writes.length, 2);
  assert.equal(writes[0].localId.split(':')[2], '2');
  assert.equal(writes[1].localId.split(':')[2], '3');
});

test('db import skips nearby assistant message duplicates across sequential imports', () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'same commentary line', phase: 'commentary' }
    },
    {
      timestamp: '2026-04-18T05:00:01.001Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'same commentary line' }],
        phase: 'commentary'
      }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const first = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 2, toLine: 2, mode: 'all' });
  const second = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 3, toLine: 3, mode: 'all' });

  assert.deepEqual(first, { read: 1, converted: 1, inserted: 1, skipped: 0, missingSession: false });
  assert.deepEqual(second, { read: 1, converted: 1, inserted: 0, skipped: 1, missingSession: false });

  const rows = JSON.parse(execFileSync('sqlite3', ['-json', dbPath, 'select seq,local_id,content from messages order by seq']).toString());
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].content).content.data.message, 'same commentary line');
});

test('db import skips nearby user message duplicates across sequential all-mode imports', () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'desktop duplicated user line\n' }]
      }
    },
    {
      timestamp: '2026-04-18T05:00:01.001Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'desktop duplicated user line\n' }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const first = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 2, toLine: 2, mode: 'all' });
  const second = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 3, toLine: 3, mode: 'all' });

  assert.deepEqual(first, { read: 1, converted: 1, inserted: 1, skipped: 0, missingSession: false });
  assert.deepEqual(second, { read: 1, converted: 1, inserted: 0, skipped: 1, missingSession: false });

  const rows = JSON.parse(execFileSync('sqlite3', ['-json', dbPath, 'select seq,local_id,content from messages order by seq']).toString());
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].content).content.text, 'desktop duplicated user line\n');
});

test('user-only mode skips already stored user text even when rollout timestamp differs', () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'same user text\n' }]
      }
    },
    {
      timestamp: '2026-04-18T05:01:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'same user text\n' }]
      }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const first = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 1, mode: 'user-only' });
  const second = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 3, mode: 'user-only' });

  assert.deepEqual(first, { read: 3, converted: 2, inserted: 1, skipped: 2, missingSession: false });
  assert.deepEqual(second, { read: 1, converted: 1, inserted: 0, skipped: 1, missingSession: false });

  const rows = JSON.parse(execFileSync('sqlite3', ['-json', dbPath, 'select content from messages']).toString());
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].content).content.text, 'same user text\n');
});

test('user-only mode keeps repeated user text when messages are far apart', () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'continue' }]
      }
    },
    {
      timestamp: '2026-04-18T05:03:30.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'continue' }]
      }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const result = importRolloutFile({ hapiDbPath: dbPath, threadId: 'codex-1', rolloutPath, fromLine: 1, mode: 'user-only' });

  assert.deepEqual(result, { read: 3, converted: 2, inserted: 2, skipped: 1, missingSession: false });
  const rows = JSON.parse(execFileSync('sqlite3', ['-json', dbPath, 'select content from messages order by seq']).toString());
  assert.equal(rows.length, 2);
  assert.equal(JSON.parse(rows[0].content).content.text, 'continue');
  assert.equal(JSON.parse(rows[1].content).content.text, 'continue');
});

test('live sink skips recent HAPI-origin user echoes and continues importing later desktop messages', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  execFileSync('sqlite3', [dbPath, `
    insert into messages (id, session_id, content, created_at, seq, local_id)
    values (
      'existing-webapp-user',
      'hapi-1',
      '{"role":"user","content":{"type":"text","text":"Hapi发送测试，第二轮"},"meta":{"sentFrom":"webapp"}}',
      1776573950000,
      1,
      'local-webapp-1'
    );
    update sessions set seq = 1, updated_at = 1776573950000 where id = 'hapi-1';
  `]);

  const lines = [
    { timestamp: '2026-04-19T04:45:56.648Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hapi发送测试，第二轮' }] } },
    { timestamp: '2026-04-19T04:47:04.906Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '桌面端重开同线程发消息测试 第二轮\n' }] } }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 2, converted: 2, inserted: 1, skipped: 1, missingSession: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.role, 'user');
  assert.equal(writes[0].message.content.text, '桌面端重开同线程发消息测试 第二轮\n');
});

test('live sink skips recent HAPI-origin tool echoes and continues importing later desktop messages', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  execFileSync('sqlite3', [dbPath, `
    insert into messages (id, session_id, content, created_at, seq, local_id)
    values
      (
        'existing-cli-tool-call',
        'hapi-1',
        '{"role":"agent","content":{"type":"codex","data":{"type":"tool-call","name":"CodexBash","callId":"call_hapi_1","input":{"command":"pwd","cwd":"/tmp/project"}}},"meta":{"sentFrom":"cli"}}',
        1776573960000,
        1,
        NULL
      ),
      (
        'existing-cli-tool-result',
        'hapi-1',
        '{"role":"agent","content":{"type":"codex","data":{"type":"tool-call-result","callId":"call_hapi_1","output":{"status":"completed","exit_code":0}}},"meta":{"sentFrom":"cli"}}',
        1776573961000,
        2,
        NULL
      );
    update sessions set seq = 2, updated_at = 1776573961000 where id = 'hapi-1';
  `]);

  const lines = [
    {
      timestamp: '2026-04-19T04:46:00.000Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command', call_id: 'call_hapi_1', arguments: '{"cmd":"pwd","workdir":"/tmp/project"}' }
    },
    {
      timestamp: '2026-04-19T04:46:01.000Z',
      type: 'response_item',
      payload: { type: 'function_call_output', call_id: 'call_hapi_1', output: 'pwd output' }
    },
    {
      timestamp: '2026-04-19T04:47:04.906Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'later desktop message should still sync' }],
        phase: 'commentary'
      }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 3, converted: 3, inserted: 1, skipped: 2, missingSession: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.role, 'agent');
  assert.equal(writes[0].message.content.data.type, 'message');
  assert.equal(writes[0].message.content.data.message, 'later desktop message should still sync');
});

test('user-only mode skips Codex system-injected pseudo-user messages', async () => {
  const { dbPath, rolloutPath } = tempHarness();
  const lines = [
    { timestamp: '2026-04-18T05:00:00.000Z', type: 'session_meta', payload: { id: 'codex-1' } },
    {
      timestamp: '2026-04-18T05:00:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '<subagent_notification>\n{"status":"completed"}\n</subagent_notification>' }]
      }
    },
    {
      timestamp: '2026-04-18T05:00:02.000Z',
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: '<turn_aborted>\nThe user interrupted the previous turn on purpose.\n</turn_aborted>'
      }
    },
    {
      timestamp: '2026-04-18T05:00:03.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '真正的桌面用户消息\n' }]
      }
    }
  ];
  fs.writeFileSync(rolloutPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const writes = [];
  const result = await importRolloutFile.withSink({
    hapiDbPath: dbPath,
    threadId: 'codex-1',
    rolloutPath,
    fromLine: 1,
    mode: 'user-only',
    sink: {
      async write(item) {
        writes.push(item);
        return { inserted: true };
      }
    }
  });

  assert.deepEqual(result, { read: 4, converted: 1, inserted: 1, skipped: 3, missingSession: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message.role, 'user');
  assert.equal(writes[0].message.content.text, '真正的桌面用户消息\n');
});
