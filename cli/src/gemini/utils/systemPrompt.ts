/**
 * Gemini-specific system prompt for change_title tool.
 *
 * Gemini reaches the hapi MCP server through the ACP backend. ACP exposes
 * tools as `mcp__<server-name>__<tool-name>`, so the tool is called as
 * `mcp__hapi__change_title`.
 */

import { buildTitleInstruction } from '@/utils/titleInstruction';

/**
 * Title instruction for Gemini.
 * ACP exposes tools as mcp__<server>__<tool> → mcp__hapi__change_title.
 */
export const TITLE_INSTRUCTION = buildTitleInstruction('mcp__hapi__change_title');

/**
 * The system prompt to inject on the first user prompt for Gemini sessions.
 */
export const geminiSystemPrompt = TITLE_INSTRUCTION;
