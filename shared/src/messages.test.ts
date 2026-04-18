import { describe, expect, it } from 'bun:test'
import { getExecutionControl, isCodexDesktopMirrorSession } from './messages'

describe('isCodexDesktopMirrorSession', () => {
    it('returns true when metadata is marked as a desktop mirror', () => {
        expect(isCodexDesktopMirrorSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                mirrorSource: 'codex-desktop-sync'
            }
        })).toBe(true)
    })

    it('returns true when recent messages contain a passive desktop sync marker', () => {
        expect(isCodexDesktopMirrorSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost'
            },
            messages: [
                {
                    localId: 'codex:thread-1:12:abc123',
                    content: {
                        role: 'user',
                        content: { type: 'text', text: 'mirrored from desktop' }
                    }
                }
            ]
        })).toBe(true)
    })

    it('returns false for ordinary native HAPI messages', () => {
        expect(isCodexDesktopMirrorSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost'
            },
            messages: [
                {
                    localId: 'web-1',
                    content: {
                        role: 'user',
                        content: { type: 'text', text: 'native hapi send' },
                        meta: { sentFrom: 'webapp' }
                    }
                }
            ]
        })).toBe(false)
    })
})

it('reads persisted execution control from metadata', () => {
    expect(getExecutionControl({
        path: '/tmp/project',
        host: 'localhost',
        executionControl: {
            owner: 'hapi-runner',
            generation: 4,
            leaseExpiresAt: 500,
            runnerSessionId: 'session-runner',
            updatedAt: 400
        }
    })).toEqual({
        owner: 'hapi-runner',
        generation: 4,
        leaseExpiresAt: 500,
        runnerSessionId: 'session-runner',
        updatedAt: 400
    })
})
