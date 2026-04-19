# Compact Tool Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse ordinary HAPI tool messages into compact one-line rows while preserving visible controls for actionable permission/question tools.

**Architecture:** Keep all rendering changes inside the existing ToolCard boundary. Add a density decision derived from tool state and permission/question status, and use it to suppress inline bodies for non-actionable tools while keeping the existing dialog for details.

**Tech Stack:** React 19, Vitest, Testing Library, Tailwind utility classes.

---

### Task 1: ToolCard compact density tests

**Files:**
- Create: `web/src/components/ToolCard/ToolCard.test.tsx`
- Modify: `web/src/components/ToolCard/ToolCard.tsx`

- [ ] **Step 1: Write the failing test**

Create `ToolCard.test.tsx` with tests that render `ToolCard` inside `I18nProvider`. Test that a completed `update_plan` has `data-tool-density="compact"` and does not render checklist step text inline. Test that a pending `Bash` permission has `data-tool-density="actionable"` and shows Allow/Deny controls.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && bun run vitest run src/components/ToolCard/ToolCard.test.tsx`
Expected: FAIL before implementation because the compact density attribute is missing and/or update plan steps render inline.

- [ ] **Step 3: Implement compact/actionable density**

In `ToolCard.tsx`, compute actionable state from pending permission/question tools. Render compact cards with smaller padding, one-line title/subtitle, and no inline body. Keep CardContent only for actionable tools or denied/canceled permission reason. Preserve dialog details for all tools.

- [ ] **Step 4: Run targeted tests**

Run: `cd web && bun run vitest run src/components/ToolCard/ToolCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run broader verification**

Run: `bun run test:web && bun run typecheck && bun run build:web && git diff --check`
Expected: all commands exit 0.
