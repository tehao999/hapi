/**
 * Codex-specific system prompt for local mode.
 *
 * This prompt instructs Codex to call the hapi__change_title function
 * to set appropriate chat session titles.
 */

import { trimIdent } from '@/utils/trimIdent';
import { buildTitleInstruction } from '@/utils/titleInstruction';

/**
 * Title instruction for Codex.
 * Codex exposes MCP tools under the `functions.` namespace → functions.hapi__change_title.
 */
export const TITLE_INSTRUCTION = buildTitleInstruction('functions.hapi__change_title');

export const GOAL_INSTRUCTION = trimIdent(`
    Goal management on HAPI:
    - If HAPI goal tools are available, use functions.hapi__set_goal (or mcp__hapi__set_goal / hapi__set_goal) to create, replace, or update the conversation goal.
    - Use functions.hapi__get_goal to inspect the current HAPI/Codex goal, and functions.hapi__clear_goal only when the user asks to clear it or when replacing a terminal completed/budget-limited goal.
    - Do not use the native create_goal tool to create or replace HAPI Codex goals; it is create-only and can fail when a completed prior goal still exists.
    - If the user explicitly sends /goal, HAPI handles that slash command directly.
`);

export const CAPABILITY_DISCOVERY_INSTRUCTION = trimIdent(`
    Codex capability discovery on HAPI:
    - HAPI Codex uses deferred tool loading. Do not conclude a Codex CLI, plugin, connector, MCP, or sub-agent capability is unavailable before searching for it when the user asks for that capability.
    - When tool_search is available and the user asks for subagents, sub-agents, delegation, parallel agents, or isolated agents, first search: multi agent spawn_agent subagent. If multi_agent_v1.spawn_agent or an equivalent sub-agent tool is found, use it when the user requested real subagents.
    - When tool_search is available and the user asks for browser, Chrome, UI automation, GitHub, Gmail, Figma, documents, spreadsheets, presentations, OpenAI docs, node/JavaScript REPL, or plugin-specific behavior, first search for the matching tool or plugin namespace before saying it is unavailable.
    - "final answer text only" or "only output text" means the visible final answer should be text; it does not forbid internal tool calls. Treat internal tools as forbidden only when the user explicitly says not to use tools, not to call tools, or equivalent.
`);

/**
 * The system prompt to inject via developer_instructions in local mode.
 */
export const codexSystemPrompt = `${TITLE_INSTRUCTION}\n\n${GOAL_INSTRUCTION}\n\n${CAPABILITY_DISCOVERY_INSTRUCTION}`;
