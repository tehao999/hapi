import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('MessageStore getMessages', () => {
    it('allows a one-row internal lookahead above the external 200-message page limit', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('lookahead-session', {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex',
        }, null, 'default')

        for (let index = 0; index < 201; index += 1) {
            store.messages.addMessage(session.id, { role: 'assistant', text: `message ${index}` })
        }

        expect(store.messages.getMessages(session.id, 201)).toHaveLength(200)
        expect(store.messages.getMessages(session.id, 201, undefined, { maxLimit: 201 })).toHaveLength(201)
    })
})
