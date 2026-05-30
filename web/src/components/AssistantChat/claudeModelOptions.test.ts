import { describe, expect, it } from 'vitest'
import { getClaudeComposerModelOptions, getNextClaudeComposerModel } from './claudeModelOptions'

describe('getClaudeComposerModelOptions', () => {
    it('includes the active non-preset Claude model in the options list', () => {
        expect(getClaudeComposerModelOptions('claude-opus-4-1-20250805')).toEqual([
            { value: null, label: 'Opus 4.8 · 1M' },
            { value: 'claude-opus-4-1-20250805', label: 'claude-opus-4-1-20250805' },
            { value: 'sonnet', label: 'Sonnet 4.6 · 200K' },
            { value: 'haiku', label: 'Haiku 4.5 · 200K' },
        ])
    })

    it('does not duplicate preset Claude models', () => {
        expect(getClaudeComposerModelOptions('haiku')).toEqual([
            { value: null, label: 'Opus 4.8 · 1M' },
            { value: 'sonnet', label: 'Sonnet 4.6 · 200K' },
            { value: 'haiku', label: 'Haiku 4.5 · 200K' },
        ])
    })
})

describe('getNextClaudeComposerModel', () => {
    it('cycles from a non-preset Claude model to the next selectable model instead of auto', () => {
        expect(getNextClaudeComposerModel('claude-opus-4-1-20250805')).toBe('sonnet')
    })
})
