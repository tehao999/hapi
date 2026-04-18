import { describe, expect, it } from 'vitest'
import { buildNotificationOptions } from './pushNotification'

describe('buildNotificationOptions', () => {
    it('re-notifies when replacing an existing tagged notification', () => {
        const options = buildNotificationOptions({
            title: 'Ready for input',
            body: 'Agent is waiting',
            tag: 'ready-session-1',
            data: { type: 'ready', sessionId: 'session-1', url: '/sessions/session-1' }
        })

        expect(options.tag).toBe('ready-session-1')
        expect(options.renotify).toBe(true)
    })

    it('keeps renotify disabled for untagged notifications', () => {
        const options = buildNotificationOptions({
            title: 'One-off notification',
            body: 'No replacement semantics'
        })

        expect(options.tag).toBeUndefined()
        expect(options.renotify).toBe(false)
    })
})
