import { describe, expect, it } from 'vitest';
import { ApiMachineClient } from './apiMachine';
import type { Machine } from './types';
import type { SpawnSessionOptions } from '../modules/common/rpcTypes';

function createMachine(): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            host: 'localhost',
            platform: 'darwin',
            happyCliVersion: '0.0.0',
            homeDir: '/Users/test',
            happyHomeDir: '/Users/test/.hapi',
            happyLibDir: '/app/hapi'
        },
        metadataVersion: 1,
        runnerState: null,
        runnerStateVersion: 0
    };
}

describe('ApiMachineClient service tier RPC', () => {
    it('passes serviceTier from spawn-happy-session RPC into spawnSession options', async () => {
        const client = new ApiMachineClient('token', createMachine());
        let capturedOptions: SpawnSessionOptions | undefined;
        client.setRPCHandlers({
            spawnSession: async (options) => {
                capturedOptions = options;
                return { type: 'success', sessionId: 'session-1' };
            },
            stopSession: () => true,
            requestShutdown: () => {}
        });

        const response = await (client as any).rpcHandlerManager.handleRequest({
            method: 'machine-1:spawn-happy-session',
            params: JSON.stringify({
                directory: '/tmp/project',
                agent: 'codex',
                serviceTier: 'fast'
            })
        });

        expect(JSON.parse(response)).toEqual({ type: 'success', sessionId: 'session-1' });
        expect(capturedOptions?.serviceTier).toBe('fast');
    });
});
