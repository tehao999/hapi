import { AGENT_MESSAGE_PAYLOAD_TYPE } from '@hapi/protocol'
import { describe, expect, it } from 'vitest'
import { AgentMessageSchema, MessageContentSchema } from './types'

describe('AgentMessageSchema', () => {
    it('accepts legacy output agent messages', () => {
        expect(AgentMessageSchema.safeParse({
            role: 'agent',
            content: {
                type: 'output',
                data: { text: 'hello' }
            },
            meta: { sentFrom: 'cli' }
        }).success).toBe(true)
    })

    it('accepts Codex agent payload messages emitted by ApiSessionClient.sendAgentMessage', () => {
        expect(AgentMessageSchema.safeParse({
            role: 'agent',
            content: {
                type: AGENT_MESSAGE_PAYLOAD_TYPE,
                data: { type: 'thread.started' }
            },
            meta: { sentFrom: 'cli' }
        }).success).toBe(true)
    })

    it('keeps rejecting unknown agent payload types', () => {
        expect(AgentMessageSchema.safeParse({
            role: 'agent',
            content: {
                type: 'unknown',
                data: {}
            }
        }).success).toBe(false)
    })

    it('allows Codex agent payloads through MessageContentSchema', () => {
        expect(MessageContentSchema.safeParse({
            role: 'agent',
            content: {
                type: AGENT_MESSAGE_PAYLOAD_TYPE,
                data: { type: 'turn.done' }
            }
        }).success).toBe(true)
    })
})
