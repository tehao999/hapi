import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { queryKeys } from '@/lib/query-keys'
import type { Session } from '@/types/api'
import { useSSE } from './useSSE'

class FakeEventSource {
    static instances: FakeEventSource[] = []
    static readonly CLOSED = 2

    onmessage: ((event: MessageEvent<string>) => void) | null = null
    onopen: (() => void) | null = null
    onerror: ((event: Event) => void) | null = null
    readyState = 0
    close = vi.fn(() => {
        this.readyState = FakeEventSource.CLOSED
    })

    constructor(readonly url: string) {
        FakeEventSource.instances.push(this)
    }

    emit(event: unknown) {
        this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>)
    }
}

function createHarness() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
        }
    })
    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    return { queryClient, wrapper }
}

function createWrapper() {
    return createHarness().wrapper
}

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: { path: '/repo', host: 'host', flavor: 'codex' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        model: null,
        modelReasoningEffort: null,
        serviceTier: null,
        effort: null,
        permissionMode: 'default',
        collaborationMode: 'default',
        ...overrides
    }
}

describe('useSSE', () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        FakeEventSource.instances = []
    })

    it('does not reconnect after a terminal rejected connection-changed event', async () => {
        vi.stubGlobal('EventSource', FakeEventSource)
        const onDisconnect = vi.fn()

        renderHook(() => useSSE({
            enabled: true,
            token: 'token',
            baseUrl: 'http://localhost:3000',
            subscription: { sessionId: 'missing' },
            onEvent: vi.fn(),
            onDisconnect
        }), { wrapper: createWrapper() })

        expect(FakeEventSource.instances).toHaveLength(1)
        vi.useFakeTimers()

        const source = FakeEventSource.instances[0]!
        act(() => {
            source.emit({
                type: 'connection-changed',
                data: {
                    status: 'rejected',
                    reason: 'session-not-found'
                }
            })
            source.onerror?.(new Event('error'))
            vi.advanceTimersByTime(60_000)
        })

        expect(source.close).toHaveBeenCalled()
        expect(onDisconnect).toHaveBeenCalledWith('rejected:session-not-found')
        expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('applies serviceTier session patches to cached session details', () => {
        vi.stubGlobal('EventSource', FakeEventSource)
        const { queryClient, wrapper } = createHarness()
        queryClient.setQueryData(queryKeys.session('session-1'), { session: createSession() })

        renderHook(() => useSSE({
            enabled: true,
            token: 'token',
            baseUrl: 'http://localhost:3000',
            subscription: { sessionId: 'session-1' },
            onEvent: vi.fn()
        }), { wrapper })

        expect(FakeEventSource.instances).toHaveLength(1)

        act(() => {
            FakeEventSource.instances[0]!.emit({
                type: 'session-updated',
                sessionId: 'session-1',
                data: { serviceTier: 'fast' }
            })
        })

        const cached = queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))
        expect(cached?.session.serviceTier).toBe('fast')
    })

})
