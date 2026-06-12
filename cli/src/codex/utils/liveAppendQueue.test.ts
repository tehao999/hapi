import { describe, expect, it, vi } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { createCodexLiveAppendQueueHandler, tryLiveAppendQueuedMessage } from './liveAppendQueue';
import type { EnhancedMode } from '../loop';

function createMode(overrides: Partial<EnhancedMode> = {}): EnhancedMode {
    return {
        permissionMode: 'default',
        collaborationMode: 'default',
        ...overrides
    };
}

function createQueue(): MessageQueue2<EnhancedMode> {
    return new MessageQueue2<EnhancedMode>((mode) => JSON.stringify({
        permissionMode: mode.permissionMode,
        collaborationMode: mode.collaborationMode,
        model: mode.model,
        modelReasoningEffort: mode.modelReasoningEffort,
        serviceTier: mode.serviceTier,
    }));
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('tryLiveAppendQueuedMessage', () => {
    it('steers and removes the exact queued message when Codex has an active matching turn', async () => {
        const queue = createQueue();
        const staleMode = createMode({ permissionMode: 'yolo' });
        const liveMode = createMode({ model: 'gpt-5.5' });
        const steer = vi.fn(async () => true);

        queue.push('duplicate text', staleMode);
        queue.push('duplicate text', liveMode);

        const appended = await tryLiveAppendQueuedMessage({
            queue,
            message: 'duplicate text',
            mode: liveMode,
            activeModeHash: queue.modeHasher(liveMode),
            threadId: 'thread-123',
            turnId: 'turn-123',
            turnInFlight: true,
            hasPendingPermission: false,
            manualCompactionInFlight: false,
            goalCommandInFlight: false,
            steer,
            queueItemId: 2,
            origin: 'push'
        });

        expect(appended).toBe(true);
        expect(steer).toHaveBeenCalledWith({
            threadId: 'thread-123',
            expectedTurnId: 'turn-123',
            message: 'duplicate text',
            mode: liveMode
        });
        expect(queue.size()).toBe(1);
        const remaining = await queue.waitForMessagesAndGetAsString();
        expect(remaining?.mode.permissionMode).toBe('yolo');
    });

    it('leaves the queued message when the mode hash differs', async () => {
        const queue = createQueue();
        const activeMode = createMode({ model: 'gpt-5.5' });
        const nextMode = createMode({ model: 'gpt-5.4' });
        const steer = vi.fn(async () => true);

        queue.push('needs another mode', nextMode);

        const appended = await tryLiveAppendQueuedMessage({
            queue,
            message: 'needs another mode',
            mode: nextMode,
            activeModeHash: queue.modeHasher(activeMode),
            threadId: 'thread-123',
            turnId: 'turn-123',
            turnInFlight: true,
            hasPendingPermission: false,
            manualCompactionInFlight: false,
            goalCommandInFlight: false,
            steer,
            origin: 'push'
        });

        expect(appended).toBe(false);
        expect(steer).not.toHaveBeenCalled();
        expect(queue.size()).toBe(1);
    });

    it('leaves special commands queued for isolated processing', async () => {
        const queue = createQueue();
        const mode = createMode();
        const steer = vi.fn(async () => true);

        queue.pushIsolateAndClear('/compact', mode);

        const appended = await tryLiveAppendQueuedMessage({
            queue,
            message: '/compact',
            mode,
            activeModeHash: queue.modeHasher(mode),
            threadId: 'thread-123',
            turnId: 'turn-123',
            turnInFlight: true,
            hasPendingPermission: false,
            manualCompactionInFlight: false,
            goalCommandInFlight: false,
            steer,
            origin: 'pushIsolateAndClear'
        });

        expect(appended).toBe(false);
        expect(steer).not.toHaveBeenCalled();
        expect(queue.size()).toBe(1);
    });

    it('leaves the queued message when permission, compaction, or goal state is active', async () => {
        const mode = createMode();
        const base = {
            message: 'wait for stable agent state',
            mode,
            activeModeHash: '',
            threadId: 'thread-123',
            turnId: 'turn-123',
            turnInFlight: true,
            hasPendingPermission: false,
            manualCompactionInFlight: false,
            goalCommandInFlight: false,
            steer: vi.fn(async () => true),
            origin: 'push' as const
        };

        for (const blockedState of [
            { hasPendingPermission: true },
            { manualCompactionInFlight: true },
            { goalCommandInFlight: true },
            { threadId: null },
            { turnId: null },
            { turnInFlight: false }
        ]) {
            const queue = createQueue();
            queue.push('wait for stable agent state', mode);
            const appended = await tryLiveAppendQueuedMessage({
                ...base,
                queue,
                activeModeHash: queue.modeHasher(mode),
                ...blockedState
            });

            expect(appended).toBe(false);
            expect(queue.size()).toBe(1);
        }
    });

    it('leaves the queued message when turn/steer rejects', async () => {
        const queue = createQueue();
        const mode = createMode();
        const steer = vi.fn(async () => {
            throw new Error('stale turn');
        });

        queue.push('fall back to next turn', mode);

        const appended = await tryLiveAppendQueuedMessage({
            queue,
            message: 'fall back to next turn',
            mode,
            activeModeHash: queue.modeHasher(mode),
            threadId: 'thread-123',
            turnId: 'turn-123',
            turnInFlight: true,
            hasPendingPermission: false,
            manualCompactionInFlight: false,
            goalCommandInFlight: false,
            steer,
            origin: 'push'
        });

        expect(appended).toBe(false);
        expect(queue.size()).toBe(1);
    });
});

describe('createCodexLiveAppendQueueHandler', () => {
    it('reads live launcher state at push time and reports accepted appends', async () => {
        const queue = createQueue();
        const mode = createMode({ model: 'gpt-5.5' });
        const steer = vi.fn(async () => true);
        const onAccepted = vi.fn();
        let turnInFlight = true;
        let hasPendingPermission = false;

        queue.setOnMessage(createCodexLiveAppendQueueHandler({
            queue,
            getActiveModeHash: () => queue.modeHasher(mode),
            getThreadId: () => 'thread-123',
            getTurnId: () => 'turn-123',
            isTurnInFlight: () => turnInFlight,
            hasPendingPermission: () => hasPendingPermission,
            isManualCompactionInFlight: () => false,
            isGoalCommandInFlight: () => false,
            getSteer: () => steer,
            onAccepted
        }));

        queue.push('accepted while active', mode);
        await flushPromises();

        expect(queue.size()).toBe(0);
        expect(onAccepted).toHaveBeenCalledWith({ message: 'accepted while active', mode });

        turnInFlight = false;
        queue.push('after completion', mode);
        await flushPromises();
        expect(queue.size()).toBe(1);

        turnInFlight = true;
        hasPendingPermission = true;
        queue.push('during permission', mode);
        await flushPromises();
        expect(queue.size()).toBe(2);
        expect(steer).toHaveBeenCalledTimes(1);
    });
});
