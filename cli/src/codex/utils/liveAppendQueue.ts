import type { MessageQueue2, MessageQueueMessageOrigin } from '@/utils/MessageQueue2';
import { parseSpecialCommand } from '@/parsers/specialCommands';
import type { EnhancedMode } from '../loop';

export type CodexLiveSteer = (next: {
    threadId: string;
    expectedTurnId: string;
    message: string;
    mode: EnhancedMode;
}) => Promise<boolean> | boolean;

export async function tryLiveAppendQueuedMessage(opts: {
    queue: MessageQueue2<EnhancedMode>;
    message: string;
    mode: EnhancedMode;
    activeModeHash: string | null;
    threadId: string | null;
    turnId: string | null;
    turnInFlight: boolean;
    hasPendingPermission: boolean;
    manualCompactionInFlight: boolean;
    goalCommandInFlight: boolean;
    steer: CodexLiveSteer | null;
    queueItemId?: number;
    origin?: MessageQueueMessageOrigin;
    log?: (message: string) => void;
}): Promise<boolean> {
    const {
        queue,
        message,
        mode,
        activeModeHash,
        threadId,
        turnId,
        turnInFlight,
        hasPendingPermission,
        manualCompactionInFlight,
        goalCommandInFlight,
        steer,
        queueItemId,
        origin,
        log
    } = opts;

    if (origin !== undefined && origin !== 'push') {
        return false;
    }

    if (
        !steer ||
        !threadId ||
        !turnId ||
        !turnInFlight ||
        !activeModeHash ||
        hasPendingPermission ||
        manualCompactionInFlight ||
        goalCommandInFlight
    ) {
        return false;
    }

    if (parseSpecialCommand(message).type !== null) {
        return false;
    }

    const hash = queue.modeHasher(mode);
    if (hash !== activeModeHash) {
        return false;
    }

    let accepted = false;
    try {
        accepted = await steer({
            threadId,
            expectedTurnId: turnId,
            message,
            mode
        });
    } catch (error) {
        log?.(`[codexRemoteLauncher] live append turn/steer rejected: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }

    if (!accepted) {
        return false;
    }

    const removed = queue.takeFirstMatching((item) => {
        if (queueItemId !== undefined) {
            return item.id === queueItemId;
        }

        return item.message === message
            && item.hash === hash
            && item.isolate === false;
    });

    if (!removed) {
        log?.('[codexRemoteLauncher] live append accepted but queued item was not removed');
    }

    return true;
}

export function createCodexLiveAppendQueueHandler(opts: {
    queue: MessageQueue2<EnhancedMode>;
    getActiveModeHash: () => string | null;
    getThreadId: () => string | null;
    getTurnId: () => string | null;
    isTurnInFlight: () => boolean;
    hasPendingPermission: () => boolean;
    isManualCompactionInFlight: () => boolean;
    isGoalCommandInFlight: () => boolean;
    getSteer: () => CodexLiveSteer | null;
    log?: (message: string) => void;
    onAccepted?: (next: { message: string; mode: EnhancedMode }) => void;
}): (message: string, mode: EnhancedMode, item?: { id: number; origin: MessageQueueMessageOrigin }) => void {
    return (message, mode, item) => {
        void tryLiveAppendQueuedMessage({
            queue: opts.queue,
            message,
            mode,
            activeModeHash: opts.getActiveModeHash(),
            threadId: opts.getThreadId(),
            turnId: opts.getTurnId(),
            turnInFlight: opts.isTurnInFlight(),
            hasPendingPermission: opts.hasPendingPermission(),
            manualCompactionInFlight: opts.isManualCompactionInFlight(),
            goalCommandInFlight: opts.isGoalCommandInFlight(),
            steer: opts.getSteer(),
            queueItemId: item?.id,
            origin: item?.origin,
            log: opts.log
        }).then((appended) => {
            if (appended) {
                opts.onAccepted?.({ message, mode });
            }
        });
    };
}
