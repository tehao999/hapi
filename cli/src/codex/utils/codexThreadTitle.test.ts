import { describe, expect, it } from 'vitest';
import {
    applyCodexThreadTitleToMetadata,
    syncCodexThreadTitleToMetadata
} from './codexThreadTitle';
import type { Metadata } from '@/api/types';

describe('Codex thread title sync', () => {
    it('stores the desktop Codex thread title separately from changing HAPI summaries', () => {
        expect(applyCodexThreadTitleToMetadata({
            path: '/repo',
            host: 'mac',
            flavor: 'codex',
            codexSessionId: 'thread-1',
            summary: {
                text: 'Latest HAPI change_title summary',
                updatedAt: 1
            }
        }, 'Desktop Codex Title')).toEqual({
            path: '/repo',
            host: 'mac',
            flavor: 'codex',
            codexSessionId: 'thread-1',
            summary: {
                text: 'Latest HAPI change_title summary',
                updatedAt: 1
            },
            title: 'Desktop Codex Title'
        });
    });

    it('does not update metadata for blank Codex titles', async () => {
        const updates: unknown[] = [];
        const didSync = await syncCodexThreadTitleToMetadata({
            updateMetadata(handler: (metadata: Metadata) => Metadata) {
                updates.push(handler({ path: '/repo', host: 'mac' }));
            }
        }, 'thread-1', {
            readTitle: () => '   '
        });

        expect(didSync).toBe(false);
        expect(updates).toEqual([]);
    });

    it('pushes a readable Codex DB title through the HAPI session metadata channel', async () => {
        const updates: unknown[] = [];
        const didSync = await syncCodexThreadTitleToMetadata({
            updateMetadata(handler: (metadata: Metadata) => Metadata) {
                updates.push(handler({
                    path: '/repo',
                    host: 'mac',
                    flavor: 'codex',
                    codexSessionId: 'thread-1',
                    summary: {
                        text: 'HAPI title',
                        updatedAt: 1
                    }
                }));
            }
        }, 'thread-1', {
            readTitle: () => ' Desktop Codex Title '
        });

        expect(didSync).toBe(true);
        expect(updates).toEqual([{
            path: '/repo',
            host: 'mac',
            flavor: 'codex',
            codexSessionId: 'thread-1',
            summary: {
                text: 'HAPI title',
                updatedAt: 1
            },
            title: 'Desktop Codex Title'
        }]);
    });
});
