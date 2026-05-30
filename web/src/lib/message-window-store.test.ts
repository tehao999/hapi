import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DecryptedMessage } from '@/types/api'
import {
    appendOptimisticMessage,
    clearMessageWindow,
    fetchLatestMessages,
    getMessageWindowState,
    MAX_IDLE_MESSAGE_WINDOWS,
    MESSAGE_WINDOW_IDLE_TTL_MS,
    subscribeMessageWindow,
} from './message-window-store'

function createMessage(id: string, seq: number): DecryptedMessage {
    return {
        id,
        seq,
        localId: null,
        createdAt: seq,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: id,
            },
        },
    } as DecryptedMessage
}

describe('message-window-store idle retention', () => {
    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('keeps a recent message window after the last subscriber leaves until the idle TTL expires', () => {
        vi.useFakeTimers()
        const sessionId = `session-retain-${Date.now()}`
        const unsubscribe = subscribeMessageWindow(sessionId, vi.fn())
        appendOptimisticMessage(sessionId, createMessage('message-1', 1))

        unsubscribe()

        expect(getMessageWindowState(sessionId).messages.map((message) => message.id)).toEqual(['message-1'])

        vi.advanceTimersByTime(MESSAGE_WINDOW_IDLE_TTL_MS - 1)
        expect(getMessageWindowState(sessionId).messages.map((message) => message.id)).toEqual(['message-1'])

        vi.advanceTimersByTime(1)
        expect(getMessageWindowState(sessionId).messages).toEqual([])
    })

    it('cancels idle cleanup when the same session is subscribed again', () => {
        vi.useFakeTimers()
        const sessionId = `session-resubscribe-${Date.now()}`
        const firstUnsubscribe = subscribeMessageWindow(sessionId, vi.fn())
        appendOptimisticMessage(sessionId, createMessage('message-2', 2))
        firstUnsubscribe()

        vi.advanceTimersByTime(Math.floor(MESSAGE_WINDOW_IDLE_TTL_MS / 2))
        const secondUnsubscribe = subscribeMessageWindow(sessionId, vi.fn())
        vi.advanceTimersByTime(MESSAGE_WINDOW_IDLE_TTL_MS)

        expect(getMessageWindowState(sessionId).messages.map((message) => message.id)).toEqual(['message-2'])

        secondUnsubscribe()
    })


    it('keeps server read marking when a markRead latest fetch is coalesced behind an in-flight preload', async () => {
        vi.useFakeTimers()
        const sessionId = `session-mark-read-race-${Date.now()}`
        const api = {
            getMessages: vi.fn(() => new Promise(() => {})),
            markSessionRead: vi.fn(async () => {}),
        }

        void fetchLatestMessages(api as never, sessionId)
        await Promise.resolve()
        await fetchLatestMessages(api as never, sessionId, { markRead: true })

        expect(api.getMessages).toHaveBeenCalledTimes(1)
        expect(api.markSessionRead).toHaveBeenCalledWith(sessionId)
    })

    it('explicitly clears a window and lets the reset idle state expire', () => {
        vi.useFakeTimers()
        const sessionId = `session-clear-${Date.now()}`
        const unsubscribe = subscribeMessageWindow(sessionId, vi.fn())
        appendOptimisticMessage(sessionId, createMessage('message-clear', 1))
        unsubscribe()

        clearMessageWindow(sessionId)

        expect(getMessageWindowState(sessionId).messages).toEqual([])
        vi.advanceTimersByTime(MESSAGE_WINDOW_IDLE_TTL_MS)
        expect(getMessageWindowState(sessionId).messages).toEqual([])
    })

    it('evicts the oldest idle message window when the idle cache exceeds its cap', () => {
        vi.useFakeTimers()
        const sessionIds = Array.from({ length: MAX_IDLE_MESSAGE_WINDOWS + 1 }, (_, index) => (
            `session-evict-${Date.now()}-${index}`
        ))

        for (const [index, sessionId] of sessionIds.entries()) {
            const unsubscribe = subscribeMessageWindow(sessionId, vi.fn())
            appendOptimisticMessage(sessionId, createMessage(`message-${index}`, index))
            unsubscribe()
        }

        expect(getMessageWindowState(sessionIds[0]).messages).toEqual([])
        expect(getMessageWindowState(sessionIds.at(-1)!).messages.map((message) => message.id)).toEqual([
            `message-${MAX_IDLE_MESSAGE_WINDOWS}`,
        ])
    })
})
