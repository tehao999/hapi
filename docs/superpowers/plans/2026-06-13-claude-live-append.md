# Claude Live Append Implementation Plan

**Goal:** Make HAPI Claude and Claude-deepseek remote sessions send normal user messages received during an active turn into the current Claude streaming input instead of waiting for the next result boundary.

**Architecture:** Keep hub and DB message flow unchanged. Add a small live-append sink between `claudeRemoteLauncher` and `claudeRemote`: when a normal user `queue.push` message with the same active mode hash arrives while the Claude streaming input is open and no permission request is pending, push it directly into the existing `PushableAsyncIterable<SDKUserMessage>` and remove that exact queued item. Otherwise preserve the current queue-based behavior.

**Tech Stack:** TypeScript, Bun, Vitest, HAPI CLI Claude remote launcher, Claude Agent SDK stream-json input.

---

### Task 1: Live append delivery before result boundary

**Files:**
- `cli/src/claude/claudeRemote.test.ts`
- `cli/src/claude/claudeRemote.ts`

- [x] Add a failing test proving a second user message can be pushed into the active Claude prompt stream before any `result` boundary.
- [x] Add optional `registerLiveAppend` to `claudeRemote` and register a sink that pushes into the existing `PushableAsyncIterable` while input is open.
- [x] Keep abort/input-ended rejection behavior so unsafe messages stay queued.
- [x] Add regression coverage that scheduled next messages mark Claude as thinking again for later same-stream turns.

### Task 2: Launcher policy and queue guardrails

**Files:**
- `cli/src/claude/claudeRemoteLauncher.ts`
- `cli/src/claude/utils/liveAppendQueue.ts`
- `cli/src/claude/utils/liveAppendQueue.test.ts`
- `cli/src/utils/MessageQueue2.ts`
- `cli/src/utils/MessageQueue2.test.ts`
- `cli/src/modules/common/permission/BasePermissionHandler.ts`

- [x] Add `MessageQueue2` item snapshots with stable `id` and `origin` so live append can consume the exact pushed item.
- [x] Add `takeFirstMatching(predicate)` for narrow queue removal.
- [x] Reject live append unless origin is normal `push`, mode hash matches, Claude is thinking, no permission request is pending, and the message is not `/clear`, `/compact`, or `/goal`.
- [x] Reject internal `unshift`, `pushImmediate`, and isolated command origins by policy.
- [x] Update `PermissionHandler` state when a live append is accepted.
- [x] Restore launcher `modeHash`/`mode` when consuming a pending message as the first message of a new stream.
- [x] Clear live append handler/state in launcher cleanup.

### Task 3: Runtime evidence and Codex/Gemini status

**Files:**
- No production change for Codex/Gemini in this task.

- [x] Confirm Codex remains non-A: messages enter `MessageQueue2` and are sent to the Codex app server only by `startTurn`; no active append API is wired.
- [x] Confirm Gemini remains non-A: messages enter `MessageQueue2` and are sent only by `backend.prompt`; no active prompt append API is wired.
- [x] Focused tests: `cd cli && bun test src/claude/claudeRemote.test.ts src/claude/utils/liveAppendQueue.test.ts src/utils/MessageQueue2.test.ts`.
- [x] Full CLI tests: `bun run test:cli`.
- [x] Typecheck and whitespace: `bun typecheck` and `git diff --check`.
- [x] External review after fixes: `handoff review --tools codex,gemini,claude-deepseek ...` returned 3/3 PASS.
