import { z } from 'zod'
import {
    MAX_AGENT_ATTACHMENT_FILES,
    type AgentAttachmentFileInput
} from './agentAttachment'

export const HAPI_MCP_TOOL_NAMES = ['change_title', 'send_attachment'] as const

export const changeTitleInputSchema = z.object({
    title: z.string().describe('The new title for the chat session')
})

export const sendAttachmentFileInputSchema = z.object({
    path: z.string().min(1).describe('Path to a generated file inside the current session working directory'),
    filename: z.string().min(1).max(255).optional().describe('Optional display filename'),
    mimeType: z.string().min(1).max(255).optional().describe('Optional MIME type override')
})

export const sendAttachmentInputSchema = z.object({
    files: z.array(sendAttachmentFileInputSchema)
        .min(1)
        .max(MAX_AGENT_ATTACHMENT_FILES)
        .describe('Generated files to send to the user as chat attachments')
})

export type SendAttachmentInput = {
    files: AgentAttachmentFileInput[]
}
