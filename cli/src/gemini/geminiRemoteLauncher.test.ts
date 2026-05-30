import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { GeminiMode, PermissionMode } from './types';
import type { AgentMessage, AgentSessionConfig, PermissionRequest, PermissionResponse, PromptContent } from '@/agent/types';

const harness = vi.hoisted(() => ({
    nowMs: 1_700_000_000_000,
    promptDurationMs: 0,
    promptShouldReject: false,
    promptCalls: [] as Array<{ sessionId: string; content: PromptContent[] }>,
    newSessionCalls: [] as AgentSessionConfig[],
    loadSessionCalls: [] as Array<AgentSessionConfig & { sessionId: string }>,
    disconnectCalls: 0,
    stderrHandler: null as ((error: Error) => void) | null,
    permissionHandler: null as ((request: PermissionRequest) => void) | null
}));

const createGeminiBackendMock = vi.hoisted(() => vi.fn());
const resolveGeminiRuntimeConfigMock = vi.hoisted(() => vi.fn());

vi.mock('@/codex/utils/buildHapiMcpBridge', () => ({
    buildHapiMcpBridge: async () => ({
        server: {
            stop: () => {}
        },
        mcpServers: {}
    })
}));

vi.mock('./utils/config', () => ({
    resolveGeminiRuntimeConfig: resolveGeminiRuntimeConfigMock
}));

vi.mock('./utils/geminiBackend', () => ({
    createGeminiBackend: createGeminiBackendMock
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn()
    }
}));

function createBackendStub() {
    return {
        onStderrError(handler: (error: Error) => void) {
            harness.stderrHandler = handler;
        },
        onPermissionRequest(handler: (request: PermissionRequest) => void) {
            harness.permissionHandler = handler;
        },
        initialize: vi.fn(async () => {}),
        newSession: vi.fn(async (config: AgentSessionConfig) => {
            harness.newSessionCalls.push(config);
            return 'gemini-session-1';
        }),
        loadSession: vi.fn(async (config: AgentSessionConfig & { sessionId: string }) => {
            harness.loadSessionCalls.push(config);
            return config.sessionId;
        }),
        prompt: vi.fn(async (sessionId: string, content: PromptContent[], onUpdate: (message: AgentMessage) => void) => {
            harness.promptCalls.push({ sessionId, content });
            harness.nowMs += harness.promptDurationMs;
            if (harness.promptShouldReject) {
                throw new Error('prompt exploded');
            }
            onUpdate({ type: 'turn_complete', stopReason: 'stop' });
        }),
        cancelPrompt: vi.fn(async () => {}),
        respondToPermission: vi.fn(async (_sessionId: string, _request: PermissionRequest, _response: PermissionResponse) => {}),
        disconnect: vi.fn(async () => {
            harness.disconnectCalls += 1;
        })
    };
}

function createMode(): GeminiMode {
    return {
        permissionMode: 'default' as PermissionMode,
        model: 'gemini-test-model'
    };
}

function createSessionStub(message: string | string[] = 'hello Gemini') {
    const messages = Array.isArray(message) ? message : [message];
    const queue = new MessageQueue2<GeminiMode>((mode) => JSON.stringify(mode));
    messages.forEach((msg, idx) => {
        const mode = createMode();
        if (messages.length > 1) {
            mode.model = `${mode.model}-${idx}`;
        }
        queue.push(msg, mode);
    });
    queue.close();

    const sessionEvents: Array<{ type: string; [key: string]: unknown }> = [];
    const agentMessages: unknown[] = [];
    const thinkingChanges: boolean[] = [];
    const foundSessionIds: string[] = [];
    const rpcHandlers = new Map<string, (params: unknown) => unknown>();

    const client = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => unknown) {
                rpcHandlers.set(method, handler);
            }
        },
        sendAgentMessage(message: unknown) {
            agentMessages.push(message);
        },
        sendUserMessage(_text: string) {},
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            sessionEvents.push(event);
        },
        updateAgentState: vi.fn()
    };

    const session = {
        path: '/tmp/hapi-gemini-test',
        logPath: '/tmp/hapi-gemini-test/test.log',
        client,
        queue,
        sessionId: null as string | null,
        thinking: false,
        getPermissionMode() {
            return 'default' as PermissionMode;
        },
        onThinkingChange(nextThinking: boolean) {
            session.thinking = nextThinking;
            thinkingChanges.push(nextThinking);
        },
        onSessionFound(id: string) {
            session.sessionId = id;
            foundSessionIds.push(id);
        },
        sendAgentMessage(message: unknown) {
            client.sendAgentMessage(message);
        },
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            client.sendSessionEvent(event);
        }
    };

    return {
        session,
        sessionEvents,
        agentMessages,
        thinkingChanges,
        foundSessionIds,
        rpcHandlers
    };
}

describe('geminiRemoteLauncher', () => {
    afterEach(() => {
        harness.nowMs = 1_700_000_000_000;
        harness.promptDurationMs = 0;
        harness.promptShouldReject = false;
        harness.promptCalls = [];
        harness.newSessionCalls = [];
        harness.loadSessionCalls = [];
        harness.disconnectCalls = 0;
        harness.stderrHandler = null;
        harness.permissionHandler = null;
        createGeminiBackendMock.mockReset();
        resolveGeminiRuntimeConfigMock.mockReset();
        vi.restoreAllMocks();
    });

    it('prepends TITLE_INSTRUCTION to the first prompt only', async () => {
        vi.spyOn(Date, 'now').mockImplementation(() => harness.nowMs);
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: 'gemini-test-model',
            token: undefined
        });
        createGeminiBackendMock.mockReturnValue(createBackendStub());
        const { session } = createSessionStub(['first message', 'second message']);
        const { geminiRemoteLauncher } = await import('./geminiRemoteLauncher');

        await geminiRemoteLauncher(session as never, {
            model: 'gemini-test-model',
            hookSettingsPath: '/tmp/gemini-hooks.json'
        });

        expect(harness.promptCalls).toHaveLength(2);

        const firstContent = harness.promptCalls[0].content[0];
        const secondContent = harness.promptCalls[1].content[0];
        if (firstContent.type !== 'text' || secondContent.type !== 'text') {
            throw new Error('expected text prompt content');
        }

        expect(firstContent.text).toContain('change_title');
        expect(firstContent.text).toContain('first message');
        expect(secondContent.text).not.toContain('change_title');
        expect(secondContent.text).toBe('second message');
    });

    it('emits a HAPI-only turn-duration event after a Gemini prompt settles', async () => {
        harness.promptDurationMs = 12_345;
        vi.spyOn(Date, 'now').mockImplementation(() => harness.nowMs);
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: 'gemini-test-model',
            token: undefined
        });
        createGeminiBackendMock.mockReturnValue(createBackendStub());
        const { session, sessionEvents, foundSessionIds } = createSessionStub();
        const { geminiRemoteLauncher } = await import('./geminiRemoteLauncher');

        const exitReason = await geminiRemoteLauncher(session as never, {
            model: 'gemini-test-model',
            hookSettingsPath: '/tmp/gemini-hooks.json'
        });

        expect(exitReason).toBe('exit');
        expect(foundSessionIds).toEqual(['gemini-session-1']);
        expect(sessionEvents).toContainEqual(expect.objectContaining({
            type: 'turn-duration',
            durationMs: 12_345
        }));
        expect(sessionEvents.at(-1)).toEqual({ type: 'ready' });
    });

    it('emits turn-duration even when a Gemini prompt fails', async () => {
        harness.promptDurationMs = 7_890;
        harness.promptShouldReject = true;
        vi.spyOn(Date, 'now').mockImplementation(() => harness.nowMs);
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: 'gemini-test-model',
            token: undefined
        });
        createGeminiBackendMock.mockReturnValue(createBackendStub());
        const { session, sessionEvents } = createSessionStub();
        const { geminiRemoteLauncher } = await import('./geminiRemoteLauncher');

        const exitReason = await geminiRemoteLauncher(session as never, {
            model: 'gemini-test-model',
            hookSettingsPath: '/tmp/gemini-hooks.json'
        });

        expect(exitReason).toBe('exit');
        expect(sessionEvents).toContainEqual(expect.objectContaining({
            type: 'turn-duration',
            durationMs: 7_890
        }));
        expect(sessionEvents.at(-1)).toEqual({ type: 'ready' });
    });

});
