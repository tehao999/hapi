import { describe, expect, test } from 'bun:test'
import {
    CLAUDE_EFFORT_LABELS,
    CLAUDE_EFFORT_PRESETS,
    CLAUDE_MODEL_PRESETS,
    CLAUDE_MODEL_LABELS,
    DEFAULT_GEMINI_MODEL,
    GEMINI_MODEL_LABELS,
    GEMINI_MODEL_PRESETS,
    getClaudeModelLabel,
    isClaudeModelPreset,
} from './models'

describe('isClaudeModelPreset', () => {
    test('accepts valid presets', () => {
        for (const preset of CLAUDE_MODEL_PRESETS) {
            expect(isClaudeModelPreset(preset)).toBe(true)
        }
    })

    test('rejects unknown model string', () => {
        expect(isClaudeModelPreset('haiku-3-5')).toBe(false)
    })

    test('rejects null and undefined', () => {
        expect(isClaudeModelPreset(null)).toBe(false)
        expect(isClaudeModelPreset(undefined)).toBe(false)
    })
})

describe('getClaudeModelLabel', () => {
    test('returns label for known presets', () => {
        expect(getClaudeModelLabel('fable')).toBe('Fable 5 · 1M')
        expect(getClaudeModelLabel('opus')).toBe('Opus 4.8 · 1M')
        expect(getClaudeModelLabel('sonnet')).toBe('Sonnet 4.6 · 200K')
        expect(getClaudeModelLabel('haiku')).toBe('Haiku 4.5 · 200K')
    })

    test('trims whitespace before lookup', () => {
        expect(getClaudeModelLabel('  sonnet  ')).toBe('Sonnet 4.6 · 200K')
    })

    test('returns null for unknown model', () => {
        expect(getClaudeModelLabel('haiku-3-5')).toBeNull()
    })

    test('returns null for empty/whitespace-only string', () => {
        expect(getClaudeModelLabel('')).toBeNull()
        expect(getClaudeModelLabel('   ')).toBeNull()
    })
})

describe('model constants consistency', () => {
    test('Claude model presets follow the Claude Code concise picker order', () => {
        expect(CLAUDE_MODEL_PRESETS).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
    })

    test('every CLAUDE_MODEL_PRESET has a label', () => {
        for (const preset of CLAUDE_MODEL_PRESETS) {
            expect(CLAUDE_MODEL_LABELS[preset]).toBeDefined()
        }
    })

    test('every GEMINI_MODEL_PRESET has a label', () => {
        for (const preset of GEMINI_MODEL_PRESETS) {
            expect(GEMINI_MODEL_LABELS[preset]).toBeDefined()
        }
    })

    test('DEFAULT_GEMINI_MODEL is a valid preset', () => {
        expect(GEMINI_MODEL_PRESETS).toContain(DEFAULT_GEMINI_MODEL)
    })
})

describe('Claude effort constants', () => {
    test('matches Claude Code --effort flag values in order', () => {
        expect(CLAUDE_EFFORT_PRESETS).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    })

    test('every effort preset has a label', () => {
        for (const effort of CLAUDE_EFFORT_PRESETS) {
            expect(CLAUDE_EFFORT_LABELS[effort]).toBeDefined()
        }
    })
})
