import { describe, expect, it } from 'bun:test'
import { registerSessionHandlers } from './sessionHandlers'
import type { CliSocketWithData } from '../../socketTypes'
import type { StoredSession } from '../../../store'

type RoomEmit = {
    room: string
    event: string
    data: unknown
}

type WebappEvent = {
    type: string
    sessionId?: string
    message?: {
        content: unknown
    }
}

class FakeSocket {
    readonly id = 'socket-1'
    readonly data: Record<string, unknown> = { namespace: 'default' }
    readonly roomEmits: RoomEmit[] = []
    private readonly handlers = new Map<string, (...args: unknown[]) => void>()

    on(event: string, handler: (...args: unknown[]) => void): this {
        this.handlers.set(event, handler)
        return this
    }

    emit(): boolean {
        return true
    }

    to(room: string): { emit: (event: string, data: unknown) => boolean } {
        return {
            emit: (event: string, data: unknown) => {
                this.roomEmits.push({ room, event, data })
                return true
            }
        }
    }

    trigger(event: string, data?: unknown): void {
        const handler = this.handlers.get(event)
        if (!handler) return
        if (typeof data === 'undefined') {
            handler()
            return
        }
        handler(data)
    }
}

function createHarness() {
    const socket = new FakeSocket()
    const storedMessages: Array<{ sid: string; content: unknown; localId?: string }> = []
    const webappEvents: WebappEvent[] = []
    const metadataUpdates: Array<{
        sid: string
        metadata: unknown
        expectedVersion: number
        namespace: string
        options?: { touchUpdatedAt?: boolean }
    }> = []
    let seq = 0
    const session = {
        namespace: 'default',
        metadataVersion: 3,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex'
        },
        teamState: null
    }
    const store = {
        messages: {
            addMessage(sid: string, content: unknown, localId?: string) {
                seq += 1
                storedMessages.push({ sid, content, localId })
                return {
                    id: `message-${seq}`,
                    seq,
                    createdAt: 1_710_000_000_000 + seq,
                    localId: localId ?? null,
                    content
                }
            }
        },
        sessions: {
            getSession() {
                return session
            },
            updateSessionMetadata(
                sid: string,
                metadata: unknown,
                expectedVersion: number,
                namespace: string,
                options?: { touchUpdatedAt?: boolean }
            ) {
                metadataUpdates.push({ sid, metadata, expectedVersion, namespace, options })
                session.metadata = metadata as typeof session.metadata
                session.metadataVersion += 1
                return {
                    result: 'success',
                    version: session.metadataVersion,
                    value: metadata
                }
            },
            setSessionTodos() {
                return null
            },
            setSessionTeamState() {
                return null
            }
        }
    }

    registerSessionHandlers(socket as unknown as CliSocketWithData, {
        store: store as never,
        resolveSessionAccess: () => ({ ok: true, value: session as StoredSession }),
        emitAccessError: () => {
            throw new Error('Unexpected access error')
        },
        onWebappEvent: (event) => {
            webappEvents.push(event as WebappEvent)
        }
    })

    return { socket, storedMessages, webappEvents, metadataUpdates }
}

describe('cli session handlers', () => {
    it('broadcasts normal remote-control messages to other CLI sockets', () => {
        const { socket, storedMessages, webappEvents } = createHarness()

        socket.trigger('message', {
            sid: 'session-1',
            localId: 'web-1',
            message: {
                role: 'user',
                content: { type: 'text', text: 'run this remotely' }
            }
        })

        expect(storedMessages).toHaveLength(1)
        expect(socket.roomEmits).toHaveLength(1)
        expect(socket.roomEmits[0]?.room).toBe('session:session-1')
        expect(socket.roomEmits[0]?.event).toBe('update')
        expect(webappEvents).toHaveLength(1)
        expect(webappEvents[0]?.type).toBe('message-received')
    })

    it('stores passive sync messages for web without broadcasting them to CLI executors', () => {
        const { socket, storedMessages, webappEvents, metadataUpdates } = createHarness()

        socket.trigger('sync-message', {
            sid: 'session-1',
            localId: 'codex:thread-1:12:abc123',
            message: {
                role: 'user',
                content: { type: 'text', text: 'message typed in Codex desktop' }
            }
        })

        expect(storedMessages).toHaveLength(1)
        expect(storedMessages[0]?.content).toEqual({
            role: 'user',
            content: { type: 'text', text: 'message typed in Codex desktop' },
            meta: { sentFrom: 'codex-desktop-sync' }
        })
        expect(socket.roomEmits).toHaveLength(1)
        expect(socket.roomEmits[0]?.room).toBe('session:session-1')
        expect(socket.roomEmits[0]?.event).toBe('update')
        expect(webappEvents).toHaveLength(2)
        expect(webappEvents[0]?.type).toBe('session-updated')
        expect(webappEvents[0]?.sessionId).toBe('session-1')
        expect(webappEvents[1]?.type).toBe('message-received')
        expect(webappEvents[1]?.sessionId).toBe('session-1')
        expect(metadataUpdates).toEqual([
            {
                sid: 'session-1',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    flavor: 'codex',
                    mirrorSource: 'codex-desktop-sync'
                },
                expectedVersion: 3,
                namespace: 'default',
                options: { touchUpdatedAt: false }
            }
        ])
    })
})
