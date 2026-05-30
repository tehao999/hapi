import { describe, expect, it } from 'bun:test'
import type { StoredMessage } from '../store'
import { MessageService } from './messageService'

function createStoredMessage(seq: number, content: unknown = { role: 'assistant', content: { type: 'text', text: `message ${seq}` } }): StoredMessage {
    return {
        id: `message-${seq}`,
        sessionId: 'session-1',
        content,
        createdAt: seq,
        seq,
        localId: null,
    }
}

describe('MessageService getMessagesPage', () => {
    it('uses a single limit-plus-one store read to compute hasMore and returns only the requested page', () => {
        const calls: Array<{ sessionId: string; limit: number; beforeSeq?: number; options?: { maxLimit?: number } }> = []
        const store = {
            messages: {
                getMessages(sessionId: string, limit: number, beforeSeq?: number, options?: { maxLimit?: number }) {
                    calls.push({ sessionId, limit, beforeSeq, options })
                    return [createStoredMessage(7), createStoredMessage(8), createStoredMessage(9)]
                },
            },
        }
        const service = new MessageService(store as never, {} as never, {} as never)

        const page = service.getMessagesPage('session-1', { limit: 2, beforeSeq: 10 })

        expect(calls).toEqual([{ sessionId: 'session-1', limit: 3, beforeSeq: 10, options: { maxLimit: 3 } }])
        expect(page.messages.map((message) => message.seq)).toEqual([8, 9])
        expect(page.page).toEqual({
            limit: 2,
            beforeSeq: 10,
            nextBeforeSeq: 8,
            hasMore: true,
        })
    })
})
