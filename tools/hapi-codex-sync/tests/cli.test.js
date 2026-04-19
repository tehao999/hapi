const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, runWatchIteration } = require('../src/cli');

test('parses import-file args with defaults', () => {
  assert.deepEqual(parseArgs(['import-file', '--thread-id', 't1', '--file', '/tmp/a.jsonl']), {
    command: 'import-file',
    threadId: 't1',
    file: '/tmp/a.jsonl',
    hapiDb: '/Users/tehao/.hapi/hapi.db',
    codexDb: '/Users/tehao/.codex/state_5.sqlite',
    hapiSettings: '/Users/tehao/.hapi/settings.json',
    hubUrl: 'http://127.0.0.1:3006',
    namespace: 'default',
    delivery: 'db',
    mode: 'all',
    fromLine: 1,
    intervalMs: 1000
  });
});

test('parses import-thread and watch args', () => {
  assert.equal(parseArgs(['import-thread', '--thread-id', 't1', '--from-line', '9']).fromLine, 9);
  const watch = parseArgs(['watch', '--thread-id', 't1', '--interval-ms', '2500']);
  assert.equal(watch.command, 'watch');
  assert.equal(watch.intervalMs, 2500);
});

test('throws for missing required args', () => {
  assert.throws(() => parseArgs(['import-file', '--thread-id', 't1']), /--file is required/);
  assert.throws(() => parseArgs(['import-thread']), /--thread-id is required/);
});

test('parses live socket delivery options', () => {
  const opts = parseArgs(['watch', '--thread-id', 'abc', '--delivery', 'socket', '--hub-url', 'http://127.0.0.1:3006', '--namespace', 'default', '--mode', 'user-only']);
  assert.equal(opts.delivery, 'socket');
  assert.equal(opts.hubUrl, 'http://127.0.0.1:3006');
  assert.equal(opts.namespace, 'default');
  assert.equal(opts.mode, 'user-only');
});

test('throws for invalid mode', () => {
  assert.throws(() => parseArgs(['watch', '--thread-id', 'abc', '--mode', 'tools-only']), /--mode must be all or user-only/);
});

test('watch iteration rotates the socket sink on generation changes and respects nextFromLine retries', async () => {
  const opened = [];
  const closed = [];
  const sinks = [];
  let generation = 1;
  const opts = {
    threadId: 'abc',
    hapiDb: '/tmp/hapi.db',
    hapiSettings: '/tmp/settings.json',
    hubUrl: 'http://127.0.0.1:3006',
    namespace: 'default',
    delivery: 'socket',
    mode: 'all',
    fromLine: 1
  };

  const deps = {
    findSession() {
      return {
        id: 'session-1',
        metadata: { executionControl: { generation } }
      };
    },
    readToken() {
      return 'secret:default';
    },
    createSink({ sessionId, generation: sinkGeneration }) {
      const sink = {
        async open() {
          opened.push({ sessionId, generation: sinkGeneration });
        },
        async close() {
          closed.push({ sessionId, generation: sinkGeneration });
        }
      };
      sinks.push(sink);
      return sink;
    },
    async importWithSink() {
      return {
        read: 3,
        converted: 2,
        inserted: 1,
        skipped: 1,
        missingSession: false,
        nextFromLine: 3
      };
    }
  };

  const first = await runWatchIteration(
    { ...opts },
    { rolloutPath: '/tmp/rollout.jsonl', currentBinding: null, currentSink: null },
    deps
  );

  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0], { sessionId: 'session-1', generation: 1 });
  assert.equal(first.nextFromLine, 3);
  assert.deepEqual(first.report?.binding, { sessionId: 'session-1', generation: 1 });

  generation = 2;
  const second = await runWatchIteration(
    { ...opts, fromLine: first.nextFromLine },
    { rolloutPath: '/tmp/rollout.jsonl', currentBinding: first.currentBinding, currentSink: first.currentSink },
    deps
  );

  assert.equal(closed.length, 1);
  assert.deepEqual(closed[0], { sessionId: 'session-1', generation: 1 });
  assert.equal(opened.length, 2);
  assert.deepEqual(opened[1], { sessionId: 'session-1', generation: 2 });
  assert.equal(second.nextFromLine, 3);
  assert.deepEqual(second.report?.binding, { sessionId: 'session-1', generation: 2 });
});
