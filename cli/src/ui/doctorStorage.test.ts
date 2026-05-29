import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectStorageSnapshot, formatStorageReport, type StorageSnapshot } from './doctorStorage'

const tempDirs: string[] = []

function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'hapi-storage-test-'))
    tempDirs.push(dir)
    return dir
}

describe('doctor storage report', () => {
    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('reports a missing database without creating it', async () => {
        const homeDir = makeTempDir()

        const snapshot = await collectStorageSnapshot({ homeDir })

        expect(snapshot.db.exists).toBe(false)
        expect(snapshot.db.sizeBytes).toBe(0)
        expect(snapshot.files.some((entry) => entry.path.endsWith('hapi.db'))).toBe(false)
    })

    it('does not create a missing home directory while collecting a dry-run snapshot', async () => {
        const parent = makeTempDir()
        const homeDir = join(parent, 'missing-hapi-home')

        const snapshot = await collectStorageSnapshot({ homeDir })

        expect(snapshot.db.exists).toBe(false)
        expect(snapshot.files).toEqual([])
        expect(existsSync(homeDir)).toBe(false)
    })

    it('formats DB reclaim opportunity as a dry-run recommendation', () => {
        const snapshot: StorageSnapshot = {
            generatedAt: '2026-05-29T12:00:00.000Z',
            homeDir: '/tmp/.hapi',
            files: [{ path: '/tmp/.hapi/hapi.db', relativePath: 'hapi.db', type: 'file', sizeBytes: 200 * 1024 * 1024 }],
            db: {
                path: '/tmp/.hapi/hapi.db',
                exists: true,
                sizeBytes: 200 * 1024 * 1024,
                pageCount: 50_000,
                pageSize: 4096,
                freelistCount: 20_000,
                reclaimableBytes: 81_920_000,
                totalMessages: 75_000,
                largestMessageBytes: 3_500_000,
                totalSessions: 300,
                activeSessions: 12,
                topMessageSessions: [{ sessionId: 's1', messages: 5000 }]
            },
            warnings: []
        }

        const report = formatStorageReport(snapshot)

        expect(report).toContain('Dry-run only: no files were changed')
        expect(report).toContain('Reclaimable:')
        expect(report).toContain('VACUUM may reclaim')
        expect(report).toContain('Messages: 75000')
        expect(report).toContain('s1: 5000 messages')
    })

    it('includes top-level storage files in the snapshot', async () => {
        const homeDir = makeTempDir()
        writeFileSync(join(homeDir, 'hapi.log'), 'log-data')

        const snapshot = await collectStorageSnapshot({ homeDir })

        expect(snapshot.files).toEqual(expect.arrayContaining([
            expect.objectContaining({ relativePath: 'hapi.log', sizeBytes: 8 })
        ]))
    })
})
