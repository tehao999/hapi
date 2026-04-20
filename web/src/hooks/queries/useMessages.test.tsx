import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMessages } from './useMessages'
import { queryKeys } from '@/lib/query-keys'
import type { ApiClient } from '@/api/client'
import type { MessageWindowState } from '@/lib/message-window-store'

const messageStore = vi.hoisted(() => ({
    clearMessageWindow: vi.fn(),
    fetchLatestMessages: vi.fn(async () => {}),
    fetchOlderMessages: vi.fn(async () => {}),
    flushPendingMessages: vi.fn(() => false),
    getMessageWindowState: vi.fn(),
    setAtBottom: vi.fn(),
    subscribeMessageWindow: vi.fn(() => () => {}),
}))

vi.mock('@/lib/message-window-store', () => ({
    clearMessageWindow: messageStore.clearMessageWindow,
    fetchLatestMessages: messageStore.fetchLatestMessages,
    fetchOlderMessages: messageStore.fetchOlderMessages,
    flushPendingMessages: messageStore.flushPendingMessages,
    getMessageWindowState: messageStore.getMessageWindowState,
    setAtBottom: messageStore.setAtBottom,
    subscribeMessageWindow: messageStore.subscribeMessageWindow,
}))

const EMPTY_MESSAGE_STATE: MessageWindowState = {
    sessionId: 'session-1',
    messages: [],
    pending: [],
    pendingCount: 0,
    hasMore: false,
    oldestSeq: null,
    newestSeq: null,
    isLoading: false,
    isLoadingMore: false,
    warning: null,
    atBottom: true,
    messagesVersion: 0,
}

function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
}

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
}

function createApi(): ApiClient {
    return {
        markSessionRead: vi.fn(async () => {}),
    } as unknown as ApiClient
}

describe('useMessages', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it('marks the active session read and clears cached unread count when viewed', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        vi.spyOn(document, 'hasFocus').mockReturnValue(true)
        messageStore.getMessageWindowState.mockReturnValue(EMPTY_MESSAGE_STATE)

        const api = createApi()
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.sessions, {
            sessions: [
                {
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    activeAt: 1,
                    updatedAt: 2,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    unreadCount: 3,
                    model: null,
                    effort: null,
                },
                {
                    id: 'session-2',
                    active: true,
                    thinking: false,
                    activeAt: 1,
                    updatedAt: 2,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    unreadCount: 5,
                    model: null,
                    effort: null,
                },
            ],
        })

        renderHook(() => useMessages(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        await waitFor(() => {
            expect(api.markSessionRead).toHaveBeenCalledWith('session-1')
        })
        await waitFor(() => {
            const sessions = queryClient.getQueryData<{ sessions: Array<{ id: string; unreadCount: number }> }>(queryKeys.sessions)
            expect(sessions?.sessions.find((session) => session.id === 'session-1')?.unreadCount).toBe(0)
            expect(sessions?.sessions.find((session) => session.id === 'session-2')?.unreadCount).toBe(5)
        })
    })
})
