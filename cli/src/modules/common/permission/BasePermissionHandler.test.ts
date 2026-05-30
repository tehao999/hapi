import { describe, expect, it } from 'vitest'
import { resolveToolAutoApprovalDecision } from './BasePermissionHandler'

describe('resolveToolAutoApprovalDecision', () => {
    it.each([
        ['default', 'mcp__hapi__send_attachment', 'approved'],
        ['default', 'functions.hapi__send_attachment', 'approved'],
        ['default', 'hapi__send_attachment', 'approved'],
        ['default', 'hapi_send_attachment', 'approved'],
        ['default', 'happy__send_attachment', 'approved'],
        ['read-only', 'mcp__hapi__send_attachment', 'approved'],
        ['safe-yolo', 'mcp__hapi__send_attachment', 'approved'],
        ['yolo', 'mcp__hapi__send_attachment', 'approved_for_session']
    ] as const)('auto-approves HAPI attachment tool %s/%s without queuing permission prompts', (mode, toolName, expected) => {
        expect(resolveToolAutoApprovalDecision(mode, toolName, 'call-1')).toBe(expected)
    })

    it('auto-approves HAPI attachment calls when the HAPI tool name is only present in the call id', () => {
        expect(resolveToolAutoApprovalDecision('default', 'tool-result', 'mcp__hapi__send_attachment-1')).toBe('approved')
    })

    it('does not auto-approve non-HAPI send_attachment tools in default mode', () => {
        expect(resolveToolAutoApprovalDecision('default', 'mcp__other__send_attachment', 'call-1')).toBeNull()
    })

    it('does not let non-HAPI send_attachment call ids bypass read-only write-tool filtering', () => {
        expect(resolveToolAutoApprovalDecision('read-only', 'write_file', 'mcp__other__send_attachment-1')).toBeNull()
    })
})
