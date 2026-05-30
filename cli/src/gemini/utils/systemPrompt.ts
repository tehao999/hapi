/**
 * Gemini-specific system prompt for change_title tool.
 *
 * Gemini reaches the hapi MCP server through the ACP backend. ACP exposes
 * tools as `mcp__<server-name>__<tool-name>`, so the tool is called as
 * `mcp__hapi__change_title`.
 */

import { trimIdent } from '@/utils/trimIdent';

/**
 * Title instruction for Gemini to call the hapi MCP tool.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    ALWAYS when you start a new chat, call the title tool to set a concise task title.
    Prefer calling mcp__hapi__change_title.
    If that exact tool name is unavailable, call an equivalent alias such as hapi__change_title or hapi_change_title.
    If the task focus changes significantly later, call the title tool again with a better title.
`);

/**
 * The system prompt to inject on the first user prompt for Gemini sessions.
 */
export const geminiSystemPrompt = TITLE_INSTRUCTION;
