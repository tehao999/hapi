# hapi-codex-sync

Local bridge for syncing official Codex Desktop rollout JSONL events into HAPI, so HAPI Web/mobile can inspect and continue a Desktop-started Codex thread.

## What it does

- Reads Codex thread metadata from `/Users/tehao/.codex/state_5.sqlite`.
- Tails the thread's `rollout-*.jsonl` file under `/Users/tehao/.codex/sessions/`.
- Converts supported Codex events into HAPI-compatible `messages` rows:
  - user/assistant text messages
  - tool calls
  - tool call results
  - shell command begin/end events
- Finds the HAPI session via `sessions.metadata.codexSessionId`.
- Inserts messages idempotently using a `codex:<threadId>:<line>:<hash>` `local_id` plus semantic duplicate checks.

## Commands

```bash
cd tools/hapi-codex-sync
npm test -- --test-reporter=spec

# Import recent lines once
node bin/hapi-codex-sync.js import-thread \
  --thread-id 019d9e2b-a05a-7c10-9d56-4d7d708c0ac0 \
  --from-line 2510

# Watch new Desktop rollout events continuously and write directly to DB
node bin/hapi-codex-sync.js watch \
  --thread-id 019d9e2b-a05a-7c10-9d56-4d7d708c0ac0 \
  --from-line 2510 \
  --interval-ms 500

# Preferred live mode: send through HAPI's CLI socket so HAPI Web/mobile receives SSE updates
node bin/hapi-codex-sync.js watch \
  --delivery socket \
  --mode all \
  --thread-id 019d9e2b-a05a-7c10-9d56-4d7d708c0ac0 \
  --from-line 2510 \
  --interval-ms 500
```

## Safety notes

Back up HAPI DB before real imports:

```bash
mkdir -p /Users/tehao/.hapi/backups
cp /Users/tehao/.hapi/hapi.db /Users/tehao/.hapi/backups/hapi.db.pre-hapi-codex-sync-$(date +%Y%m%d-%H%M%S)
```

Use `--delivery socket --mode all` for full live HAPI Web/mobile mirroring from a Desktop-started thread. In that mode this tool connects to HAPI's local `/cli` Socket.IO namespace using the local CLI token and syncs user messages, assistant text, tool calls, and tool results through HAPI's passive `sync-message` channel, so Web/mobile receives SSE updates without re-triggering execution on the HAPI runner. `--mode user-only` remains available when you want a minimal mirror that only shows human input. The default `--delivery db` mode writes directly to SQLite and may require a page refresh.

The watcher also suppresses recent HAPI-origin echoes that appear back in the Codex rollout after a mobile/web takeover turn:

- user text echoes are matched by nearby text and non-desktop origin
- tool-call/tool-result echoes are matched by nearby `callId` and non-desktop origin

Those mirror-only lines do not block later Desktop-origin sync or create duplicate HAPI messages/cards.

## Canonical session rebinding

The watcher no longer assumes that one Codex thread maps to one stable HAPI session ID forever. Before each poll cycle it resolves the latest HAPI session and execution-control generation for the Codex thread, then reopens the socket sink if either value changed.
