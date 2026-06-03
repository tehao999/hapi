import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    applyHapiSessionEnvironment,
    buildHapiSessionEnvironment,
    prependPathEntry,
} from './sessionEnvironment';

describe('HAPI session environment', () => {
    it('prepends ~/.local/bin once so agent Bash can find local tools like handoff', () => {
        expect(prependPathEntry('/usr/bin:/bin', '/Users/tehao/.local/bin')).toBe(
            '/Users/tehao/.local/bin:/usr/bin:/bin'
        );

        expect(prependPathEntry('/usr/bin:/Users/tehao/.local/bin:/bin', '/Users/tehao/.local/bin')).toBe(
            '/usr/bin:/Users/tehao/.local/bin:/bin'
        );
    });

    it('exports the HAPI session id and deterministic handoff caller tag', () => {
        const env = buildHapiSessionEnvironment('session-123', {
            HOME: '/Users/tehao',
            PATH: '/usr/bin:/bin',
            CODEX_HANDOFF_CALLER_TAG: 'stale-parent-tag',
        });

        expect(env).toEqual({
            HAPI_SESSION_ID: 'session-123',
            CODEX_HANDOFF_CALLER_TAG: 'session-123',
            PATH: '/Users/tehao/.local/bin:/usr/bin:/bin',
        });
    });

    it('mutates a provided env object for spawned agent processes', () => {
        const env: NodeJS.ProcessEnv = {
            HOME: '/Users/tehao',
            PATH: '/usr/bin:/bin',
        };

        applyHapiSessionEnvironment('session-abc', env);

        expect(env.HAPI_SESSION_ID).toBe('session-abc');
        expect(env.CODEX_HANDOFF_CALLER_TAG).toBe('session-abc');
        expect(env.PATH).toBe('/Users/tehao/.local/bin:/usr/bin:/bin');
    });

    it('is applied by every direct bootstrapSession runner entrypoint', () => {
        const repoRoot = join(__dirname, '..');
        const entrypoints = [
            'claude/runClaude.ts',
            'codex/runCodex.ts',
            'gemini/runGemini.ts',
            'cursor/runCursor.ts',
            'opencode/runOpencode.ts',
            'agent/runners/runAgentSession.ts',
        ];

        for (const relativePath of entrypoints) {
            const content = readFileSync(join(repoRoot, relativePath), 'utf8');
            expect(content, relativePath).toContain('bootstrapSession');
            expect(content, relativePath).toContain('applyHapiSessionEnvironment(sessionInfo.id)');
        }
    });
});
