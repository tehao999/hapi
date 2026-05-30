import { describe, expect, it } from 'vitest';
import { buildCodexAppServerArgs } from './codexAppServerClient';

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
