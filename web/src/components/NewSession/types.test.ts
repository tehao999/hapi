import { CLAUDE_MODEL_PRESETS, getClaudeModelLabel } from '@hapi/protocol'
import { describe, expect, it } from 'vitest'
import { CLAUDE_EFFORT_OPTIONS, MODEL_OPTIONS } from './types'

describe('Claude model options', () => {
    it('matches the concise local Claude Code model menu', () => {
        expect(MODEL_OPTIONS.claude).toEqual([
            { value: 'auto', label: 'Opus 4.8 · 1M' },
            { value: 'sonnet', label: 'Sonnet 4.6 · 200K' },
            { value: 'haiku', label: 'Haiku 4.5 · 200K' },
        ])
    })

    it('exposes friendly labels for Claude model presets', () => {
        expect(CLAUDE_MODEL_PRESETS).toEqual(['sonnet', 'haiku'])
        expect(getClaudeModelLabel('sonnet')).toBe('Sonnet 4.6 · 200K')
        expect(getClaudeModelLabel('haiku')).toBe('Haiku 4.5 · 200K')
    })
})

describe('Claude effort options', () => {
    it('matches supported effort presets in expected order', () => {
        expect(CLAUDE_EFFORT_OPTIONS).toEqual([
            { value: 'auto', label: 'Auto' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'max', label: 'Max' },
        ])
    })
})
