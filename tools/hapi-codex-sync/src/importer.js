const fs = require('node:fs');
const crypto = require('node:crypto');
const { convertCodexEvent } = require('./convert');
const { findHapiSessionByCodexId, insertMessageIfMissing, messageAlreadyStored, comparableMessage } = require('./hapi-db');

function eventHash(line) {
  return crypto.createHash('sha1').update(line).digest('hex').slice(0, 16);
}

function sourceLocalId(threadId, lineNumber, line) {
  return `codex:${threadId}:${lineNumber}:${eventHash(line)}`;
}

function normalizedParagraphs(text) {
  return String(text || '')
    .trim()
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isRepeatedUserExpansion(candidateText, baseText) {
  const candidateParts = normalizedParagraphs(candidateText);
  const baseParts = normalizedParagraphs(baseText);
  if (baseParts.length !== 1 || candidateParts.length <= 1) return false;
  return candidateParts.every((part) => part === baseParts[0]);
}

const USER_TEXT_DUPLICATE_WINDOW_MS = 120000;
const USER_MIRROR_DUPLICATE_WINDOW_MS = 250;
const HAPI_ORIGIN_USER_ECHO_WINDOW_MS = 30000;
const HAPI_ORIGIN_TOOL_ECHO_WINDOW_MS = 30000;
const AGENT_TEXT_DUPLICATE_WINDOW_MS = 2000;
const NON_SYNCABLE_USER_MESSAGE_PREFIXES = [
  '<subagent_notification>',
  '<turn_aborted>'
];

function agentMessageSignature(message) {
  if (!message || message.role !== 'agent') return null;
  const content = message.content;
  if (!content || content.type !== 'codex') return null;
  const data = content.data;
  if (!data || data.type !== 'message' || typeof data.message !== 'string') return null;
  return JSON.stringify({
    message: data.message,
    phase: typeof data.phase === 'string' ? data.phase : null
  });
}

function normalizeBatchItems(
  items,
  {
    dedupeUserText = false,
    userTextDuplicateWindowMs = USER_TEXT_DUPLICATE_WINDOW_MS,
    dedupeAgentText = false,
    agentTextDuplicateWindowMs = AGENT_TEXT_DUPLICATE_WINDOW_MS
  } = {}
) {
  const exactDeduped = [];
  let suppressed = 0;

  for (const item of items) {
    const duplicate = exactDeduped.find((existing) =>
      existing.sessionId === item.sessionId &&
      existing.createdAt === item.createdAt &&
      comparableMessage(existing.message) === comparableMessage(item.message)
    );
    if (duplicate) {
      suppressed += 1;
      continue;
    }
    exactDeduped.push(item);
  }

  const normalized = [];
  const seenUserTexts = [];
  const seenAgentTexts = [];
  for (const item of exactDeduped) {
    const text = item.message?.role === 'user' ? item.message?.content?.text : '';
    if (!text) {
      if (dedupeAgentText) {
        const signature = agentMessageSignature(item.message);
        if (signature) {
          const hasNearbyAgentText = seenAgentTexts.some((seen) =>
            seen.signature === signature && Math.abs(Number(seen.createdAt || 0) - Number(item.createdAt || 0)) <= agentTextDuplicateWindowMs
          );
          if (hasNearbyAgentText) {
            suppressed += 1;
            continue;
          }
          seenAgentTexts.push({ signature, createdAt: item.createdAt });
        }
      }
      normalized.push(item);
      continue;
    }
    const hasShorterCanonicalVariant = exactDeduped.some((existing) =>
      existing !== item &&
      existing.sessionId === item.sessionId &&
      existing.createdAt === item.createdAt &&
      existing.message?.role === 'user' &&
      typeof existing.message?.content?.text === 'string' &&
      isRepeatedUserExpansion(text, existing.message.content.text)
    );
    if (hasShorterCanonicalVariant) {
      suppressed += 1;
      continue;
    }
    if (dedupeUserText) {
      const hasNearbyText = seenUserTexts.some((seen) =>
        seen.text === text && Math.abs(Number(seen.createdAt || 0) - Number(item.createdAt || 0)) <= userTextDuplicateWindowMs
      );
      if (hasNearbyText) {
        suppressed += 1;
        continue;
      }
      seenUserTexts.push({ text, createdAt: item.createdAt });
    }
    normalized.push(item);
  }

  return { items: normalized, suppressed };
}

function shouldIncludeMessage(message, mode) {
  if (mode === 'all') return true;
  if (mode === 'user-only') {
    if (message?.role !== 'user') return false;
    const text = typeof message?.content?.text === 'string' ? message.content.text : '';
    const trimmed = text.trimStart();
    return !NON_SYNCABLE_USER_MESSAGE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  }
  throw new Error('mode must be all or user-only');
}

function collectConvertedMessages({ hapiDbPath, threadId, rolloutPath, fromLine = 1, toLine = Infinity, mode = 'all' }) {
  if (!['all', 'user-only'].includes(mode)) throw new Error('mode must be all or user-only');
  const session = findHapiSessionByCodexId(hapiDbPath, threadId);
  if (!session) {
    return { session: null, stats: { read: 0, converted: 0, inserted: 0, skipped: 0, missingSession: true }, items: [] };
  }

  const text = fs.readFileSync(rolloutPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const stats = { read: 0, converted: 0, inserted: 0, skipped: 0, missingSession: false };
  const items = [];
  let lastReadLineNumber = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    if (!line.trim()) continue;
    if (lineNumber < fromLine || lineNumber > toLine) continue;
    stats.read += 1;
    lastReadLineNumber = lineNumber;

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      stats.skipped += 1;
      continue;
    }

    const message = convertCodexEvent(event);
    if (!message) {
      stats.skipped += 1;
      continue;
    }
    if (!shouldIncludeMessage(message, mode)) {
      stats.skipped += 1;
      continue;
    }
    stats.converted += 1;
    items.push({
      sessionId: session.id,
      localId: sourceLocalId(threadId, lineNumber, line),
      lineNumber,
      createdAt: message.createdAt,
      message: { role: message.role, content: message.content }
    });
  }

  const userTextDuplicateWindowMs =
    mode === 'user-only' ? USER_TEXT_DUPLICATE_WINDOW_MS : USER_MIRROR_DUPLICATE_WINDOW_MS;
  const normalized = normalizeBatchItems(items, {
    dedupeUserText: true,
    userTextDuplicateWindowMs,
    dedupeAgentText: mode === 'all'
  });
  stats.skipped += normalized.suppressed;

  return { session, stats, items: normalized.items, lastReadLineNumber };
}

function importRolloutFile({ hapiDbPath, threadId, rolloutPath, fromLine = 1, toLine = Infinity, mode = 'all' }) {
  const { stats, items } = collectConvertedMessages({ hapiDbPath, threadId, rolloutPath, fromLine, toLine, mode });
  if (stats.missingSession) return stats;
  const userTextDuplicateWindowMs =
    mode === 'user-only' ? USER_TEXT_DUPLICATE_WINDOW_MS : USER_MIRROR_DUPLICATE_WINDOW_MS;

  for (const item of items) {
    const result = insertMessageIfMissing(hapiDbPath, item, {
      userTextDuplicate: true,
      userTextDuplicateWindowMs,
      nonDesktopUserTextDuplicateWindowMs: HAPI_ORIGIN_USER_ECHO_WINDOW_MS,
      nonDesktopToolDuplicateWindowMs: HAPI_ORIGIN_TOOL_ECHO_WINDOW_MS,
      agentTextDuplicate: mode === 'all',
      agentTextDuplicateWindowMs: AGENT_TEXT_DUPLICATE_WINDOW_MS
    });
    if (result.inserted) stats.inserted += 1;
    else stats.skipped += 1;
  }

  return stats;
}

importRolloutFile.withSink = async function importRolloutFileWithSink({ hapiDbPath, threadId, rolloutPath, fromLine = 1, toLine = Infinity, mode = 'all', sink }) {
  if (!sink || typeof sink.write !== 'function') throw new Error('sink.write is required');
  const { stats, items } = collectConvertedMessages({ hapiDbPath, threadId, rolloutPath, fromLine, toLine, mode });
  if (stats.missingSession) return stats;
  const userTextDuplicateWindowMs =
    mode === 'user-only' ? USER_TEXT_DUPLICATE_WINDOW_MS : USER_MIRROR_DUPLICATE_WINDOW_MS;

  for (const item of items) {
    if (messageAlreadyStored(hapiDbPath, item.sessionId, item.localId, item.createdAt, item.message, {
      userTextDuplicate: true,
      userTextDuplicateWindowMs,
      nonDesktopUserTextDuplicateWindowMs: HAPI_ORIGIN_USER_ECHO_WINDOW_MS,
      nonDesktopToolDuplicateWindowMs: HAPI_ORIGIN_TOOL_ECHO_WINDOW_MS,
      agentTextDuplicate: mode === 'all',
      agentTextDuplicateWindowMs: AGENT_TEXT_DUPLICATE_WINDOW_MS
    })) {
      stats.skipped += 1;
      continue;
    }
    const result = await sink.write(item);
    if (result?.inserted === false) {
      if (result?.retryable === true || ['stale-generation', 'metadata-conflict'].includes(result?.reason)) {
        return { ...stats, nextFromLine: item.lineNumber };
      }
      stats.skipped += 1;
      continue;
    }
    stats.inserted += 1;
  }
  return stats;
};

module.exports = {
  importRolloutFile,
  collectConvertedMessages,
  sourceLocalId,
  eventHash,
  normalizeBatchItems,
  isRepeatedUserExpansion,
  shouldIncludeMessage,
  agentMessageSignature,
  USER_MIRROR_DUPLICATE_WINDOW_MS,
  HAPI_ORIGIN_TOOL_ECHO_WINDOW_MS,
  AGENT_TEXT_DUPLICATE_WINDOW_MS
};
