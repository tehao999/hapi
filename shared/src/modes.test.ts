import { describe, expect, test } from 'bun:test'
import {
    CODEX_SERVICE_TIERS,
    getCodexServiceTierLabel,
    getCodexServiceTierOptions,
} from './modes'
import { CodexServiceTierSchema, SessionSchema } from './schemas'

describe('Codex service tiers', () => {
    test('exposes the selectable speed tiers and labels', () => {
        expect(CODEX_SERVICE_TIERS).toEqual(['standard', 'fast'])
        expect(getCodexServiceTierLabel('standard')).toBe('Standard')
        expect(getCodexServiceTierLabel('fast')).toBe('Fast')
        expect(getCodexServiceTierOptions()).toEqual([
            { tier: 'standard', label: 'Standard' },
            { tier: 'fast', label: 'Fast' },
        ])
    })

    test('validates service tier payload values without treating default as a wire value', () => {
        expect(CodexServiceTierSchema.safeParse('standard').success).toBe(true)
        expect(CodexServiceTierSchema.safeParse('fast').success).toBe(true)
        expect(CodexServiceTierSchema.safeParse('default').success).toBe(false)
    })

    test('keeps service tier optional and nullable on session snapshots', () => {
        const baseSession = {
            id: 'session-1',
            namespace: 'default',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: 1,
            metadata: null,
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 1,
            thinking: false,
            thinkingAt: 0,
        }

        expect(SessionSchema.parse(baseSession).serviceTier).toBeUndefined()
        expect(SessionSchema.parse({ ...baseSession, serviceTier: null }).serviceTier).toBeNull()
        expect(SessionSchema.parse({ ...baseSession, serviceTier: 'fast' }).serviceTier).toBe('fast')
    })
})
