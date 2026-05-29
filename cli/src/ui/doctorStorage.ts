import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'

export type DoctorStorageOptions = {
    json?: boolean
    limit?: number
    homeDir?: string
}

export type StorageFileEntry = {
    path: string
    relativePath: string
    type: 'file' | 'directory'
    sizeBytes: number
}

export type StorageTopMessageSession = {
    sessionId: string
    messages: number
}

export type StorageSnapshot = {
    generatedAt: string
    homeDir: string
    files: StorageFileEntry[]
    db: {
        path: string
        exists: boolean
        sizeBytes: number
        pageCount: number | null
        pageSize: number | null
        freelistCount: number | null
        reclaimableBytes: number | null
        totalMessages: number | null
        largestMessageBytes: number | null
        totalSessions: number | null
        activeSessions: number | null
        topMessageSessions: StorageTopMessageSession[]
    }
    warnings: string[]
}

function parseJsonArray(value: string): Array<Record<string, unknown>> {
    if (!value.trim()) {
        return []
    }
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : []
}

function readSqliteJson(dbPath: string, sql: string): Array<Record<string, unknown>> {
    if (!existsSync(dbPath)) {
        return []
    }

    try {
        const output = execFileSync('sqlite3', [
            '-readonly',
            '-json',
            dbPath,
            sql
        ], {
            encoding: 'utf8',
            maxBuffer: 2 * 1024 * 1024,
            timeout: 2_000
        })
        return parseJsonArray(output)
    } catch {
        return []
    }
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readSingleNumber(dbPath: string, sql: string, keys: string[]): number | null {
    const row = readSqliteJson(dbPath, sql)[0]
    if (!row) {
        return null
    }
    for (const key of keys) {
        const value = asNumber(row[key])
        if (value !== null) {
            return value
        }
    }
    return null
}

function safeStatSize(path: string): number {
    try {
        return statSync(path).size
    } catch {
        return 0
    }
}

function directorySize(path: string): number {
    let total = 0
    try {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            const childPath = join(path, entry.name)
            if (entry.isDirectory()) {
                total += directorySize(childPath)
            } else if (entry.isFile()) {
                total += safeStatSize(childPath)
            }
        }
    } catch {
        return total
    }
    return total
}

function listStorageFiles(homeDir: string): StorageFileEntry[] {
    if (!existsSync(homeDir)) {
        return []
    }

    try {
        return readdirSync(homeDir, { withFileTypes: true })
            .map((entry) => {
                const path = join(homeDir, entry.name)
                const type = entry.isDirectory() ? 'directory' as const : 'file' as const
                return {
                    path,
                    relativePath: entry.name,
                    type,
                    sizeBytes: type === 'directory' ? directorySize(path) : safeStatSize(path)
                }
            })
            .sort((a, b) => b.sizeBytes - a.sizeBytes)
    } catch {
        return []
    }
}

function formatBytes(bytes: number | null): string {
    if (bytes === null || !Number.isFinite(bytes)) {
        return 'n/a'
    }
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let value = bytes
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex += 1
    }
    const digits = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2
    return `${value.toFixed(digits)} ${units[unitIndex]}`
}

export function resolveHapiHomeDir(env: NodeJS.ProcessEnv = process.env): string {
    if (env.HAPI_HOME) {
        return env.HAPI_HOME.replace(/^~/, homedir())
    }
    return join(homedir(), '.hapi')
}

export async function collectStorageSnapshot(options: DoctorStorageOptions = {}): Promise<StorageSnapshot> {
    const homeDir = options.homeDir ?? resolveHapiHomeDir()
    const limit = Math.max(1, Math.min(options.limit ?? 8, 50))
    const dbPath = join(homeDir, 'hapi.db')
    const dbExists = existsSync(dbPath)
    const pageCount = readSingleNumber(dbPath, 'PRAGMA page_count;', ['page_count'])
    const pageSize = readSingleNumber(dbPath, 'PRAGMA page_size;', ['page_size'])
    const freelistCount = readSingleNumber(dbPath, 'PRAGMA freelist_count;', ['freelist_count'])
    const messageStats = readSqliteJson(dbPath, 'SELECT COUNT(*) AS totalMessages, MAX(LENGTH(content)) AS largestMessageBytes FROM messages;')[0] ?? {}
    const sessionStats = readSqliteJson(dbPath, 'SELECT COUNT(*) AS totalSessions, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS activeSessions FROM sessions;')[0] ?? {}
    const topMessageSessions = readSqliteJson(dbPath, `
        SELECT session_id AS sessionId, COUNT(*) AS messages
        FROM messages
        GROUP BY session_id
        ORDER BY messages DESC
        LIMIT ${limit};
    `).map((row) => ({
        sessionId: typeof row.sessionId === 'string' ? row.sessionId : String(row.sessionId ?? ''),
        messages: asNumber(row.messages) ?? 0
    })).filter((row) => row.sessionId)

    const reclaimableBytes = freelistCount !== null && pageSize !== null
        ? freelistCount * pageSize
        : null

    const warnings: string[] = []
    if (dbExists && pageCount === null) {
        warnings.push('Unable to read SQLite page metrics with sqlite3 -readonly')
    }

    return {
        generatedAt: new Date().toISOString(),
        homeDir,
        files: listStorageFiles(homeDir),
        db: {
            path: dbPath,
            exists: dbExists,
            sizeBytes: dbExists ? safeStatSize(dbPath) : 0,
            pageCount,
            pageSize,
            freelistCount,
            reclaimableBytes,
            totalMessages: asNumber(messageStats.totalMessages),
            largestMessageBytes: asNumber(messageStats.largestMessageBytes),
            totalSessions: asNumber(sessionStats.totalSessions),
            activeSessions: asNumber(sessionStats.activeSessions),
            topMessageSessions
        },
        warnings
    }
}

export function formatStorageReport(snapshot: StorageSnapshot): string {
    const lines = [
        'hapi doctor storage',
        'Dry-run only: no files were changed.',
        `Generated: ${snapshot.generatedAt}`,
        `Home: ${snapshot.homeDir}`,
        ''
    ]

    if (!snapshot.db.exists) {
        lines.push(`Database: missing (${snapshot.db.path})`)
    } else {
        lines.push(`Database: ${snapshot.db.path}`)
        lines.push(`Size: ${formatBytes(snapshot.db.sizeBytes)}`)
        lines.push(`Pages: count=${snapshot.db.pageCount ?? 'n/a'} size=${snapshot.db.pageSize ?? 'n/a'} freelist=${snapshot.db.freelistCount ?? 'n/a'}`)
        lines.push(`Reclaimable: ${formatBytes(snapshot.db.reclaimableBytes)}`)
        lines.push(`Messages: ${snapshot.db.totalMessages ?? 'n/a'} largest=${formatBytes(snapshot.db.largestMessageBytes)}`)
        lines.push(`Sessions: total=${snapshot.db.totalSessions ?? 'n/a'} active=${snapshot.db.activeSessions ?? 'n/a'}`)
        if ((snapshot.db.reclaimableBytes ?? 0) >= 64 * 1024 * 1024) {
            lines.push(`Recommendation: VACUUM may reclaim ${formatBytes(snapshot.db.reclaimableBytes)}; not run automatically.`)
        }
    }

    if (snapshot.db.topMessageSessions.length > 0) {
        lines.push('')
        lines.push('Top sessions by message count:')
        for (const row of snapshot.db.topMessageSessions) {
            lines.push(`- ${row.sessionId}: ${row.messages} messages`)
        }
    }

    if (snapshot.files.length > 0) {
        lines.push('')
        lines.push('Top-level storage entries:')
        for (const entry of snapshot.files.slice(0, 20)) {
            lines.push(`- ${entry.relativePath} (${entry.type}): ${formatBytes(entry.sizeBytes)}`)
        }
    }

    if (snapshot.warnings.length > 0) {
        lines.push('')
        lines.push(`Warnings: ${snapshot.warnings.join('; ')}`)
    }

    return lines.join('\n')
}

export async function runDoctorStorage(options: DoctorStorageOptions = {}): Promise<void> {
    const snapshot = await collectStorageSnapshot(options)
    if (options.json) {
        console.log(JSON.stringify(snapshot, null, 2))
        return
    }
    console.log(chalk.cyan(formatStorageReport(snapshot)))
}
