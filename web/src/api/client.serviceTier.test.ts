import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'

describe('ApiClient Codex service tier requests', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('sends serviceTier when spawning a session', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ type: 'success', sessionId: 'session-1' }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        await api.spawnSession(
            'machine-1',
            '/repo',
            'codex',
            undefined,
            undefined,
            true,
            'simple',
            undefined,
            undefined,
            'fast'
        )

        expect(fetchMock).toHaveBeenCalledWith('/api/machines/machine-1/spawn', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                directory: '/repo',
                agent: 'codex',
                model: undefined,
                modelReasoningEffort: undefined,
                yolo: true,
                sessionType: 'simple',
                worktreeName: undefined,
                effort: undefined,
                serviceTier: 'fast'
            })
        }))
    })

    it('posts serviceTier session config updates', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        await api.setServiceTier('session-1', 'fast')

        expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session-1/service-tier', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ serviceTier: 'fast' })
        }))
    })
})
