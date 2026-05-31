# HAPI Session Open Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Snapshot note:** This is a dated planning artifact; checkbox state may not reflect later commits. Re-verify current code/runtime state before executing any task.

**Goal:** Make opening and switching HAPI web sessions feel immediate by removing redundant refreshes and preserving recent message windows.

**Architecture:** The backend message query is already fast, so the first implementation pass stays mostly in the web client: preserve recent message-window state with bounded idle eviction, use the existing `messages?markRead=true` endpoint for initial read marking, remove mark-read invalidation churn, and stop eager autocomplete refetches. A small hub pagination cleanup replaces the `hasMore` second query with the standard `limit + 1` pattern.

**Tech Stack:** React, TanStack Query, Vite/Vitest, Bun test, Hono hub, Bun SQLite.

---

## File map

- Modify `web/src/lib/message-window-store.ts`: keep recent message-window state after last subscriber leaves; add bounded idle cleanup; let initial fetch completion notify immediately.
- Modify `web/src/hooks/queries/useMessages.ts`: pass `markRead` on initial message fetch; avoid separate initial `POST /read`; remove repeated session/session-list invalidations from read marking.
- Modify `web/src/hooks/queries/useSlashCommands.ts`: stop `refetchOnMount: 'always'`; increase stale time.
- Modify `web/src/hooks/queries/useSkills.ts`: same autocomplete-query config.
- Modify `web/src/hooks/queries/useMentions.ts`: same autocomplete-query config.
- Modify `hub/src/store/messages.ts`: allow callers to fetch `limit + 1` messages internally while preserving public max page size.
- Modify `hub/src/sync/messageService.ts`: derive `hasMore` from `limit + 1`, removing second SELECT.
- Update tests:
  - `web/src/hooks/queries/useMessages.test.tsx`
  - add/extend tests for `web/src/lib/message-window-store.ts` behavior if existing test harness supports it
  - `web/src/hooks/queries/useSlashCommands.test.tsx`, `useSkills.test.tsx`, `useMentions` if present/needed
  - `hub/src/web/routes/messages.test.ts`

## Task 1: RED tests for message-window preservation and read marking

**Files:**
- Modify: `web/src/hooks/queries/useMessages.test.tsx`
- Modify or create: `web/src/lib/message-window-store.test.ts`

- [ ] Add a failing test proving initial `useMessages` calls `api.getMessages(sessionId, { beforeSeq: null, limit: 50, markRead: true })` and does not immediately call `api.markSessionRead(sessionId)` during mount.
- [ ] Add a failing test proving state remains available after the last `subscribeMessageWindow` listener unsubscribes, then is reusable by a later subscriber before TTL/LRU eviction.
- [ ] Run focused tests and confirm these new tests fail for the expected reason.

## Task 2: Implement message-window warm cache and initial read marking

**Files:**
- Modify: `web/src/lib/message-window-store.ts`
- Modify: `web/src/hooks/queries/useMessages.ts`

- [ ] In `message-window-store.ts`, do not delete `states` immediately when last listener unsubscribes.
- [ ] Add bounded cleanup: either idle TTL (target 5 minutes) plus cap (target 10 sessions), or at minimum cap-preserving cleanup for unsubscribed sessions. New subscriptions must cancel pending cleanup for that session.
- [ ] Keep `clearMessageWindow(sessionId)` as an explicit destructive reset for call sites that truly need it.
- [ ] Make `fetchLatestMessages` success path notify immediately so initial render is not delayed by the streaming throttle.
- [ ] In `useMessages`, call `fetchLatestMessages(api, sessionId, { markRead: shouldMarkSessionRead() })` on mount.
- [ ] Avoid separate initial `api.markSessionRead` after the initial fetch. Keep focus/visibility read marking.
- [ ] Remove or narrow the `messagesVersion` mark-read effect so streaming message arrival does not trigger repeated `POST /read` and query invalidations.
- [ ] In `markReadIfActive`, keep local `clearSessionUnreadCount`, but remove unconditional invalidation of `queryKeys.sessions` and `queryKeys.session(sessionId)`.
- [ ] Run focused tests and confirm green.

## Task 3: RED/GREEN tests for autocomplete request churn

**Files:**
- Modify: `web/src/hooks/queries/useSlashCommands.ts`
- Modify: `web/src/hooks/queries/useSkills.ts`
- Modify: `web/src/hooks/queries/useMentions.ts`
- Tests: existing hook tests where available.

- [ ] Add or update tests to confirm cached slash/skills/mentions data is not refetched on every mount inside the new stale window.
- [ ] Change `refetchOnMount` from `'always'` to a cache-respecting value and increase `staleTime` to at least `30_000` (60s acceptable).
- [ ] Preserve on-demand stale refetch inside `getSuggestions`.
- [ ] Run focused hook tests.

## Task 4: Backend pagination cleanup

**Files:**
- Modify: `hub/src/store/messages.ts`
- Modify: `hub/src/sync/messageService.ts`
- Test: `hub/src/web/routes/messages.test.ts`

- [ ] Add a failing test for pagination with exactly limit messages and above-limit messages if coverage is missing.
- [ ] Fetch `limit + 1` messages in `MessageService.getMessagesPage`, slice back to `limit`, and set `hasMore` from the extra row.
- [ ] Preserve public API max page size at 200.
- [ ] Run hub message route tests.

## Task 5: Verification and post-review package

- [ ] Run focused tests:
  - `cd web && bun run test src/hooks/queries/useMessages.test.tsx src/hooks/queries/useSlashCommands.test.tsx src/hooks/queries/useSkills.test.tsx`
  - include `useMentions` test if present/created
  - `cd hub && bun test src/web/routes/messages.test.ts`
- [ ] Run `bun run typecheck` from repo root.
- [ ] Run full relevant suites if focused tests pass: `bun run test`.
- [ ] Restart HAPI hub/runner only if hub backend changes are deployed live.
- [ ] Manually measure network waterfall before/after on `http://127.0.0.1:3006`: opening a session should no longer emit separate initial `POST /read`, should reduce `/api/sessions` churn, and switching A→B→A should paint cached messages immediately.
- [ ] Prepare a post-fix diff and verification summary, then call `handoff review` with Claude, Claude-DeepSeek, and Gemini.

## Safety and rollback

- Frontend-only changes can be rolled back by reverting the modified web files and rebuilding/restarting the dev web/hub process.
- Hub pagination change is local and can be rolled back by restoring the old `getMessagesPage` implementation.
- Do not remove `fetchLatestMessages` on mount; cached messages should paint immediately, but fetch still verifies freshness.
- Do not remove query invalidations from rename/delete or other explicit session-mutating actions.
- Do not remove the SSE streaming notification throttle globally; bypass it only for initial fetch completion.
