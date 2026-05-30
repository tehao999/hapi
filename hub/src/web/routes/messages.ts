import { Hono } from 'hono'
import { getExecutionControl, isCodexDesktopMirrorSession } from '@hapi/protocol'
import { AttachmentMetadataSchema } from '@hapi/protocol/schemas'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    beforeSeq: z.coerce.number().int().min(1).optional(),
    markRead: z.enum(['true', '1']).optional()
})

const recentUserMessagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(10).optional()
})

const sendMessageBodySchema = z.object({
    text: z.string(),
    localId: z.string().min(1).optional(),
    attachments: z.array(AttachmentMetadataSchema).optional()
})

function sessionStartStatus(code: string): 403 | 404 | 409 | 503 | 500 {
    if (code === 'access_denied') return 403
    if (code === 'session_not_found') return 404
    if (code === 'no_machine_online') return 503
    if (code === 'takeover_busy' || code === 'resume_unavailable') return 409
    return 500
}

export function createMessagesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/sessions/:id/recent-user-messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const parsed = recentUserMessagesQuerySchema.safeParse(c.req.query())
        const limit = parsed.success ? (parsed.data.limit ?? 10) : 10
        return c.json({
            messages: engine.getRecentUserMessages(sessionResult.sessionId, { limit })
        })
    })

    app.get('/sessions/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }
        const sessionId = sessionResult.sessionId

        const parsed = querySchema.safeParse(c.req.query())
        const limit = parsed.success ? (parsed.data.limit ?? 50) : 50
        const beforeSeq = parsed.success ? (parsed.data.beforeSeq ?? null) : null
        const page = engine.getMessagesPage(sessionId, { limit, beforeSeq })
        if (beforeSeq === null && parsed.success && parsed.data.markRead) {
            engine.markSessionRead(sessionId, c.get('namespace'))
        }
        return c.json(page)
    })

    app.post('/sessions/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const body = await c.req.json().catch(() => null)
        const parsed = sendMessageBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        // Require text or attachments
        if (!parsed.data.text && (!parsed.data.attachments || parsed.data.attachments.length === 0)) {
            return c.json({ error: 'Message requires text or attachments' }, 400)
        }

        const sessionId = sessionResult.sessionId
        let targetSessionId = sessionId
        const recentMessages = engine.getMessagesPage(sessionId, { limit: 50, beforeSeq: null }).messages
        const control = getExecutionControl(sessionResult.session.metadata)
        const isDesktopMirror = isCodexDesktopMirrorSession({
            metadata: sessionResult.session.metadata,
            messages: recentMessages
        })

        if (isDesktopMirror && control?.owner !== 'hapi-runner') {
            const takeover = await engine.takeoverSession(sessionId, c.get('namespace'))
            if (takeover.type === 'error') {
                return c.json({
                    error: takeover.message,
                    code: takeover.code
                }, sessionStartStatus(takeover.code))
            }
            targetSessionId = takeover.sessionId
        } else if (!sessionResult.session.active) {
            const resume = await engine.resumeSession(sessionId, c.get('namespace'))
            if (resume.type === 'error') {
                return c.json({
                    error: resume.message,
                    code: resume.code
                }, sessionStartStatus(resume.code))
            }
            targetSessionId = resume.sessionId
        }

        await engine.sendMessage(targetSessionId, {
            text: parsed.data.text,
            localId: parsed.data.localId,
            attachments: parsed.data.attachments,
            sentFrom: 'webapp'
        })
        return c.json({ ok: true })
    })

    return app
}
