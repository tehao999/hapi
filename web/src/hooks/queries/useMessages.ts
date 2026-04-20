import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, SessionsResponse } from '@/types/api'
import {
    clearMessageWindow,
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

    const markReadIfActive = useCallback(async () => {
        if (!api || !sessionId || !shouldMarkSessionRead()) {
            return
        }

        try {
            await api.markSessionRead(sessionId)
            clearSessionUnreadCount(queryClient, sessionId)
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
                queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) }),
            ]).catch(() => {})
        } catch {
        }
    }, [api, queryClient, sessionId])

    useEffect(() => {
        if (!api || !sessionId) {
            return
        }
        void fetchLatestMessages(api, sessionId)
        void markReadIfActive()
    }, [api, markReadIfActive, sessionId])

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
        void markReadIfActive()
    }, [markReadIfActive, state.messagesVersion])

    useEffect(() => {
        if (!sessionId) {
            return
        }
        return () => {
            clearMessageWindow(sessionId)
        }
    }, [sessionId])

    const loadMore = useCallback(async () => {
        if (!api || !sessionId) return
        if (!state.hasMore || state.isLoadingMore) return
        await fetchOlderMessages(api, sessionId)
    }, [api, sessionId, state.hasMore, state.isLoadingMore])

    const refetch = useCallback(async () => {
        if (!api || !sessionId) return
        await fetchLatestMessages(api, sessionId)
        await markReadIfActive()
    }, [api, markReadIfActive, sessionId])

    const flushPending = useCallback(async () => {
        if (!sessionId) return
        const needsRefresh = flushPendingMessages(sessionId)
        if (needsRefresh && api) {
            await fetchLatestMessages(api, sessionId)
            await markReadIfActive()
        }
    }, [api, markReadIfActive, sessionId])

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
