import { describe, expect, it } from 'bun:test'
import { sanitizeRequestLogPath } from './server'

describe('sanitizeRequestLogPath', () => {
    it('redacts sensitive query parameters in logged paths while preserving safe params', () => {
        expect(sanitizeRequestLogPath('/api/events?token=jwt123&visibility=visible&all=true'))
            .toBe('/api/events?token=[REDACTED]&visibility=visible&all=true')
        expect(sanitizeRequestLogPath('/api/auth?accessToken=secret&next=/sessions'))
            .toBe('/api/auth?accessToken=[REDACTED]&next=/sessions')
        expect(sanitizeRequestLogPath('/api/events?Token=jwt123&AUTHORIZATION=bearer'))
            .toBe('/api/events?Token=[REDACTED]&AUTHORIZATION=[REDACTED]')
        expect(sanitizeRequestLogPath('/api/events?auth=secret&x=a+b'))
            .toBe('/api/events?auth=[REDACTED]&x=a+b')
    })

    it('redacts repeated and encoded sensitive parameter names without collapsing query shape', () => {
        expect(sanitizeRequestLogPath('/api/events?token=a&token=b&x=1'))
            .toBe('/api/events?token=[REDACTED]&token=[REDACTED]&x=1')
        expect(sanitizeRequestLogPath('/api/events?%74%6f%6b%65%6e=jwt&x=1'))
            .toBe('/api/events?%74%6f%6b%65%6e=[REDACTED]&x=1')
        expect(sanitizeRequestLogPath('/api/events?token&x=1&&auth=secret'))
            .toBe('/api/events?token=[REDACTED]&x=1&&auth=[REDACTED]')
    })

    it('preserves paths without query strings and empty query strings', () => {
        expect(sanitizeRequestLogPath('/api/sessions/abc')).toBe('/api/sessions/abc')
        expect(sanitizeRequestLogPath('/assets/index-abc123.js')).toBe('/assets/index-abc123.js')
        expect(sanitizeRequestLogPath('/api/events?')).toBe('/api/events?')
    })
})
