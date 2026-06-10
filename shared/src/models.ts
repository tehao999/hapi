export const DEFAULT_CLAUDE_MODEL_LABEL = 'Default (Claude Code)'

export const CLAUDE_MODEL_LABELS = {
    fable: 'Fable 5 · 1M',
    'fable[1m]': 'Fable 5 · 1M',
    'claude-fable-5': 'Fable 5 · 1M',
    'claude-fable-5[1m]': 'Fable 5 · 1M',
    sonnet: 'Sonnet 4.6 · 200K',
    'sonnet[1m]': 'Sonnet 4.6 · 1M',
    'claude-sonnet-4-6': 'Sonnet 4.6 · 200K',
    'claude-sonnet-4-6[1m]': 'Sonnet 4.6 · 1M',
    haiku: 'Haiku 4.5 · 200K',
    'claude-haiku-4-5': 'Haiku 4.5 · 200K',
    opus: 'Opus 4.8 · 1M',
    'opus[1m]': 'Opus 4.8 · 1M',
    'claude-opus-4-8': 'Opus 4.8 · 1M',
    'claude-opus-4-8[1m]': 'Opus 4.8 · 1M'
} as const

export const CLAUDE_MODEL_PRESETS = ['fable', 'opus', 'sonnet', 'haiku'] as const
export type ClaudeModelPreset = typeof CLAUDE_MODEL_PRESETS[number]
const CLAUDE_MODEL_PRESET_SET = new Set<string>(CLAUDE_MODEL_PRESETS)

export const CLAUDE_EFFORT_PRESETS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type ClaudeEffortPreset = typeof CLAUDE_EFFORT_PRESETS[number]

export const CLAUDE_EFFORT_LABELS: Record<ClaudeEffortPreset, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'XHigh',
    max: 'Max'
}

export const GEMINI_MODEL_LABELS = {
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
    'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
} as const

export type GeminiModelPreset = keyof typeof GEMINI_MODEL_LABELS
export const GEMINI_MODEL_PRESETS = Object.keys(GEMINI_MODEL_LABELS) as GeminiModelPreset[]
export const DEFAULT_GEMINI_MODEL: GeminiModelPreset = 'gemini-2.5-pro'

export function isClaudeModelPreset(model: string | null | undefined): model is ClaudeModelPreset {
    return typeof model === 'string' && CLAUDE_MODEL_PRESET_SET.has(model)
}

export function getClaudeModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    if (!trimmedModel) {
        return null
    }

    return CLAUDE_MODEL_LABELS[trimmedModel as keyof typeof CLAUDE_MODEL_LABELS] ?? null
}
