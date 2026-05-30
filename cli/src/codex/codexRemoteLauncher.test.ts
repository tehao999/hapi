import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { EnhancedMode } from './loop';

const harness = vi.hoisted(() => ({
    notifications: [] as Array<{ method: string; params: unknown }>,
    registerRequestCalls: [] as string[],
    initializeCalls: [] as unknown[],
    startTurnCalls: [] as unknown[],
    interruptCalls: [] as unknown[],
    compactCalls: [] as unknown[],
    compactError: null as Error | null,
    deferCompactCompletion: false,
    deferCompactFailure: false,
    emitDeferredCompactCompletion: null as null | (() => void),
    emitDeferredCompactFailure: null as null | (() => void),
    turnCompletion: { status: 'Completed' } as { status: string; message?: string },
    turnScripts: [] as Array<{
        startedTurnId?: string;
        responseTurnId?: string;
        completionTurnId?: string;
        extraStartedTurnIdBeforeCompletion?: string;
        advanceBeforeCompletionMs?: number;
    }>,
    titleSyncCalls: [] as string[],
    nowMs: 1_700_000_000_000,
    advanceBeforeTurnCompleteMs: 0,
    emitContextCompactionBeforeCompletion: false,
    emitLargeToolOutputBeforeCompletion: false,
    emitLargeMcpOutputBeforeCompletion: false,
    emitAutoContextCompactionBeforeCompletion: false,
    delayAfterAutoContextCompactionMs: 0
}));

vi.mock('./codexAppServerClient', () => {
    class MockCodexAppServerClient {
        private notificationHandler: ((method: string, params: unknown) => void) | null = null;

        async connect(): Promise<void> {}

        async initialize(params: unknown): Promise<{ protocolVersion: number }> {
            harness.initializeCalls.push(params);
            return { protocolVersion: 1 };
        }

        setNotificationHandler(handler: ((method: string, params: unknown) => void) | null): void {
            this.notificationHandler = handler;
        }

        registerRequestHandler(method: string): void {
            harness.registerRequestCalls.push(method);
        }

        async startThread(): Promise<{ thread: { id: string }; model: string }> {
            return { thread: { id: 'thread-anonymous' }, model: 'gpt-5.4' };
        }

        async resumeThread(): Promise<{ thread: { id: string }; model: string }> {
            return { thread: { id: 'thread-anonymous' }, model: 'gpt-5.4' };
        }

        async startTurn(params: unknown): Promise<{ turn: Record<string, unknown> }> {
            harness.startTurnCalls.push(params);
            const script = harness.turnScripts.shift();
            const started = { turn: script?.startedTurnId ? { id: script.startedTurnId } : {} };
            harness.notifications.push({ method: 'turn/started', params: started });
            this.notificationHandler?.('turn/started', started);

            if (script?.extraStartedTurnIdBeforeCompletion) {
                const extraStarted = { turn: { id: script.extraStartedTurnIdBeforeCompletion } };
                harness.notifications.push({ method: 'turn/started', params: extraStarted });
                this.notificationHandler?.('turn/started', extraStarted);
            }

            if (harness.emitContextCompactionBeforeCompletion) {
                const compacted = {
                    threadId: 'thread-anonymous',
                    previousTokens: 120000,
                    tokens: 25000
                };
                harness.notifications.push({ method: 'thread/compacted', params: compacted });
                this.notificationHandler?.('thread/compacted', compacted);
            }

            if (harness.emitLargeToolOutputBeforeCompletion) {
                const completedCommand = {
                    item: {
                        type: 'commandExecution',
                        id: 'cmd-large',
                        output: `head\n${'x'.repeat(25_000)}\ntail`,
                        exitCode: 0,
                        status: 'completed'
                    }
                };
                harness.notifications.push({ method: 'item/completed', params: completedCommand });
                this.notificationHandler?.('item/completed', completedCommand);
            }

            if (harness.emitLargeMcpOutputBeforeCompletion) {
                const startedMcp = {
                    msg: {
                        type: 'mcp_tool_call_begin',
                        call_id: 'mcp-large',
                        invocation: {
                            server: 'browser',
                            tool: 'open',
                            arguments: { url: 'http://localhost' }
                        }
                    }
                };
                const completedMcp = {
                    msg: {
                        type: 'mcp_tool_call_end',
                        call_id: 'mcp-large',
                        result: { Ok: `head\n${'m'.repeat(25_000)}\ntail` }
                    }
                };
                harness.notifications.push({ method: 'codex/event/mcp_tool_call_begin', params: startedMcp });
                this.notificationHandler?.('codex/event/mcp_tool_call_begin', startedMcp);
                harness.notifications.push({ method: 'codex/event/mcp_tool_call_end', params: completedMcp });
                this.notificationHandler?.('codex/event/mcp_tool_call_end', completedMcp);
            }

            if (harness.emitAutoContextCompactionBeforeCompletion) {
                const compacted = {
                    msg: {
                        type: 'context_compacted',
                        thread_id: 'thread-anonymous'
                    }
                };
                harness.notifications.push({ method: 'codex/event/context_compacted', params: compacted });
                this.notificationHandler?.('codex/event/context_compacted', compacted);

                if (harness.delayAfterAutoContextCompactionMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, harness.delayAfterAutoContextCompactionMs));
                }
            }

            harness.nowMs += script?.advanceBeforeCompletionMs ?? harness.advanceBeforeTurnCompleteMs;
            const completed = {
                ...harness.turnCompletion,
                turn: script?.completionTurnId ? { id: script.completionTurnId } : {}
            };
            harness.notifications.push({ method: 'turn/completed', params: completed });
            this.notificationHandler?.('turn/completed', completed);

            return { turn: script?.responseTurnId ? { id: script.responseTurnId } : {} };
        }

        async interruptTurn(params: unknown): Promise<Record<string, never>> {
            harness.interruptCalls.push(params);
            return {};
        }

        async compactThread(params: unknown): Promise<Record<string, never>> {
            harness.compactCalls.push(params);
            if (harness.compactError) {
                throw harness.compactError;
            }
            if (harness.deferCompactCompletion) {
                const started = {
                    threadId: 'thread-anonymous',
                    item: {
                        type: 'contextCompaction',
                        id: 'compact-delayed'
                    }
                };
                this.notificationHandler?.('item/started', started);
                harness.emitDeferredCompactCompletion = () => {
                    const completed = {
                        threadId: 'thread-anonymous',
                        item: {
                            type: 'contextCompaction',
                            id: 'compact-delayed'
                        }
                    };
                    this.notificationHandler?.('item/completed', completed);
                };
                return {};
            }
            if (harness.deferCompactFailure) {
                const started = {
                    threadId: 'thread-anonymous',
                    item: {
                        type: 'contextCompaction',
                        id: 'compact-failed'
                    }
                };
                this.notificationHandler?.('item/started', started);
                harness.emitDeferredCompactFailure = () => {
                    const failed = {
                        status: 'Failed',
                        message: 'compact failed asynchronously',
                        turn: {}
                    };
                    this.notificationHandler?.('turn/completed', failed);
                };
                return {};
            }
            this.notificationHandler?.('thread/compacted', { threadId: 'thread-anonymous' });
            return {};
        }

        async disconnect(): Promise<void> {}
    }

    return { CodexAppServerClient: MockCodexAppServerClient };
});

vi.mock('./utils/buildHapiMcpBridge', () => ({
    buildHapiMcpBridge: async () => ({
        server: {
            stop: () => {}
        },
        mcpServers: {}
    })
}));

vi.mock('./utils/codexThreadTitle', () => ({
    createCodexThreadTitlePoller: () => ({ stop: () => {} }),
    syncCodexThreadTitleToMetadata: async (_client: unknown, threadId: string) => {
        harness.titleSyncCalls.push(threadId);
        return true;
    }
}));

import { codexRemoteLauncher } from './codexRemoteLauncher';

type FakeAgentState = {
    requests: Record<string, unknown>;
    completedRequests: Record<string, unknown>;
};

function createMode(): EnhancedMode {
    return {
        permissionMode: 'default',
        collaborationMode: 'default'
    };
}

function createSessionStub(initialMessage: string | string[] = 'hello from launcher test') {
    const queue = new MessageQueue2<EnhancedMode>((mode) => JSON.stringify(mode));
    const messages = Array.isArray(initialMessage) ? initialMessage : [initialMessage];
    for (const message of messages) {
        queue.push(message, createMode());
    }
    queue.close();

    const sessionEvents: Array<{ type: string; [key: string]: unknown }> = [];
    const codexMessages: unknown[] = [];
    const thinkingChanges: boolean[] = [];
    const foundSessionIds: string[] = [];
    let currentModel: string | null | undefined;
    let currentModelReasoningEffort: string | null | undefined;
    let currentServiceTier: string | null | undefined;
    let agentState: FakeAgentState = {
        requests: {},
        completedRequests: {}
    };

    const rpcHandlers = new Map<string, (params: unknown) => unknown>();
    const client = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => unknown) {
                rpcHandlers.set(method, handler);
            }
        },
        isDesktopMirrorSession() {
            return false;
        },
        updateAgentState(handler: (state: FakeAgentState) => FakeAgentState) {
            agentState = handler(agentState);
        },
        sendAgentMessage(message: unknown) {
            codexMessages.push(message);
        },
        sendUserMessage(_text: string) {},
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            sessionEvents.push(event);
        }
    };

    const session = {
        path: '/tmp/hapi-update',
        logPath: '/tmp/hapi-update/test.log',
        client,
        queue,
        codexArgs: undefined,
        codexCliOverrides: undefined,
        sessionId: null as string | null,
        thinking: false,
        getPermissionMode() {
            return 'default' as const;
        },
        setModel(nextModel: string | null) {
            currentModel = nextModel;
        },
        getModel() {
            return currentModel;
        },
        setModelReasoningEffort(nextModelReasoningEffort: string | null) {
            currentModelReasoningEffort = nextModelReasoningEffort;
        },
        getModelReasoningEffort() {
            return currentModelReasoningEffort;
        },
        setServiceTier(nextServiceTier: string | null) {
            currentServiceTier = nextServiceTier;
        },
        getServiceTier() {
            return currentServiceTier;
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
        },
        sendUserMessage(text: string) {
            client.sendUserMessage(text);
        }
    };

    return {
        session,
        sessionEvents,
        codexMessages,
        thinkingChanges,
        foundSessionIds,
        rpcHandlers,
        getModel: () => currentModel,
        getAgentState: () => agentState
    };
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 500): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error('Timed out waiting for condition');
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

describe('codexRemoteLauncher', () => {
    afterEach(() => {
        harness.notifications = [];
        harness.registerRequestCalls = [];
        harness.initializeCalls = [];
        harness.startTurnCalls = [];
        harness.interruptCalls = [];
        harness.compactCalls = [];
        harness.compactError = null;
        harness.deferCompactCompletion = false;
        harness.deferCompactFailure = false;
        harness.emitDeferredCompactCompletion = null;
        harness.emitDeferredCompactFailure = null;
        harness.turnCompletion = { status: 'Completed' };
        harness.turnScripts = [];
        harness.titleSyncCalls = [];
        harness.nowMs = 1_700_000_000_000;
        harness.advanceBeforeTurnCompleteMs = 0;
        harness.emitContextCompactionBeforeCompletion = false;
        harness.emitLargeToolOutputBeforeCompletion = false;
        harness.emitLargeMcpOutputBeforeCompletion = false;
        harness.emitAutoContextCompactionBeforeCompletion = false;
        harness.delayAfterAutoContextCompactionMs = 0;
        vi.restoreAllMocks();
    });

    it('finishes a turn and emits ready when task lifecycle events omit turn_id', async () => {
        const {
            session,
            sessionEvents,
            thinkingChanges,
            foundSessionIds,
            getModel
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(foundSessionIds).toContain('thread-anonymous');
        expect(getModel()).toBe('gpt-5.4');
        expect(harness.initializeCalls).toEqual([{
            clientInfo: {
                name: 'hapi-codex-client',
                version: '1.0.0'
            },
            capabilities: {
                experimentalApi: true
            }
        }]);
        expect(harness.notifications.map((entry) => entry.method)).toEqual(['turn/started', 'turn/completed']);
        expect(sessionEvents.filter((event) => event.type === 'ready').length).toBeGreaterThanOrEqual(1);
        expect(thinkingChanges).toContain(true);
        expect(session.thinking).toBe(false);
    });

    it('syncs the Codex desktop thread title when a HAPI runner thread is known and after the turn settles', async () => {
        const { session } = createSessionStub();

        await codexRemoteLauncher(session as never);

        expect(harness.titleSyncCalls).toContain('thread-anonymous');
        expect(harness.titleSyncCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('persists failed terminal events so the hub can notify for attention', async () => {
        harness.turnCompletion = { status: 'Failed', message: 'boom' };
        const {
            session,
            codexMessages
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'task_failed',
            error: 'boom'
        }));
    });

    it('persists native context compaction notifications without ending the turn', async () => {
        harness.emitContextCompactionBeforeCompletion = true;
        const {
            session,
            codexMessages,
            sessionEvents
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'context_compacted',
            thread_id: 'thread-anonymous',
            previousTokens: 120000,
            tokens: 25000
        }));
        expect(sessionEvents.filter((event) => event.type === 'ready')).toHaveLength(1);
    });

    it('summarizes oversized command outputs before sending them to HAPI', async () => {
        harness.emitLargeToolOutputBeforeCompletion = true;
        const {
            session,
            codexMessages
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'tool-call-result',
            callId: 'cmd-large',
            output: expect.objectContaining({
                type: 'hapi-tool-output-summary',
                truncated: true,
                callId: 'cmd-large',
                toolName: 'CodexBash',
                preview: expect.stringContaining('head')
            })
        }));
    });

    it('keeps MCP tool identity when summarizing oversized MCP outputs', async () => {
        harness.emitLargeMcpOutputBeforeCompletion = true;
        const {
            session,
            codexMessages
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'tool-call-result',
            callId: 'mcp-large',
            output: expect.objectContaining({
                type: 'hapi-tool-output-summary',
                truncated: true,
                callId: 'mcp-large',
                toolName: 'mcp__browser__open'
            })
        }));
    });

    it('emits a HAPI-only turn-duration event after a Codex turn settles', async () => {
        harness.advanceBeforeTurnCompleteMs = 12_345;
        vi.spyOn(Date, 'now').mockImplementation(() => harness.nowMs);
        const {
            session,
            sessionEvents
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(sessionEvents).toContainEqual(expect.objectContaining({
            type: 'turn-duration',
            durationMs: 12_345
        }));
    });

    it('does not let an ignored mismatched terminal event inflate a later turn duration', async () => {
        harness.turnScripts = [
            {
                startedTurnId: 'stale-turn',
                extraStartedTurnIdBeforeCompletion: 'overlapping-turn',
                responseTurnId: 'overlapping-turn',
                completionTurnId: 'stale-turn',
                advanceBeforeCompletionMs: 100_000
            },
            {
                startedTurnId: 'fresh-turn',
                responseTurnId: 'fresh-turn',
                completionTurnId: 'fresh-turn',
                advanceBeforeCompletionMs: 12_000
            }
        ];
        vi.spyOn(Date, 'now').mockImplementation(() => harness.nowMs);
        const {
            session,
            sessionEvents
        } = createSessionStub();
        let waits = 0;
        (session as any).queue = {
            size() {
                return waits < 2 ? 1 : 0;
            },
            reset() {},
            async waitForMessagesAndGetAsString() {
                waits += 1;
                if (waits === 1) {
                    return {
                        message: 'first prompt',
                        mode: createMode(),
                        isolate: false,
                        hash: 'first'
                    };
                }
                if (waits === 2) {
                    return {
                        message: 'second prompt',
                        mode: createMode(),
                        isolate: false,
                        hash: 'second'
                    };
                }
                return null;
            }
        };

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        const durations = sessionEvents
            .filter((event) => event.type === 'turn-duration')
            .map((event) => event.durationMs);
        expect(durations.at(-1)).toBe(12_000);
        expect(durations).toHaveLength(1);
        expect(durations).not.toContain(112_000);
    });

    it('does not resurrect a completed turn id from the startTurn response', async () => {
        harness.turnScripts = [{
            startedTurnId: 'completed-before-response',
            responseTurnId: 'completed-before-response',
            completionTurnId: 'completed-before-response',
            advanceBeforeCompletionMs: 1_000
        }];
        const {
            session,
            sessionEvents,
            rpcHandlers
        } = createSessionStub();
        let waits = 0;
        (session as any).queue = {
            size() {
                return waits === 0 ? 1 : 0;
            },
            reset() {},
            async waitForMessagesAndGetAsString(signal?: AbortSignal) {
                waits += 1;
                if (waits === 1) {
                    return {
                        message: 'complete before response',
                        mode: createMode(),
                        isolate: false,
                        hash: 'first'
                    };
                }
                await new Promise<void>((resolve) => {
                    if (signal?.aborted) {
                        resolve();
                        return;
                    }
                    signal?.addEventListener('abort', () => resolve(), { once: true });
                });
                return null;
            }
        };

        const launcherPromise = codexRemoteLauncher(session as never);

        await waitForCondition(() => sessionEvents.some((event) => event.type === 'ready'));
        await rpcHandlers.get('switch')?.({});
        const exitReason = await launcherPromise;

        expect(exitReason).toBe('switch');
        expect(harness.interruptCalls).toEqual([]);
    });

    it('does not emit ready for automatic context compaction before the turn completes', async () => {
        harness.emitAutoContextCompactionBeforeCompletion = true;
        harness.delayAfterAutoContextCompactionMs = 200;
        const {
            session,
            codexMessages,
            sessionEvents
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'context_compacted',
            thread_id: 'thread-anonymous'
        }));
        expect(sessionEvents.filter((event) => event.type === 'ready')).toHaveLength(1);
    });

    it('runs native Codex compaction for /compact without starting a normal turn', async () => {
        const {
            session,
            codexMessages,
            sessionEvents
        } = createSessionStub('/compact');
        session.sessionId = 'thread-anonymous';

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(harness.compactCalls).toEqual([{ threadId: 'thread-anonymous' }]);
        expect(harness.startTurnCalls).toEqual([]);
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'context_compacted',
            thread_id: 'thread-anonymous'
        }));
        expect(sessionEvents.filter((event) => event.type === 'ready').length).toBeGreaterThanOrEqual(1);
    });

    it('keeps /compact in flight until the compaction completion event arrives', async () => {
        harness.deferCompactCompletion = true;
        const {
            session,
            codexMessages,
            sessionEvents
        } = createSessionStub('/compact');
        session.sessionId = 'thread-anonymous';

        let waits = 0;
        let releaseIdleWait: (() => void) | null = null;
        session.queue = {
            size() {
                return 0;
            },
            reset() {},
            async waitForMessagesAndGetAsString() {
                waits += 1;
                if (waits === 1) {
                    return {
                        message: '/compact',
                        mode: createMode(),
                        isolate: true,
                        hash: 'hash-compact'
                    };
                }
                await new Promise<void>((resolve) => {
                    releaseIdleWait = resolve;
                });
                return null;
            }
        } as never;

        const launcherPromise = codexRemoteLauncher(session as never);

        await waitForCondition(() => harness.compactCalls.length === 1);
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(waits).toBe(1);
        expect(harness.startTurnCalls).toEqual([]);
        expect(sessionEvents.filter((event) => event.type === 'ready')).toHaveLength(0);
        expect(codexMessages).not.toContainEqual(expect.objectContaining({
            type: 'context_compacted'
        }));

        harness.emitDeferredCompactCompletion?.();
        await waitForCondition(() => sessionEvents.some((event) => event.type === 'ready'));
        (releaseIdleWait as (() => void) | null)?.();

        const exitReason = await launcherPromise;

        expect(exitReason).toBe('exit');
        expect(waits).toBe(2);
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'context_compacted'
        }));
    });

    it('does not process queued follow-up text until /compact completes', async () => {
        harness.deferCompactCompletion = true;
        const {
            session,
            sessionEvents
        } = createSessionStub('/compact');
        session.sessionId = 'thread-anonymous';

        let waits = 0;
        session.queue = {
            size() {
                return waits < 2 ? 1 : 0;
            },
            reset() {},
            async waitForMessagesAndGetAsString() {
                waits += 1;
                if (waits === 1) {
                    return {
                        message: '/compact',
                        mode: createMode(),
                        isolate: true,
                        hash: 'hash-compact'
                    };
                }
                if (waits === 2) {
                    return {
                        message: 'after compact',
                        mode: createMode(),
                        isolate: false,
                        hash: 'hash-follow-up'
                    };
                }
                return null;
            }
        } as never;

        const launcherPromise = codexRemoteLauncher(session as never);

        await waitForCondition(() => harness.compactCalls.length === 1);
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(waits).toBe(1);
        expect(harness.startTurnCalls).toEqual([]);
        expect(sessionEvents.filter((event) => event.type === 'ready')).toHaveLength(0);

        harness.emitDeferredCompactCompletion?.();

        const exitReason = await launcherPromise;

        expect(exitReason).toBe('exit');
        expect(harness.startTurnCalls).toHaveLength(1);
        expect(harness.startTurnCalls[0]).toMatchObject({
            input: [{ type: 'text', text: 'after compact' }]
        });
    });

    it('uses the latest session reasoning effort and service tier when starting a turn', async () => {
        const { session } = createSessionStub();
        (session as any).getModelReasoningEffort = () => 'high';
        (session as any).getServiceTier = () => 'fast';

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(harness.startTurnCalls[0]).toMatchObject({
            effort: 'high',
            serviceTier: 'fast'
        });
    });

    it('reports /compact failures without starting a normal turn', async () => {
        harness.compactError = new Error('compact unavailable');
        const {
            session,
            codexMessages,
            sessionEvents
        } = createSessionStub('/compact');
        session.sessionId = 'thread-anonymous';

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(harness.compactCalls).toEqual([{ threadId: 'thread-anonymous' }]);
        expect(harness.startTurnCalls).toEqual([]);
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'task_failed',
            error: 'Compaction failed: compact unavailable'
        }));
        expect(sessionEvents.filter((event) => event.type === 'ready').length).toBeGreaterThanOrEqual(1);
    });

    it('settles /compact when an asynchronous failure event arrives', async () => {
        harness.deferCompactFailure = true;
        const {
            session,
            codexMessages,
            sessionEvents
        } = createSessionStub('/compact');
        session.sessionId = 'thread-anonymous';

        let waits = 0;
        let releaseIdleWait: (() => void) | null = null;
        session.queue = {
            size() {
                return 0;
            },
            reset() {},
            async waitForMessagesAndGetAsString() {
                waits += 1;
                if (waits === 1) {
                    return {
                        message: '/compact',
                        mode: createMode(),
                        isolate: true,
                        hash: 'hash-compact-fail'
                    };
                }
                await new Promise<void>((resolve) => {
                    releaseIdleWait = resolve;
                });
                return null;
            }
        } as never;

        const launcherPromise = codexRemoteLauncher(session as never);

        await waitForCondition(() => harness.compactCalls.length === 1);
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(sessionEvents.filter((event) => event.type === 'ready')).toHaveLength(0);

        harness.emitDeferredCompactFailure?.();
        await waitForCondition(() => sessionEvents.some((event) => event.type === 'ready'));
        (releaseIdleWait as (() => void) | null)?.();

        const exitReason = await launcherPromise;

        expect(exitReason).toBe('exit');
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'task_failed',
            error: 'compact failed asynchronously'
        }));
    });

    it('exits after an idle desktop-mirror takeover turn instead of waiting forever for more messages', async () => {
        const {
            session,
            sessionEvents
        } = createSessionStub();
        const desktopMirrorSession = session as any;

        let waits = 0;
        desktopMirrorSession.startedBy = 'runner';
        desktopMirrorSession.client.isDesktopMirrorSession = () => true;
        desktopMirrorSession.queue = {
            size() {
                return waits === 0 ? 1 : 0;
            },
            reset() {},
            async waitForMessagesAndGetAsString() {
                waits += 1;
                if (waits === 1) {
                    return {
                        message: 'desktop mirror follow-up',
                        mode: createMode(),
                        isolate: false,
                        hash: 'hash-1'
                    };
                }
                return await new Promise(() => {});
            }
        };

        const exitReason = await Promise.race([
            codexRemoteLauncher(desktopMirrorSession as never),
            new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 250))
        ]);

        expect(exitReason).toBe('exit');
        expect(sessionEvents.filter((event) => event.type === 'ready').length).toBeGreaterThanOrEqual(1);
    });
});
