import { describe, expect, it } from 'vitest'
import { DEFAULT_CLAUDE_MODEL_LABEL } from '@hapi/protocol'
import { getSessionEffortLabel, getSessionModelLabel } from './sessionModelLabel'

describe('getSessionModelLabel', () => {
    it('prefers the explicit session model', () => {
        expect(getSessionModelLabel({ model: 'gpt-5.4' })).toEqual({
            key: 'session.item.model',
            value: 'gpt-5.4'
        })
    })

    it('renders friendly labels for known Claude aliases', () => {
        expect(getSessionModelLabel({ model: 'fable' })).toEqual({
            key: 'session.item.model',
            value: 'Fable 5 · 1M'
        })

        expect(getSessionModelLabel({ model: 'opus' })).toEqual({
            key: 'session.item.model',
            value: 'Opus 4.8 · 1M'
        })
    })

    it('returns null when no model is available', () => {
        expect(getSessionModelLabel({})).toBeNull()
    })

    it('shows the default Claude model label when a Claude session has no explicit model', () => {
        const claudeSession = {
            metadata: { flavor: 'claude' }
        } as Parameters<typeof getSessionModelLabel>[0]

        expect(getSessionModelLabel(claudeSession)).toEqual({
            key: 'session.item.model',
            value: DEFAULT_CLAUDE_MODEL_LABEL
        })
    })

    it('normalizes Claude auto/default model aliases to the default Claude label', () => {
        expect(getSessionModelLabel({ model: 'auto', metadata: { flavor: 'claude' } })).toEqual({
            key: 'session.item.model',
            value: DEFAULT_CLAUDE_MODEL_LABEL
        })
        expect(getSessionModelLabel({ model: 'default', metadata: { flavor: 'claude' } })).toEqual({
            key: 'session.item.model',
            value: DEFAULT_CLAUDE_MODEL_LABEL
        })
    })

    it('appends Codex reasoning effort and service tier after the model name', () => {
        expect(getSessionModelLabel({
            metadata: { flavor: 'codex' },
            model: 'gpt-5.5',
            modelReasoningEffort: 'xhigh',
            serviceTier: 'fast'
        })).toEqual({
            key: 'session.item.model',
            value: 'gpt-5.5 · XHigh · Fast'
        })
    })

    it('normalizes Codex priority service tier to Fast in the model label', () => {
        expect(getSessionModelLabel({
            metadata: { flavor: 'codex' },
            model: 'gpt-5.5',
            serviceTier: 'priority'
        })).toEqual({
            key: 'session.item.model',
            value: 'gpt-5.5 · Fast'
        })
    })

    it('shows Codex reasoning effort and service tier even when the model is auto', () => {
        expect(getSessionModelLabel({
            metadata: { flavor: 'codex' },
            modelReasoningEffort: 'xhigh',
            serviceTier: 'fast'
        })).toEqual({
            key: 'session.item.model',
            value: 'Auto · XHigh · Fast'
        })
    })

    it('does not append Codex suffixes to non-Codex sessions', () => {
        expect(getSessionModelLabel({
            metadata: { flavor: 'gemini' },
            model: 'gemini-3.1-pro',
            modelReasoningEffort: 'xhigh',
            serviceTier: 'fast'
        })).toEqual({
            key: 'session.item.model',
            value: 'gemini-3.1-pro'
        })
    })
})

describe('getSessionEffortLabel', () => {
    it('shows Auto for Claude sessions with no explicit effort', () => {
        expect(getSessionEffortLabel({ metadata: { flavor: 'claude' } })).toEqual({
            key: 'session.item.effort',
            value: 'Auto'
        })
    })

    it('shows Max for Claude-DeepSeek sessions with no explicit effort', () => {
        expect(getSessionEffortLabel({ metadata: { flavor: 'claude-deepseek' } })).toEqual({
            key: 'session.item.effort',
            value: 'Max'
        })
    })

    it('shows explicit Claude effort labels', () => {
        expect(getSessionEffortLabel({
            metadata: { flavor: 'claude' },
            effort: 'max'
        })).toEqual({
            key: 'session.item.effort',
            value: 'Max'
        })

        expect(getSessionEffortLabel({
            metadata: { flavor: 'claude' },
            effort: 'xhigh'
        })).toEqual({
            key: 'session.item.effort',
            value: 'XHigh'
        })
    })

    it('does not show effort labels for agents without effort support', () => {
        expect(getSessionEffortLabel({
            metadata: { flavor: 'codex' },
            effort: 'max'
        })).toBeNull()
    })
})
