import { describe, expect, it } from 'vitest'
import { getContextBudgetTokens } from './modelConfig'

describe('getContextBudgetTokens', () => {
    it('uses the large budget for the current Claude default model', () => {
        expect(getContextBudgetTokens(null, 'claude')).toBe(990_000)
    })

    it('uses the default Claude budget for explicit 200K presets', () => {
        expect(getContextBudgetTokens('sonnet', 'claude')).toBe(190_000)
    })

    it('uses the default Claude budget for full Claude model names', () => {
        expect(getContextBudgetTokens('claude-sonnet-4-6', 'claude')).toBe(190_000)
        expect(getContextBudgetTokens('claude-opus-4-80', 'claude')).toBe(190_000)
    })

    it('uses the large budget for full Opus 4.8 model names', () => {
        expect(getContextBudgetTokens('claude-opus-4-8', 'claude')).toBe(990_000)
        expect(getContextBudgetTokens('claude-opus-4-8-20260530', 'claude')).toBe(990_000)
    })

    it('returns null for non-Claude sessions', () => {
        expect(getContextBudgetTokens('gpt-5.4', 'codex')).toBeNull()
    })
})
