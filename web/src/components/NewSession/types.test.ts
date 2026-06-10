import { CLAUDE_MODEL_PRESETS, getClaudeModelLabel } from '@hapi/protocol'
import { describe, expect, it } from 'vitest'
import { CLAUDE_EFFORT_OPTIONS, CODEX_SERVICE_TIER_OPTIONS, MODEL_OPTIONS } from './types'

describe('Claude model options', () => {
    it('matches the concise local Claude Code model menu', () => {
        expect(MODEL_OPTIONS.claude).toEqual([
            { value: 'auto', label: 'Default (Claude Code)' },
            { value: 'fable', label: 'Fable 5 · 1M' },
            { value: 'opus', label: 'Opus 4.8 · 1M' },
            { value: 'sonnet', label: 'Sonnet 4.6 · 200K' },
            { value: 'haiku', label: 'Haiku 4.5 · 200K' },
        ])
    })

    it('exposes friendly labels for Claude model presets', () => {
        expect(CLAUDE_MODEL_PRESETS).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
        expect(getClaudeModelLabel('fable')).toBe('Fable 5 · 1M')
        expect(getClaudeModelLabel('opus')).toBe('Opus 4.8 · 1M')
        expect(getClaudeModelLabel('sonnet')).toBe('Sonnet 4.6 · 200K')
        expect(getClaudeModelLabel('haiku')).toBe('Haiku 4.5 · 200K')
    })
})

describe('Claude effort options', () => {
    it('matches supported effort presets in expected order', () => {
        expect(CLAUDE_EFFORT_OPTIONS).toEqual([
            { value: 'auto', label: 'Auto' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'XHigh' },
            { value: 'max', label: 'Max' },
        ])
    })
})

describe('Codex model options', () => {
    it('includes GPT-5.5 in the expected order', () => {
        expect(MODEL_OPTIONS.codex).toEqual([
            { value: 'auto', label: 'Auto' },
            { value: 'gpt-5.5', label: 'GPT-5.5' },
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
            { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
            { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
            { value: 'gpt-5.2', label: 'GPT-5.2' },
            { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
            { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
        ])
    })
})

describe('Codex service tier options', () => {
    it('matches supported service tiers in expected order', () => {
        expect(CODEX_SERVICE_TIER_OPTIONS).toEqual([
            { value: 'default', label: 'Default' },
            { value: 'standard', label: 'Standard' },
            { value: 'fast', label: 'Fast' },
        ])
    })
})
