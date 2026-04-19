const path = require('node:path');
const { importRolloutFile } = require('./importer');
const { getCodexThread, updateCodexThreadTitle } = require('./codex-db');
const { findHapiSessionByCodexId, updateSessionMetadata } = require('./hapi-db');
const { createCliMessageSink } = require('./socket-sink');
const { readCliApiToken } = require('./hapi-settings');
const { resolveBindingChange } = require('./session-binding');

const DEFAULT_HAPI_DB = '/Users/tehao/.hapi/hapi.db';
const DEFAULT_CODEX_DB = '/Users/tehao/.codex/state_5.sqlite';
const DEFAULT_HAPI_SETTINGS = '/Users/tehao/.hapi/settings.json';
const DEFAULT_HUB_URL = 'http://127.0.0.1:3006';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || !['import-file', 'import-thread', 'watch'].includes(command)) {
    throw new Error('Usage: hapi-codex-sync <import-file|import-thread|watch> --thread-id <id> [--file <rollout.jsonl>] [--from-line <n>] [--delivery db|socket]');
  }
  const opts = {
    command,
    hapiDb: DEFAULT_HAPI_DB,
    codexDb: DEFAULT_CODEX_DB,
    hapiSettings: DEFAULT_HAPI_SETTINGS,
    hubUrl: DEFAULT_HUB_URL,
    namespace: 'default',
    delivery: 'db',
    mode: 'all',
    fromLine: 1,
    intervalMs: 1000
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = () => {
      const value = rest[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === '--thread-id') opts.threadId = next();
    else if (arg === '--file') opts.file = next();
    else if (arg === '--hapi-db') opts.hapiDb = next();
    else if (arg === '--codex-db') opts.codexDb = next();
    else if (arg === '--hapi-settings') opts.hapiSettings = next();
    else if (arg === '--hub-url') opts.hubUrl = next();
    else if (arg === '--namespace') opts.namespace = next();
    else if (arg === '--delivery') opts.delivery = next();
    else if (arg === '--mode') opts.mode = next();
    else if (arg === '--from-line') opts.fromLine = Number(next());
    else if (arg === '--interval-ms') opts.intervalMs = Number(next());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.threadId) throw new Error('--thread-id is required');
  if (command === 'import-file' && !opts.file) throw new Error('--file is required for import-file');
  if (!['db', 'socket'].includes(opts.delivery)) throw new Error('--delivery must be db or socket');
  if (!['all', 'user-only'].includes(opts.mode)) throw new Error('--mode must be all or user-only');
  if (!Number.isInteger(opts.fromLine) || opts.fromLine < 1) throw new Error('--from-line must be a positive integer');
  if (!Number.isInteger(opts.intervalMs) || opts.intervalMs < 100) throw new Error('--interval-ms must be an integer >= 100');
  return opts;
}

function getRolloutPathForThread(opts) {
  const thread = getCodexThread(opts.codexDb, opts.threadId);
  if (!thread) throw new Error(`Codex thread not found: ${opts.threadId}`);
  return thread.rolloutPath;
}

function normalizeCodexThreadTitle(title) {
  const text = typeof title === 'string' ? title.trim() : '';
  return text.length > 0 ? text : null;
}

function applyCodexThreadTitle(metadata, title) {
  return applyCodexThreadTitleWithTimestamp(metadata, title, undefined);
}

function applyCodexThreadTitleWithTimestamp(metadata, title, titleUpdatedAt) {
  const normalized = normalizeCodexThreadTitle(title);
  if (!normalized) return { changed: false, metadata };
  const current = metadata && typeof metadata === 'object' ? metadata : {};
  const nextTitleUpdatedAt = Number.isFinite(Number(titleUpdatedAt)) ? Number(titleUpdatedAt) : current.titleUpdatedAt;
  const shouldClearName = current.name !== undefined;
  if (
    current.title === normalized
    && !shouldClearName
    && current.titleUpdatedAt === nextTitleUpdatedAt
  ) {
    return { changed: false, metadata: current };
  }
  return {
    changed: true,
    metadata: {
      ...current,
      name: undefined,
      title: normalized,
      ...(Number.isFinite(Number(titleUpdatedAt)) ? { titleUpdatedAt: Number(titleUpdatedAt) } : {})
    }
  };
}

function getHapiMetadataTitle(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return normalizeCodexThreadTitle(metadata.title ?? metadata.name);
}

function getMetadataTitleUpdatedAt(metadata) {
  const value = Number(metadata?.titleUpdatedAt);
  return Number.isFinite(value) ? value : 0;
}

async function syncCodexThreadTitle({
  hapiDb,
  codexDb,
  session,
  thread,
  sink,
  updateMetadataFn = updateSessionMetadata,
  writeThreadTitleFn = updateCodexThreadTitle
}) {
  const codexTitle = normalizeCodexThreadTitle(thread?.title);
  const hapiTitle = getHapiMetadataTitle(session?.metadata);
  const codexUpdatedAt = Number(thread?.updatedAtMs || 0);
  const hapiUpdatedAt = getMetadataTitleUpdatedAt(session?.metadata);

  if (codexTitle && hapiTitle && codexTitle !== hapiTitle && hapiUpdatedAt > codexUpdatedAt) {
    const result = writeThreadTitleFn(codexDb, thread.id, hapiTitle);
    return {
      changed: Boolean(result?.changed),
      direction: 'hapi-to-codex',
      result
    };
  }

  const titleUpdate = applyCodexThreadTitleWithTimestamp(session?.metadata, thread?.title, thread?.updatedAtMs);
  if (!titleUpdate.changed) return { changed: false };

  const expectedVersion = Number(session?.metadata_version || session?.metadataVersion || 0);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return { changed: false, reason: 'missing-metadata-version' };
  }

  if (sink && typeof sink.updateMetadata === 'function') {
    const ack = await sink.updateMetadata({
      sid: session.id,
      metadata: titleUpdate.metadata,
      expectedVersion
    });
    return {
      changed: ack?.result === 'success',
      direction: 'codex-to-hapi',
      result: ack?.result,
      version: ack?.version,
      metadata: ack?.metadata
    };
  }

  const result = updateMetadataFn(hapiDb, session.id, titleUpdate.metadata, expectedVersion);
  return {
    changed: result?.result === 'success',
    direction: 'codex-to-hapi',
    result: result?.result,
    version: result?.version,
    metadata: result?.metadata
  };
}

async function withOptionalSocketSink(opts, fn) {
  if (opts.delivery !== 'socket') return fn(null);
  const session = findHapiSessionByCodexId(opts.hapiDb, opts.threadId);
  if (!session) throw new Error(`HAPI session not found for Codex thread: ${opts.threadId}`);
  const token = readCliApiToken(opts.hapiSettings, opts.namespace);
  const sink = createCliMessageSink({
    hubUrl: opts.hubUrl,
    token,
    sessionId: session.id,
    generation: Number(session.metadata?.executionControl?.generation || 1)
  });
  await sink.open();
  try {
    return await fn(sink);
  } finally {
    await sink.close();
  }
}

async function importThread(opts) {
  const rolloutPath = getRolloutPathForThread(opts);
  return withOptionalSocketSink(opts, (sink) => {
    const args = { hapiDbPath: opts.hapiDb, threadId: opts.threadId, rolloutPath, fromLine: opts.fromLine, mode: opts.mode };
    return sink ? importRolloutFile.withSink({ ...args, sink }) : importRolloutFile(args);
  });
}

async function importFile(opts) {
  const rolloutPath = path.resolve(opts.file);
  return withOptionalSocketSink(opts, (sink) => {
    const args = { hapiDbPath: opts.hapiDb, threadId: opts.threadId, rolloutPath, fromLine: opts.fromLine, mode: opts.mode };
    return sink ? importRolloutFile.withSink({ ...args, sink }) : importRolloutFile(args);
  });
}

async function runWatchIteration(opts, state = {}, deps = {}) {
  const getThread = deps.getThread ?? getCodexThread;
  const shouldReadThread = Boolean(deps.getThread || opts.codexDb);
  const thread = shouldReadThread ? getThread(opts.codexDb, opts.threadId) : null;
  if (shouldReadThread && !thread) throw new Error(`Codex thread not found: ${opts.threadId}`);
  const rolloutPath = state.rolloutPath ?? thread?.rolloutPath ?? getRolloutPathForThread(opts);
  const findSession = deps.findSession ?? findHapiSessionByCodexId;
  const readToken = deps.readToken ?? readCliApiToken;
  const createSink = deps.createSink ?? createCliMessageSink;
  const importWithSink = deps.importWithSink ?? importRolloutFile.withSink;
  const importDirect = deps.importDirect ?? importRolloutFile;
  const updateMetadataFn = deps.updateMetadata ?? updateSessionMetadata;
  const writeThreadTitleFn = deps.writeThreadTitle ?? updateCodexThreadTitle;

  let currentBinding = state.currentBinding ?? null;
  let currentSink = state.currentSink ?? null;

  const session = findSession(opts.hapiDb, opts.threadId);
  if (!session) throw new Error(`HAPI session not found for Codex thread: ${opts.threadId}`);

  const nextBinding = {
    sessionId: session.id,
    generation: Number(session.metadata?.executionControl?.generation || 1)
  };
  const binding = resolveBindingChange(currentBinding, nextBinding);

  if (binding.changed) {
    await currentSink?.close();
    currentSink = opts.delivery === 'socket'
      ? createSink({
          hubUrl: opts.hubUrl,
          token: readToken(opts.hapiSettings, opts.namespace),
          sessionId: binding.next.sessionId,
          generation: binding.next.generation
        })
      : null;
    await currentSink?.open();
    currentBinding = binding.next;
  }

  const titleSync = thread
    ? await syncCodexThreadTitle({
        hapiDb: opts.hapiDb,
        codexDb: opts.codexDb,
        session,
        thread,
        sink: currentSink,
        updateMetadataFn,
        writeThreadTitleFn
      })
    : { changed: false };

  const args = {
    hapiDbPath: opts.hapiDb,
    threadId: opts.threadId,
    rolloutPath,
    fromLine: opts.fromLine,
    mode: opts.mode
  };
  const stats = currentSink ? await importWithSink({ ...args, sink: currentSink }) : importDirect(args);
  const nextFromLine = Number.isInteger(stats?.nextFromLine) ? stats.nextFromLine : opts.fromLine + stats.read;
  const report = stats.read > 0
    ? { ...stats, nextFromLine, delivery: opts.delivery, mode: opts.mode, binding: currentBinding, titleSync }
    : null;

  return {
    rolloutPath,
    thread,
    currentBinding,
    currentSink,
    nextFromLine,
    stats,
    report,
    titleSync
  };
}

async function watchThread(opts, onStats = (stats) => console.log(JSON.stringify(stats))) {
  let state = {
    rolloutPath: getRolloutPathForThread(opts),
    currentBinding: null,
    currentSink: null
  };

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const iteration = await runWatchIteration(opts, state);
      state = {
        rolloutPath: iteration.rolloutPath,
        currentBinding: iteration.currentBinding,
        currentSink: iteration.currentSink
      };
      if (iteration.report) {
        opts.fromLine = iteration.nextFromLine;
        onStats(iteration.report);
      }
      await new Promise((resolve) => setTimeout(resolve, opts.intervalMs));
    }
  } finally {
    await state.currentSink?.close();
  }
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.command === 'import-file') return importFile(opts);
  if (opts.command === 'import-thread') return importThread(opts);
  if (opts.command === 'watch') return watchThread(opts);
  throw new Error(`Unsupported command: ${opts.command}`);
}

module.exports = {
  parseArgs,
  main,
  importThread,
  importFile,
  runWatchIteration,
  watchThread,
  DEFAULT_HAPI_DB,
  DEFAULT_CODEX_DB,
  DEFAULT_HAPI_SETTINGS,
  DEFAULT_HUB_URL,
  normalizeCodexThreadTitle,
  applyCodexThreadTitle,
  syncCodexThreadTitle
};
