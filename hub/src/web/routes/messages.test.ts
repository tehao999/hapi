import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMessagesRoutes } from './messages'

function createSession(overrides?: Partial<Session>): Session {
    const baseMetadata = {
        path: '/tmp/project',
        host: 'localhost',
        flavor: 'codex' as const
    }
    const base: Session = {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: baseMetadata,
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 1,
        model: 'gpt-5.4',
        modelReasoningEffort: null,
        effort: null,
        permissionMode: 'default',
        collaborationMode: 'default'
    }

    return {
        ...base,
        ...overrides,
        metadata: overrides?.metadata === undefined
            ? base.metadata
            : overrides.metadata === null
                ? null
                : {
                    ...baseMetadata,
                    ...overrides.metadata
                }
    }
}

function createApp(args?: {
    session?: Session
    accessResult?: { ok: true; sessionId: string; session: Session } | { ok: false; reason: 'not-found' | 'access-denied' }
    recentMessages?: Array<{ id: string; seq: number; createdAt: number; localId?: string | null; content: unknown }>
    recentUserMessages?: Array<{ id: string; seq: number; createdAt: number; text: string }>
}) {
    const session = args?.session ?? createSession()
    const accessResult = args?.accessResult ?? { ok: true as const, sessionId: session.id, session }
    const recentMessages = args?.recentMessages ?? []
    const sendMessageCalls: Array<[string, Record<string, unknown>]> = []
    const readCalls: Array<[string, string]> = []
    const recentUserCalls: Array<[string, { limit: number }]> = []

    const engine = {
        resolveSessionAccess: () => accessResult,
        getMessagesPage: () => ({
            messages: recentMessages,
            page: {
                limit: 50,
                beforeSeq: null,
                nextBeforeSeq: null,
                hasMore: false
            }
        }),
        markSessionRead: (sessionId: string, namespace: string) => {
            readCalls.push([sessionId, namespace])
        },
        getRecentUserMessages: (sessionId: string, options: { limit: number }) => {
            recentUserCalls.push([sessionId, options])
            return args?.recentUserMessages ?? []
        },
        sendMessage: async (sessionId: string, payload: Record<string, unknown>) => {
            sendMessageCalls.push([sessionId, payload])
        }
    } as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createMessagesRoutes(() => engine as SyncEngine))

    return { app, sendMessageCalls, readCalls, recentUserCalls }
}

describe('messages routes', () => {
    it('returns recent user messages without marking the session read', async () => {
        const { app, readCalls, recentUserCalls } = createApp({
            recentUserMessages: [
                { id: 'message-2', seq: 2, createdAt: 20, text: 'second prompt' },
                { id: 'message-1', seq: 1, createdAt: 10, text: 'first prompt' }
            ]
        })

        const response = await app.request('/api/sessions/session-1/recent-user-messages?limit=10')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            messages: [
                { id: 'message-2', seq: 2, createdAt: 20, text: 'second prompt' },
                { id: 'message-1', seq: 1, createdAt: 10, text: 'first prompt' }
            ]
        })
        expect(recentUserCalls).toEqual([['session-1', { limit: 10 }]])
        expect(readCalls).toEqual([])
    })

    it('rejects recent user messages when session access is denied', async () => {
        const { app, recentUserCalls } = createApp({
            accessResult: { ok: false, reason: 'access-denied' }
        })

        const response = await app.request('/api/sessions/session-1/recent-user-messages?limit=10')

        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'Session access denied' })
        expect(recentUserCalls).toEqual([])
    })

    it('returns not found for recent user messages when the session does not exist', async () => {
        const { app, recentUserCalls } = createApp({
            accessResult: { ok: false, reason: 'not-found' }
        })

        const response = await app.request('/api/sessions/missing/recent-user-messages?limit=10')

        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: 'Session not found' })
        expect(recentUserCalls).toEqual([])
    })

    it('does not mark latest messages read unless requested', async () => {
        const { app, readCalls } = createApp()

        const response = await app.request('/api/sessions/session-1/messages?limit=50')

        expect(response.status).toBe(200)
        expect(readCalls).toEqual([])
    })

    it('marks latest messages read when requested by an active viewer', async () => {
        const { app, readCalls } = createApp()

        const response = await app.request('/api/sessions/session-1/messages?limit=50&markRead=true')

        expect(response.status).toBe(200)
        expect(readCalls).toEqual([['session-1', 'default']])
    })

    it('requires takeover before sends enter a desktop-owned mirror session', async () => {
        const { app, sendMessageCalls } = createApp({
            session: createSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    flavor: 'codex',
                    mirrorSource: 'codex-desktop-sync',
                    executionControl: {
                        owner: 'desktop-sync',
                        generation: 1,
                        leaseExpiresAt: null,
                        runnerSessionId: null,
                        updatedAt: 1
                    }
                }
            })
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'hello from hapi' })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Desktop-synced sessions must be taken over before sending from HAPI.',
            code: 'desktop_takeover_required'
        })
        expect(sendMessageCalls).toEqual([])
    })

    it('allows sends for mirror sessions after takeover gives ownership to hapi-runner', async () => {
        const { app, sendMessageCalls } = createApp({
            session: createSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    flavor: 'codex',
                    mirrorSource: 'codex-desktop-sync',
                    executionControl: {
                        owner: 'hapi-runner',
                        generation: 2,
                        leaseExpiresAt: 60_000,
                        runnerSessionId: 'session-1',
                        updatedAt: 2
                    }
                }
            })
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'hello from hapi' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(sendMessageCalls).toEqual([
            ['session-1', {
                text: 'hello from hapi',
                localId: undefined,
                attachments: undefined,
                sentFrom: 'webapp'
            }]
        ])
    })

    it('rejects sends for sessions whose recent messages were mirrored from Codex desktop', async () => {
        const { app, sendMessageCalls } = createApp({
            recentMessages: [
                {
                    id: 'message-1',
                    seq: 10,
                    createdAt: 10,
                    localId: 'codex:thread-1:12:abc123',
                    content: {
                        role: 'agent',
                        content: {
                            type: 'codex',
                            data: {
                                type: 'tool-call',
                                name: 'exec_command',
                                input: { cmd: 'pwd' }
                            }
                        },
                        meta: {
                            sentFrom: 'codex-desktop-sync'
                        }
                    }
                }
            ]
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'hello from hapi' })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Desktop-synced sessions must be taken over before sending from HAPI.',
            code: 'desktop_takeover_required'
        })
        expect(sendMessageCalls).toEqual([])
    })
})
