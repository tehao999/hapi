# Codex and Gemini Live Append Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HAPI Codex and Gemini remote sessions accept normal user messages during an active turn as same-turn live append/steer instead of waiting for the next turn when the underlying agent protocol supports it.

**Architecture:** Reuse the queue identity/origin guardrails added for Claude. Codex will use app-server `turn/steer` with `expectedTurnId` for active regular turns. Gemini will first add a backend-level active append seam only if ACP/Gemini supports an equivalent in-flight prompt append method; otherwise the implementation will fail closed and document the protocol blocker rather than pretending queued-next-turn behavior is A mode.

**Tech Stack:** TypeScript, Bun, Vitest, HAPI CLI Codex app-server, Gemini ACP backend.

---

### Task 1: Codex app-server steer client

**Files:**
- Modify: `cli/src/codex/appServerTypes.ts`
- Modify: `cli/src/codex/codexAppServerClient.ts`
- Modify: `cli/src/codex/codexAppServerClient.test.ts`

- [x] **Step 1: Write failing steer client test**

Add a test that starts a mock app-server, calls `CodexAppServerClient.steerTurn({ threadId, expectedTurnId, input })`, and asserts a JSON-RPC `turn/steer` request is written.

- [x] **Step 2: Verify red**

Run: `cd cli && bun test src/codex/codexAppServerClient.test.ts`
Expected: FAIL because `steerTurn` is not defined.

- [x] **Step 3: Implement minimal client method**

Add `TurnSteerParams`, `TurnSteerResponse`, and `steerTurn()` using `sendRequest('turn/steer', ...)` with a long timeout.

- [x] **Step 4: Verify green**

Run: `cd cli && bun test src/codex/codexAppServerClient.test.ts`
Expected: PASS.

### Task 2: Codex launcher live append policy

**Files:**
- Modify: `cli/src/codex/codexRemoteLauncher.ts`
- Modify: `cli/src/codex/codexRemoteLauncher.test.ts`
- Create: `cli/src/codex/utils/liveAppendQueue.ts`
- Create: `cli/src/codex/utils/liveAppendQueue.test.ts`

- [x] **Step 1: Write failing helper tests**

Add tests that same hash + active turn + thinking + no pending permission steers and removes exact queue item, while special commands, isolated/internal origins, mode mismatch, no active turn, and pending permission stay queued.

- [x] **Step 2: Verify red**

Run: `cd cli && bun test src/codex/utils/liveAppendQueue.test.ts`
Expected: FAIL because the helper does not exist.

- [x] **Step 3: Implement helper**

Create a Codex-specific queue handler that calls `appServerClient.steerTurn`, removes the exact queue item by id only after steer succeeds, and leaves the item queued on rejection or RPC failure.

- [x] **Step 4: Wire launcher**

Install `session.queue.setOnMessage(...)` while the launcher has a `currentThreadId`, `currentTurnId`, `turnInFlight`, and same active mode hash. Clear it in cleanup/finally. Avoid steering during manual compaction or goal commands.

- [x] **Step 5: Verify green**

Run: `cd cli && bun test src/codex/utils/liveAppendQueue.test.ts src/codex/codexRemoteLauncher.test.ts`.

### Task 3: Gemini ACP capability check and implementation

**Files:**
- Modify: `cli/src/agent/types.ts`
- Modify: `cli/src/agent/backends/acp/AcpSdkBackend.ts`
- Modify: `cli/src/agent/backends/acp/AcpSdkBackend.test.ts`
- Modify: `cli/src/gemini/geminiRemoteLauncher.ts`
- Modify: `cli/src/gemini/geminiRemoteLauncher.test.ts`
- Create if supported: `cli/src/gemini/utils/liveAppendQueue.ts`
- Create if supported: `cli/src/gemini/utils/liveAppendQueue.test.ts`

- [x] **Step 1: Identify ACP/Gemini append method**

Inspect local Gemini/ACP docs or generated protocol types. If there is an in-flight append/steer method, record the method name in tests. If not, stop before fake implementation and report blocker.

- [x] **Step 2: Write failing backend test — skipped, blocked**

Skipped because Step 1 found no ACP/Gemini append or steer method to assert against.

- [x] **Step 3: Implement backend append seam — skipped, blocked**

Skipped because implementing a seam without an upstream method would fake A mode.

- [x] **Step 4: Wire Gemini launcher policy — skipped, blocked**

Skipped because there is no backend append operation that can succeed safely.

- [x] **Step 5: Verify focused tests — not applicable after blocker**

No Gemini production/test files were changed after the protocol blocker was confirmed; evidence is in the blocker note.



**Gemini capability note (2026-06-13):** Local Gemini CLI 0.46.0 ACP exposes `session/prompt` and `session/cancel` but no in-flight append/steer method. A concurrent `session/prompt` aborts the pending prompt in the installed ACP session implementation, so Gemini true A mode is blocked rather than fake-implemented. Evidence captured in `docs/superpowers/reviews/2026-06-13-gemini-acp-live-append-blocker.md`.

### Task 4: Final verification, review, and commit

**Files:**
- All touched files.

- [x] **Step 1: Focused verification**

Run focused Codex/Gemini tests plus `src/utils/MessageQueue2.test.ts`.

- [x] **Step 2: Full verification**

Run: `bun typecheck`, `git diff --check`, and `bun run test:cli` from repo root.

- [x] **Step 3: External review**

Run `handoff review` for agent-bridge/routing changes. Fix any FAIL/BLOCKED findings and rerun relevant verification.

- [ ] **Step 4: Commit exact touched paths**

Commit only this task's paths after verification/review pass.


**Final verification note (2026-06-13):** Focused tests passed (62 pass), `bun typecheck` passed, `git diff --check` passed, and `bun run test:cli` passed (642 pass / 12 skipped). External review ran with claude-deepseek + gemini; gemini passed, claude-deepseek found one abort stale-state issue. A red regression test reproduced it, the fix was implemented, focused/full verification reran, and claude-deepseek re-review confirmed the issue fully addressed with no new Critical/Important findings.
