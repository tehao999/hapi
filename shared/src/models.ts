export const DEFAULT_CLAUDE_MODEL_LABEL = 'Opus 4.8 · 1M'

export const CLAUDE_MODEL_LABELS = {
    sonnet: 'Sonnet 4.6 · 200K',
    haiku: 'Haiku 4.5 · 200K',
    opus: DEFAULT_CLAUDE_MODEL_LABEL,
    'opus[1m]': DEFAULT_CLAUDE_MODEL_LABEL,
    'sonnet[1m]': 'Sonnet · 1M'
} as const

export const CLAUDE_MODEL_PRESETS = ['sonnet', 'haiku'] as const
export type ClaudeModelPreset = typeof CLAUDE_MODEL_PRESETS[number]
const CLAUDE_MODEL_PRESET_SET = new Set<string>(CLAUDE_MODEL_PRESETS)

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

    return CLAUDE_MODEL_LABELS[trimmedModel as ClaudeModelPreset] ?? null
}
