import { describe, expect, test } from 'bun:test'
import {
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
        expect(isClaudeModelPreset('opus')).toBe(false)
        expect(isClaudeModelPreset('haiku-3-5')).toBe(false)
    })

    test('rejects null and undefined', () => {
        expect(isClaudeModelPreset(null)).toBe(false)
        expect(isClaudeModelPreset(undefined)).toBe(false)
    })
})

describe('getClaudeModelLabel', () => {
    test('returns label for known presets', () => {
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
