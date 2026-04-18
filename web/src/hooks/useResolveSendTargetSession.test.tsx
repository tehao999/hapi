import { describe, expect, it, vi } from 'vitest'
import { useResolveSendTargetSession } from './useResolveSendTargetSession'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

function makeApi() {
    return {
        resumeSession: vi.fn(async () => 'session-resolved'),
        takeoverSession: vi.fn(async () => 'session-runner')
    } as unknown as ApiClient
}

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        active: true,
        thinking: false,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex',
            mirrorSource: 'codex-desktop-sync',
            executionControl: {
                owner: 'desktop-sync',
                generation: 1,
                leaseExpiresAt: null,
                runnerSessionId: null,
                updatedAt: 1
            }
        },
        ...overrides
    } as Session
}

describe('useResolveSendTargetSession', () => {
    it('takes over an active desktop-owned mirror session before send', async () => {
        const api = makeApi()
        const result = useResolveSendTargetSession(api, makeSession())

        await expect(result.resolve('session-1')).resolves.toBe('session-runner')
        expect(api.takeoverSession).toHaveBeenCalledWith('session-1')
        expect(api.resumeSession).not.toHaveBeenCalled()
    })

    it('resumes an inactive native session before send', async () => {
        const api = makeApi()
        const session = makeSession({
            active: false,
            metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex' }
        })
        const result = useResolveSendTargetSession(api, session)

        await expect(result.resolve('session-1')).resolves.toBe('session-resolved')
        expect(api.resumeSession).toHaveBeenCalledWith('session-1')
        expect(api.takeoverSession).not.toHaveBeenCalled()
    })

    it('does nothing for an already-active native hapi session', async () => {
        const api = makeApi()
        const session = makeSession({ metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex' } })
        const result = useResolveSendTargetSession(api, session)

        await expect(result.resolve('session-1')).resolves.toBe('session-1')
        expect(api.resumeSession).not.toHaveBeenCalled()
        expect(api.takeoverSession).not.toHaveBeenCalled()
    })
})
