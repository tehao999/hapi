import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, SessionsResponse } from '@/types/api'
import {
    fetchLatestMessages,
    fetchOlderMessages,
    flushPendingMessages,
    getMessageWindowState,
    setAtBottom as setMessageWindowAtBottom,
    subscribeMessageWindow,
    type MessageWindowState,
} from '@/lib/message-window-store'
import { shouldMarkSessionRead } from '@/lib/readState'
import { queryKeys } from '@/lib/query-keys'

const READ_MARK_THROTTLE_MS = 10_000

const EMPTY_STATE: MessageWindowState = {
    sessionId: 'unknown',
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

function clearSessionUnreadCount(queryClient: QueryClient, sessionId: string): void {
    queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
        if (!previous) {
            return previous
        }

        let changed = false
        const sessions = previous.sessions.map((session) => {
            if (session.id !== sessionId || session.unreadCount === 0) {
                return session
            }
            changed = true
            return {
                ...session,
                unreadCount: 0
            }
        })

        return changed ? { ...previous, sessions } : previous
    })
}

export function useMessages(api: ApiClient | null, sessionId: string | null): {
    messages: DecryptedMessage[]
    warning: string | null
    isLoading: boolean
    isLoadingMore: boolean
    hasMore: boolean
    pendingCount: number
    messagesVersion: number
    loadMore: () => Promise<unknown>
    refetch: () => Promise<unknown>
    flushPending: () => Promise<void>
    setAtBottom: (atBottom: boolean) => void
} {
    const queryClient = useQueryClient()
    const previousMessagesVersionRef = useRef<number | null>(null)
    const lastReadMarkAtRef = useRef(0)
    const trailingReadMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const activeSessionRef = useRef<string | null>(sessionId)
    const state = useSyncExternalStore(
        useCallback((listener) => {
            if (!sessionId) {
                return () => {}
            }
            return subscribeMessageWindow(sessionId, listener)
        }, [sessionId]),
        useCallback(() => {
            if (!sessionId) {
                return EMPTY_STATE
            }
            return getMessageWindowState(sessionId)
        }, [sessionId]),
        () => EMPTY_STATE
    )

    const clearTrailingReadMarkTimer = useCallback(() => {
        if (trailingReadMarkTimerRef.current === null) {
            return
        }
        clearTimeout(trailingReadMarkTimerRef.current)
        trailingReadMarkTimerRef.current = null
    }, [])

    const clearLatestFetchUnreadLocally = useCallback(() => {
        if (!sessionId) {
            return
        }
        clearSessionUnreadCount(queryClient, sessionId)
    }, [queryClient, sessionId])

    const markReadOnServer = useCallback(async () => {
        if (!api || !sessionId || !shouldMarkSessionRead()) {
            return false
        }

        try {
            await api.markSessionRead(sessionId)
            if (activeSessionRef.current !== sessionId) {
                return false
            }
            lastReadMarkAtRef.current = Date.now()
            return true
        } catch {
            return false
        }
    }, [api, sessionId])

    const scheduleTrailingReadMark = useCallback((delayMs: number) => {
        if (trailingReadMarkTimerRef.current !== null) {
            return
        }
        trailingReadMarkTimerRef.current = setTimeout(() => {
            trailingReadMarkTimerRef.current = null
            void markReadOnServer()
        }, delayMs)
    }, [markReadOnServer])

    const markReadIfActive = useCallback(async (options?: { throttle?: boolean }) => {
        if (!api || !sessionId || !shouldMarkSessionRead()) {
            return
        }

        clearSessionUnreadCount(queryClient, sessionId)
        const now = Date.now()
        if (options?.throttle && lastReadMarkAtRef.current > 0) {
            const elapsed = now - lastReadMarkAtRef.current
            if (elapsed < READ_MARK_THROTTLE_MS) {
                scheduleTrailingReadMark(READ_MARK_THROTTLE_MS - elapsed)
                return
            }
        }

        clearTrailingReadMarkTimer()
        await markReadOnServer()
    }, [api, clearTrailingReadMarkTimer, markReadOnServer, queryClient, scheduleTrailingReadMark, sessionId])

    const fetchLatestAndMaybeMarkRead = useCallback(async () => {
        if (!api || !sessionId) {
            return
        }
        const markRead = shouldMarkSessionRead()
        if (markRead) {
            clearLatestFetchUnreadLocally()
        }
        setMessageWindowAtBottom(sessionId, true)
        const markedRead = await fetchLatestMessages(api, sessionId, { markRead })
        if (markedRead && activeSessionRef.current === sessionId) {
            clearTrailingReadMarkTimer()
            lastReadMarkAtRef.current = Date.now()
        }
    }, [api, clearLatestFetchUnreadLocally, clearTrailingReadMarkTimer, sessionId])

    useEffect(() => {
        if (activeSessionRef.current === sessionId) {
            return
        }
        clearTrailingReadMarkTimer()
        activeSessionRef.current = sessionId
        previousMessagesVersionRef.current = null
        lastReadMarkAtRef.current = 0
    }, [clearTrailingReadMarkTimer, sessionId])

    useEffect(() => {
        void fetchLatestAndMaybeMarkRead()
    }, [fetchLatestAndMaybeMarkRead])

    useEffect(() => {
        return () => {
            clearTrailingReadMarkTimer()
        }
    }, [clearTrailingReadMarkTimer])

    useEffect(() => {
        if (!api || !sessionId) {
            return
        }

        const onActive = () => {
            void markReadIfActive()
        }

        window.addEventListener('focus', onActive)
        document.addEventListener('visibilitychange', onActive)
        return () => {
            window.removeEventListener('focus', onActive)
            document.removeEventListener('visibilitychange', onActive)
        }
    }, [api, markReadIfActive, sessionId])

    useEffect(() => {
        const previousMessagesVersion = previousMessagesVersionRef.current
        previousMessagesVersionRef.current = state.messagesVersion
        if (previousMessagesVersion === null || state.messagesVersion === previousMessagesVersion) {
            return
        }
        void markReadIfActive({ throttle: true })
    }, [markReadIfActive, state.messagesVersion])

    const loadMore = useCallback(async () => {
        if (!api || !sessionId) return
        if (!state.hasMore || state.isLoadingMore) return
        await fetchOlderMessages(api, sessionId)
    }, [api, sessionId, state.hasMore, state.isLoadingMore])

    const refetch = useCallback(async () => {
        await fetchLatestAndMaybeMarkRead()
    }, [fetchLatestAndMaybeMarkRead])

    const flushPending = useCallback(async () => {
        if (!sessionId) return
        const needsRefresh = flushPendingMessages(sessionId)
        if (needsRefresh) {
            await fetchLatestAndMaybeMarkRead()
        }
    }, [fetchLatestAndMaybeMarkRead, sessionId])

    const setAtBottom = useCallback((atBottom: boolean) => {
        if (!sessionId) return
        setMessageWindowAtBottom(sessionId, atBottom)
    }, [sessionId])

    return {
        messages: state.messages,
        warning: state.warning,
        isLoading: state.isLoading,
        isLoadingMore: state.isLoadingMore,
        hasMore: state.hasMore,
        pendingCount: state.pendingCount,
        messagesVersion: state.messagesVersion,
        loadMore,
        refetch,
        flushPending,
        setAtBottom,
    }
}
