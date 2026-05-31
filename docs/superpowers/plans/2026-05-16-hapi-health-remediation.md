# HAPI Health Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Snapshot note:** This is a dated planning artifact; checkbox state may not reflect later commits. Re-verify current code/runtime state before executing any task.

**Goal:** Fix the health-audit findings for the live HAPI source/runtime, clean retired hapi-codex-sync state, verify, then run three-model review.

**Architecture:** Apply small, reversible changes in the live `hapi-source` working tree and `~/.hapi` launchd scripts/plists. Server-side fixes are unit-tested where practical; operational cleanup is backed up before mutation.

**Tech Stack:** Bun, TypeScript, Hono, SQLite, launchd, zsh, handoff review.

---

### Task 1: Secure request logging and static asset caching

**Files:**
- Modify: `hapi-source/hub/src/web/server.ts`
- Test: `hapi-source/hub/src/web/server.test.ts`

- [ ] Add tests for sanitizing `/api/events?token=...` and preserving safe paths.
- [ ] Implement exported sanitizer and custom Hono logger path formatter.
- [ ] Add conservative `Cache-Control` for static assets.
- [ ] Run `cd hub && bun test src/web/server.test.ts`.

### Task 2: Harden Push and SSE resource handling

**Files:**
- Modify: `hapi-source/hub/src/push/pushService.ts`
- Modify: `hapi-source/hub/src/sse/sseManager.ts`
- Modify: `hapi-source/hub/src/web/routes/events.ts`
- Tests: `hapi-source/hub/src/push/pushService.test.ts`, `hapi-source/hub/src/sse/sseManager.test.ts`

- [ ] Add tests for pruning TLS-broken push subscriptions and limiting SSE subscriptions per namespace.
- [ ] Implement Push error classification/backoff/prune.
- [ ] Implement SSE connection cap result and HTTP 429 when exceeded.
- [ ] Run focused hub tests.

### Task 3: Fix CLI test isolation and Codex notification noise

**Files:**
- Modify: `hapi-source/cli/src/modules/common/mentions.test.ts`
- Modify: `hapi-source/cli/src/modules/common/skills.test.ts`
- Modify: `hapi-source/cli/src/modules/common/slashCommands.test.ts`
- Modify: `hapi-source/cli/src/codex/utils/appServerEventConverter.ts`
- Test: `hapi-source/cli/src/codex/utils/appServerEventConverter.test.ts`

- [ ] Add/adjust tests that known benign notification methods emit no events and no warning semantics.
- [ ] Sandbox `CODEX_HOME` in plugin-related CLI tests.
- [ ] Add no-op handlers for known benign Codex app-server notifications.
- [ ] Run focused CLI tests.

### Task 4: Web query churn and error containment

**Files:**
- Modify: `hapi-source/web/src/hooks/queries/useSessions.ts`
- Modify: `hapi-source/web/src/App.tsx`
- Create: `hapi-source/web/src/components/ErrorBoundary.tsx`
- Test: add or update web tests if feasible.

- [ ] Set sessions query stale/refetch settings for SSE-driven UI.
- [ ] Add a minimal React ErrorBoundary around the routed app body.
- [ ] Run web typecheck/tests.

### Task 5: Operational cleanup

**Files:**
- Modify: `~/.hapi/bin/run-hapi-hub.sh`
- Modify: `~/.hapi/bin/run-hapi-runner.sh`
- Move/backup: `~/Library/LaunchAgents/com.tehao.hapi-codex-sync.plist`
- Remove stale pid/state after backup: `~/.hapi/hapi-codex-sync-current.pid`, `~/.hapi/hapi-codex-sync-state.json`
- Create: `~/.hapi/bin/hapi-log-maintenance.sh`
- Create: `~/.hapi/bin/hapi-db-maintenance.sh`

- [ ] Backup every operational file before mutation.
- [ ] Remove global secret inheritance from hub/runner scripts by unsetting known non-HAPI secret variables at startup.
- [ ] Unload/disable hapi-codex-sync plist if loaded; move plist to backup; remove stale pid/state.
- [ ] Add safe maintenance scripts for logs and SQLite; run dry/read-only checks only unless safe.
- [ ] Restart hub/runner so code/script changes are active.

### Task 6: Verification and three-model review

**Commands:**
- `bun run typecheck`
- focused hub/cli/web tests
- `curl /health`, `hapi runner status`
- log token growth check
- `handoff review --tools claude,claude-deepseek,gemini`

- [ ] Run verification commands and record output.
- [ ] Call three reviewers with post-fix evidence.
- [ ] Summarize any remaining findings.
