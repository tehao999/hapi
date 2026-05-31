/**
 * Codex-specific system prompt for local mode.
 *
 * This prompt instructs Codex to call the hapi__change_title function
 * to set appropriate chat session titles.
 */

import { trimIdent } from '@/utils/trimIdent';

/**
 * Title instruction for Codex to call the hapi MCP tool.
 * Note: Codex exposes MCP tools under the `functions.` namespace,
 * so the tool is called as `functions.hapi__change_title`.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    ALWAYS when you start a new chat, call the title tool to set a concise task title.
    Prefer calling functions.hapi__change_title.
    If that exact tool name is unavailable, call an equivalent alias such as hapi__change_title, mcp__hapi__change_title, or hapi_change_title.
    If the task focus changes significantly later, call the title tool again with a better title.
`);

export const GOAL_INSTRUCTION = trimIdent(`
    Goal management on HAPI:
    - If HAPI goal tools are available, use functions.hapi__set_goal (or mcp__hapi__set_goal / hapi__set_goal) to create, replace, or update the conversation goal.
    - Use functions.hapi__get_goal to inspect the current HAPI/Codex goal, and functions.hapi__clear_goal only when the user asks to clear it or when replacing a terminal completed/budget-limited goal.
    - Do not use the native create_goal tool to create or replace HAPI Codex goals; it is create-only and can fail when a completed prior goal still exists.
    - If the user explicitly sends /goal, HAPI handles that slash command directly.
`);

/**
 * The system prompt to inject via developer_instructions in local mode.
 */
export const codexSystemPrompt = `${TITLE_INSTRUCTION}\n\n${GOAL_INSTRUCTION}`;
