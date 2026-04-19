import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Metadata } from '@/api/types';

type MetadataUpdater = {
    updateMetadata: (handler: (metadata: Metadata) => Metadata) => void
};

type ReadTitle = (threadId: string) => string | null;

function sqlString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

export function getDefaultCodexStateDbPath(env: NodeJS.ProcessEnv = process.env): string {
    return join(env.CODEX_HOME || join(homedir(), '.codex'), 'state_5.sqlite');
}

export function normalizeCodexThreadTitle(title: unknown): string | null {
    if (typeof title !== 'string') {
        return null;
    }
    const trimmed = title.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function readCodexThreadTitle(
    threadId: string,
    options?: { dbPath?: string }
): string | null {
    const dbPath = options?.dbPath ?? getDefaultCodexStateDbPath();
    if (!threadId || !existsSync(dbPath)) {
        return null;
    }

    try {
        const output = execFileSync('sqlite3', [
            '-json',
            dbPath,
            `select title from threads where id = ${sqlString(threadId)} limit 1`
        ], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        if (!output) {
            return null;
        }

        const rows = JSON.parse(output) as Array<{ title?: unknown }>;
        return normalizeCodexThreadTitle(rows[0]?.title);
    } catch {
        return null;
    }
}

export function applyCodexThreadTitleToMetadata(metadata: Metadata, title: unknown): Metadata {
    const normalized = normalizeCodexThreadTitle(title);
    if (!normalized || metadata.title === normalized) {
        return metadata;
    }

    return {
        ...metadata,
        title: normalized
    };
}

export async function syncCodexThreadTitleToMetadata(
    client: MetadataUpdater,
    threadId: string,
    options?: { readTitle?: ReadTitle }
): Promise<boolean> {
    const title = normalizeCodexThreadTitle((options?.readTitle ?? readCodexThreadTitle)(threadId));
    if (!title) {
        return false;
    }

    client.updateMetadata((metadata) => applyCodexThreadTitleToMetadata(metadata, title));
    return true;
}
