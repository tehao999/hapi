import { describe, expect, it } from 'bun:test'
import { DEFAULT_SOCKET_IO_MAX_HTTP_BUFFER_BYTES } from './server'

describe('socket server limits', () => {
    it('allows websocket frames large enough for 30MB inline agent attachments', () => {
        expect(DEFAULT_SOCKET_IO_MAX_HTTP_BUFFER_BYTES).toBeGreaterThanOrEqual(45 * 1024 * 1024)
    })
})
