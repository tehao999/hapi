import { describe, expect, it, vi } from 'vitest';
import { buildCodexAppServerArgs, CodexAppServerClient } from './codexAppServerClient';

describe('buildCodexAppServerArgs', () => {
    it('uses the standard app-server command by default', () => {
        expect(buildCodexAppServerArgs({})).toEqual(['app-server']);
    });

    it('passes HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT as a Codex app-server config override', () => {
        expect(buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: '24000'
        })).toEqual([
            'app-server',
            '-c',
            'model_auto_compact_token_limit=24000'
        ]);
    });

    it('accepts whitespace-padded auto-compaction token limits', () => {
        expect(buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: ' 24000'
        })).toEqual([
            'app-server',
            '-c',
            'model_auto_compact_token_limit=24000'
        ]);
        expect(buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: '24000 '
        })).toEqual([
            'app-server',
            '-c',
            'model_auto_compact_token_limit=24000'
        ]);
    });

    it('treats blank auto-compaction token limits as unset', () => {
        expect(buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: ''
        })).toEqual(['app-server']);
        expect(buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: ' '
        })).toEqual(['app-server']);
    });

    it('rejects invalid auto-compaction token limits', () => {
        expect(() => buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: '24_000'
        })).toThrow('HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT must be a positive integer');
        expect(() => buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: '0'
        })).toThrow('HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT must be a positive integer');
        expect(() => buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: '-1'
        })).toThrow('HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT must be a positive integer');
        expect(() => buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: '1.5'
        })).toThrow('HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT must be a positive integer');
        expect(() => buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: '1e6'
        })).toThrow('HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT must be a positive integer');
        expect(() => buildCodexAppServerArgs({
            HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT: '9007199254740992'
        })).toThrow('HAPI_CODEX_AUTO_COMPACT_TOKEN_LIMIT must be a positive integer');
    });
});


describe('CodexAppServerClient', () => {
    it('sends turn/steer with expectedTurnId to live-append into an active turn', async () => {
        const client = new CodexAppServerClient();
        const sendRequest = vi.spyOn(client as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> }, 'sendRequest')
            .mockResolvedValue({ turnId: 'turn-123' });
        const params = {
            threadId: 'thread-123',
            expectedTurnId: 'turn-123',
            input: [{ type: 'text' as const, text: 'use the failing tests first' }]
        };

        const result = await (client as unknown as { steerTurn: (next: typeof params) => Promise<unknown> }).steerTurn(params);

        expect(result).toEqual({ turnId: 'turn-123' });
        expect(sendRequest).toHaveBeenCalledWith('turn/steer', params, {
            signal: undefined,
            timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS
        });
    });
});
