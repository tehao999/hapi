import { isObject } from './utils'
import type { ExecutionControl } from './schemas'

type RoleWrappedRecord = {
    role: string
    content: unknown
    meta?: unknown
}

const VISIBLE_CLAUDE_SYSTEM_SUBTYPES = new Set([
    'api_error',
    'turn_duration',
    'microcompact_boundary',
    'compact_boundary'
])

export const CODEX_DESKTOP_SYNC_SOURCE = 'codex-desktop-sync'
export const CODEX_DESKTOP_SYNC_LOCAL_ID_PREFIX = 'codex:'

export function isRoleWrappedRecord(value: unknown): value is RoleWrappedRecord {
    if (!isObject(value)) return false
    return typeof value.role === 'string' && 'content' in value
}

export function unwrapRoleWrappedRecordEnvelope(value: unknown): RoleWrappedRecord | null {
    if (isRoleWrappedRecord(value)) return value
    if (!isObject(value)) return null

    const direct = value.message
    if (isRoleWrappedRecord(direct)) return direct

    const data = value.data
    if (isObject(data) && isRoleWrappedRecord(data.message)) return data.message as RoleWrappedRecord

    const payload = value.payload
    if (isObject(payload) && isRoleWrappedRecord(payload.message)) return payload.message as RoleWrappedRecord

    return null
}

export function isClaudeChatVisibleSystemSubtype(subtype: unknown): subtype is string {
    return typeof subtype === 'string' && VISIBLE_CLAUDE_SYSTEM_SUBTYPES.has(subtype)
}

export function isClaudeChatVisibleMessage(message: { type: unknown; subtype?: unknown }): boolean {
    if (message.type === 'rate_limit_event') {
        return false
    }

    if (message.type !== 'system') {
        return true
    }

    return isClaudeChatVisibleSystemSubtype(message.subtype)
}

export function isCodexDesktopSyncMessageEnvelope(message: {
    localId?: string | null
    content: unknown
}): boolean {
    if (typeof message.localId === 'string' && message.localId.startsWith(CODEX_DESKTOP_SYNC_LOCAL_ID_PREFIX)) {
        return true
    }

    const record = unwrapRoleWrappedRecordEnvelope(message.content)
    if (!record) {
        return false
    }

    const meta = isObject(record.meta) ? record.meta : null
    return meta?.sentFrom === CODEX_DESKTOP_SYNC_SOURCE
}

export function isCodexDesktopMirrorSession(args: {
    metadata?: unknown | null
    messages?: Array<{
        localId?: string | null
        content: unknown
    }> | null
}): boolean {
    if (isObject(args.metadata) && args.metadata.mirrorSource === CODEX_DESKTOP_SYNC_SOURCE) {
        return true
    }

    for (const message of args.messages ?? []) {
        if (isCodexDesktopSyncMessageEnvelope(message)) {
            return true
        }
    }

    return false
}

export function getExecutionControl(metadata: unknown | null | undefined): ExecutionControl | null {
    if (!isObject(metadata) || !isObject(metadata.executionControl)) {
        return null
    }

    const control = metadata.executionControl as Record<string, unknown>
    if ((control.owner !== 'desktop-sync' && control.owner !== 'hapi-runner') || typeof control.generation !== 'number') {
        return null
    }

    return {
        owner: control.owner,
        generation: control.generation,
        leaseExpiresAt: typeof control.leaseExpiresAt === 'number' ? control.leaseExpiresAt : null,
        runnerSessionId: typeof control.runnerSessionId === 'string' ? control.runnerSessionId : null,
        updatedAt: typeof control.updatedAt === 'number' ? control.updatedAt : 0
    }
}

export type { RoleWrappedRecord }
