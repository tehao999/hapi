import {
    CLAUDE_EFFORT_LABELS,
    CLAUDE_EFFORT_PRESETS,
    CLAUDE_MODEL_PRESETS,
    DEFAULT_CLAUDE_MODEL_LABEL,
    GEMINI_MODEL_PRESETS,
    GEMINI_MODEL_LABELS,
    getClaudeModelLabel,
    type ClaudeEffortPreset,
} from '@hapi/protocol'

export type AgentType = 'claude' | 'claude-deepseek' | 'codex' | 'cursor' | 'gemini' | 'opencode'
export type SessionType = 'simple' | 'worktree'
export type CodexReasoningEffort = 'default' | 'low' | 'medium' | 'high' | 'xhigh'
export type CodexServiceTier = 'default' | 'standard' | 'fast'
export type ClaudeEffort = 'auto' | ClaudeEffortPreset

export const MODEL_OPTIONS: Record<AgentType, { value: string; label: string }[]> = {
    claude: [
        { value: 'auto', label: DEFAULT_CLAUDE_MODEL_LABEL },
        ...CLAUDE_MODEL_PRESETS.map(m => ({ value: m, label: getClaudeModelLabel(m) ?? m })),
    ],
    'claude-deepseek': [],
    codex: [
        { value: 'auto', label: 'Auto' },
        { value: 'gpt-5.5', label: 'GPT-5.5' },
        { value: 'gpt-5.4', label: 'GPT-5.4' },
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
        { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
        { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
        { value: 'gpt-5.2', label: 'GPT-5.2' },
        { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
        { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
    ],
    cursor: [],
    gemini: [
        { value: 'auto', label: 'Default' },
        ...GEMINI_MODEL_PRESETS.map(m => ({ value: m, label: GEMINI_MODEL_LABELS[m] })),
    ],
    opencode: [],
}

export const CODEX_REASONING_EFFORT_OPTIONS: { value: CodexReasoningEffort; label: string }[] = [
    { value: 'default', label: 'Default' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'XHigh' },
]

export const CODEX_SERVICE_TIER_OPTIONS: { value: CodexServiceTier; label: string }[] = [
    { value: 'default', label: 'Default' },
    { value: 'standard', label: 'Standard' },
    { value: 'fast', label: 'Fast' },
]

export const CLAUDE_EFFORT_OPTIONS: { value: ClaudeEffort; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    ...CLAUDE_EFFORT_PRESETS.map(effort => ({
        value: effort,
        label: CLAUDE_EFFORT_LABELS[effort],
    })),
]
