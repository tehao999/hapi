import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClaudeSession = vi.hoisted(() => {
    const state: {
        permissionMode?: string | null;
        model?: string | null;
        effort?: string | null;
    } = {};

    return {
        state,
        reset() {
            state.permissionMode = undefined;
            state.model = undefined;
            state.effort = undefined;
        },
        getPermissionMode: vi.fn(() => state.permissionMode),
        setPermissionMode: vi.fn((value: string | null) => { state.permissionMode = value; }),
        getModel: vi.fn(() => state.model),
        setModel: vi.fn((value: string | null) => { state.model = value; }),
        getEffort: vi.fn(() => state.effort),
        setEffort: vi.fn((value: string | null) => { state.effort = value; }),
        stopKeepAlive: vi.fn()
    };
});

const harness = vi.hoisted(() => ({
    loopArgs: [] as Array<Record<string, unknown>>,
    session: {
        onUserMessage: vi.fn(),
        updateMetadata: vi.fn(),
        rpcHandlerManager: {
            registerHandler: vi.fn()
        }
    }
}));

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: vi.fn(async () => ({
        api: {},
        session: harness.session,
        sessionInfo: { id: 'session-1' }
    }))
}));

vi.mock('@/claude/loop', () => ({
    loop: vi.fn(async (options: Record<string, unknown>) => {
        harness.loopArgs.push(options);
        const onSessionReady = options.onSessionReady as ((session: unknown) => void) | undefined;
        onSessionReady?.(mockClaudeSession);
    })
}));

vi.mock('@/claude/sdk/metadataExtractor', () => ({
    extractSDKMetadataAsync: vi.fn()
}));

vi.mock('@/claude/utils/startHappyServer', () => ({
    startHappyServer: vi.fn(async () => ({ url: 'http://127.0.0.1:1', toolNames: [], stop: vi.fn() }))
}));

vi.mock('@/claude/utils/startHookServer', () => ({
    startHookServer: vi.fn(async () => ({ port: 1, token: 'token', stop: vi.fn() }))
}));

vi.mock('@/modules/common/hooks/generateHookSettings', () => ({
    generateHookSettingsFile: vi.fn(() => '/tmp/hapi-hook-settings.json'),
    cleanupHookSettingsFile: vi.fn()
}));

vi.mock('./registerKillSessionHandler', () => ({
    registerKillSessionHandler: vi.fn()
}));

vi.mock('@/agent/runnerLifecycle', () => ({
    createModeChangeHandler: vi.fn(() => vi.fn()),
    createRunnerLifecycle: vi.fn(() => ({
        registerProcessHandlers: vi.fn(),
        cleanup: vi.fn(async () => {}),
        cleanupAndExit: vi.fn(async () => {}),
        markCrash: vi.fn(),
        setExitCode: vi.fn(),
        setArchiveReason: vi.fn()
    })),
    setControlledByUser: vi.fn()
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
        infoDeveloper: vi.fn(),
        logFilePath: '/tmp/hapi.log'
    }
}));

vi.mock('@/ui/doctor', () => ({
    getEnvironmentInfo: vi.fn(() => ({}))
}));

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: vi.fn((text: string) => text)
}));

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: vi.fn(() => '/tmp/project')
}));

import { runClaude } from './runClaude';

describe('runClaude special command queueing', () => {
    beforeEach(() => {
        harness.loopArgs.length = 0;
        harness.session.onUserMessage.mockReset();
        harness.session.updateMetadata.mockReset();
        harness.session.rpcHandlerManager.registerHandler.mockReset();
        mockClaudeSession.reset();
    });

    it('isolates /goal user messages so Claude native slash handling sees the command at the start', async () => {
        await runClaude({});

        const userMessageHandler = harness.session.onUserMessage.mock.calls[0]?.[0] as (message: unknown) => void;
        userMessageHandler({
            content: {
                text: 'hello'
            },
            meta: {}
        });
        userMessageHandler({
            content: {
                text: '  /goal keep going until verified  ',
                attachments: [{ name: 'ignored.txt' }]
            },
            meta: {}
        });

        const queue = harness.loopArgs[0]?.messageQueue as { queue: Array<{ message: string; isolate?: boolean }> };
        expect(queue.queue).toHaveLength(1);
        expect(queue.queue[0]).toMatchObject({
            message: '/goal keep going until verified',
            isolate: true
        });
    });
});
