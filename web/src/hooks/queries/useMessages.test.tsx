import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMessages } from './useMessages'
import { queryKeys } from '@/lib/query-keys'
import type { ApiClient } from '@/api/client'
import type { MessageWindowState } from '@/lib/message-window-store'

const messageStore = vi.hoisted(() => ({
    clearMessageWindow: vi.fn(),
    fetchLatestMessages: vi.fn(async () => false),
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
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it('marks the initial latest-message fetch read and clears cached unread count without a second read request', async () => {
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
            expect(messageStore.fetchLatestMessages).toHaveBeenCalledWith(api, 'session-1', { markRead: true })
        })
        expect(api.markSessionRead).not.toHaveBeenCalled()
        await waitFor(() => {
            const sessions = queryClient.getQueryData<{ sessions: Array<{ id: string; unreadCount: number }> }>(queryKeys.sessions)
            expect(sessions?.sessions.find((session) => session.id === 'session-1')?.unreadCount).toBe(0)
            expect(sessions?.sessions.find((session) => session.id === 'session-2')?.unreadCount).toBe(5)
        })
    })

    it('resets the selected message window to bottom before fetching latest messages', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        vi.spyOn(document, 'hasFocus').mockReturnValue(true)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            atBottom: false,
            pendingCount: 1,
        })

        const api = createApi()
        const queryClient = createQueryClient()

        renderHook(() => useMessages(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        await waitFor(() => {
            expect(messageStore.fetchLatestMessages).toHaveBeenCalledWith(api, 'session-1', { markRead: true })
        })
        expect(messageStore.setAtBottom).toHaveBeenCalledWith('session-1', true)
        expect(messageStore.setAtBottom.mock.invocationCallOrder[0]).toBeLessThan(
            messageStore.fetchLatestMessages.mock.invocationCallOrder[0]
        )
    })

    it('resets the selected message window to bottom before explicit refetches', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        vi.spyOn(document, 'hasFocus').mockReturnValue(true)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            atBottom: false,
            pendingCount: 1,
        })

        const api = createApi()
        const queryClient = createQueryClient()
        const { result } = renderHook(() => useMessages(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        await waitFor(() => {
            expect(messageStore.fetchLatestMessages).toHaveBeenCalled()
        })
        messageStore.setAtBottom.mockClear()
        messageStore.fetchLatestMessages.mockClear()

        await act(async () => {
            await result.current.refetch()
        })

        expect(messageStore.setAtBottom).toHaveBeenCalledWith('session-1', true)
        expect(messageStore.fetchLatestMessages).toHaveBeenCalledWith(api, 'session-1', { markRead: true })
        expect(messageStore.setAtBottom.mock.invocationCallOrder[0]).toBeLessThan(
            messageStore.fetchLatestMessages.mock.invocationCallOrder[0]
        )
    })

    it('resets the selected message window to bottom before refreshing overflow pending messages', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        vi.spyOn(document, 'hasFocus').mockReturnValue(true)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            atBottom: false,
            pendingCount: 1,
        })

        const api = createApi()
        const queryClient = createQueryClient()
        const { result } = renderHook(() => useMessages(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        await waitFor(() => {
            expect(messageStore.fetchLatestMessages).toHaveBeenCalled()
        })
        messageStore.flushPendingMessages.mockReturnValueOnce(true)
        messageStore.setAtBottom.mockClear()
        messageStore.fetchLatestMessages.mockClear()

        await act(async () => {
            await result.current.flushPending()
        })

        expect(messageStore.flushPendingMessages).toHaveBeenCalledWith('session-1')
        expect(messageStore.setAtBottom).toHaveBeenCalledWith('session-1', true)
        expect(messageStore.fetchLatestMessages).toHaveBeenCalledWith(api, 'session-1', { markRead: true })
        expect(messageStore.setAtBottom.mock.invocationCallOrder[0]).toBeLessThan(
            messageStore.fetchLatestMessages.mock.invocationCallOrder[0]
        )
    })

    it('does not let the initial latest-fetch optimistic clear suppress the next server read mark', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        vi.spyOn(document, 'hasFocus').mockReturnValue(true)
        const now = vi.spyOn(Date, 'now').mockReturnValue(100_000)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            messagesVersion: 0,
        })

        const api = createApi()
        const queryClient = createQueryClient()
        const { rerender } = renderHook(() => useMessages(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        await waitFor(() => {
            expect(messageStore.fetchLatestMessages).toHaveBeenCalled()
        })
        expect(api.markSessionRead).not.toHaveBeenCalled()

        now.mockReturnValue(101_000)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            messagesVersion: 1,
        })
        rerender()

        await waitFor(() => {
            expect(api.markSessionRead).toHaveBeenCalledTimes(1)
        })

        now.mockReturnValue(105_000)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            messagesVersion: 2,
        })
        rerender()

        await Promise.resolve()
        expect(api.markSessionRead).toHaveBeenCalledTimes(1)

        now.mockReturnValue(112_000)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            messagesVersion: 3,
        })
        rerender()

        await waitFor(() => {
            expect(api.markSessionRead).toHaveBeenCalledTimes(2)
        })
    })

    it('schedules a trailing server read mark for throttled message-version updates', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        vi.spyOn(document, 'hasFocus').mockReturnValue(true)
        messageStore.fetchLatestMessages.mockResolvedValueOnce(true)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            messagesVersion: 0,
        })

        const api = createApi()
        const queryClient = createQueryClient()
        const { rerender } = renderHook(() => useMessages(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await Promise.resolve()
        })
        expect(messageStore.fetchLatestMessages).toHaveBeenCalled()
        await act(async () => {
            await Promise.resolve()
        })

        vi.setSystemTime(101_000)
        messageStore.getMessageWindowState.mockReturnValue({
            ...EMPTY_MESSAGE_STATE,
            messagesVersion: 1,
        })
        rerender()

        await act(async () => {
            await Promise.resolve()
        })
        expect(api.markSessionRead).not.toHaveBeenCalled()

        await act(async () => {
            vi.advanceTimersByTime(8_999)
            await Promise.resolve()
        })
        expect(api.markSessionRead).not.toHaveBeenCalled()

        await act(async () => {
            vi.advanceTimersByTime(1)
            await Promise.resolve()
        })
        expect(api.markSessionRead).toHaveBeenCalledTimes(1)
    })

})
