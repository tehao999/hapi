import { describe, expect, it } from 'vitest'
import { sanitizeProcessCommand } from './doctor'

describe('sanitizeProcessCommand', () => {
    it('redacts runner-spawned payloads from process command lines', () => {
        const command = 'bun src/index.ts codex --started-by runner {"message":"private user text","reply":"private assistant text"}'

        const sanitized = sanitizeProcessCommand(command)

        expect(sanitized).toContain('--started-by runner')
        expect(sanitized).toContain('<redacted>')
        expect(sanitized).not.toContain('private user text')
        expect(sanitized).not.toContain('private assistant text')
    })

    it('truncates long commands by default', () => {
        const command = `hapi codex --model ${'x'.repeat(400)}`

        const sanitized = sanitizeProcessCommand(command, { maxLength: 80 })

        expect(sanitized.length).toBeLessThanOrEqual(130)
        expect(sanitized).toContain('[truncated; use --full-args]')
    })

    it('redacts direct positional prompts instead of printing arbitrary argv tails', () => {
        const command = 'hapi codex secret user request'

        const sanitized = sanitizeProcessCommand(command)

        expect(sanitized).toContain('hapi codex')
        expect(sanitized).toContain('<arg>')
        expect(sanitized).not.toContain('secret')
        expect(sanitized).not.toContain('user request')
    })

    it('redacts multi-word and equals-form sensitive flag values', () => {
        const command = 'hapi codex --prompt secret words here --message=another-secret --model gpt-5.5'

        const sanitized = sanitizeProcessCommand(command)

        expect(sanitized).toContain('--prompt <redacted>')
        expect(sanitized).toContain('--message=<redacted>')
        expect(sanitized).toContain('--model gpt-5.5')
        expect(sanitized).not.toContain('secret words')
        expect(sanitized).not.toContain('another-secret')
    })
})
