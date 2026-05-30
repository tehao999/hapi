import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { Store } from './index'

function createV8Database(dbPath: string): void {
    const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
    db.exec(`
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            tag TEXT,
            namespace TEXT NOT NULL DEFAULT 'default',
            machine_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            metadata TEXT,
            metadata_version INTEGER DEFAULT 1,
            agent_state TEXT,
            agent_state_version INTEGER DEFAULT 1,
            model TEXT,
            model_reasoning_effort TEXT,
            effort TEXT,
            todos TEXT,
            todos_updated_at INTEGER,
            team_state TEXT,
            team_state_updated_at INTEGER,
            active INTEGER DEFAULT 0,
            active_at INTEGER,
            seq INTEGER DEFAULT 0
        );
        CREATE TABLE machines (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            metadata TEXT,
            metadata_version INTEGER DEFAULT 1,
            runner_state TEXT,
            runner_state_version INTEGER DEFAULT 1,
            active INTEGER DEFAULT 0,
            active_at INTEGER,
            seq INTEGER DEFAULT 0
        );
        CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            local_id TEXT
        );
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            platform_user_id TEXT NOT NULL,
            namespace TEXT NOT NULL DEFAULT 'default',
            created_at INTEGER NOT NULL
        );
        CREATE TABLE push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            namespace TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE session_notification_state (
            namespace TEXT NOT NULL,
            session_id TEXT NOT NULL,
            unread_count INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(namespace, session_id)
        );
        PRAGMA user_version = 8;
    `)
    db.close()
}

describe('Store schema migrations', () => {
    it('migrates v8 databases to persist Codex service tiers', () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-store-v8-service-tier-'))
        try {
            const dbPath = join(dir, 'store.sqlite')
            createV8Database(dbPath)

            const store = new Store(dbPath)
            const session = store.sessions.getOrCreateSession(
                'session-service-tier-migration',
                { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
                null,
                'default',
                'gpt-5.5',
                undefined,
                'xhigh',
                'fast'
            )

            expect(session.serviceTier).toBe('fast')
            expect(store.sessions.getSession(session.id)?.serviceTier).toBe('fast')
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
})
