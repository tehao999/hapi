import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
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

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
        }
    })
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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
})
