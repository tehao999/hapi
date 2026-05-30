import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { mkdtemp, mkdir, writeFile, lstat } from 'fs/promises'
import { tmpdir } from 'os'
import {
    ensureManagedCodexHome,
    getManagedCodexBootstrapEntryNames,
    getManagedCodexHome,
    getRunnerAgentEnv
} from './run'

describe('managed Codex home env', () => {
    it('uses HAPI_CODEX_HOME override for managed Codex sessions', () => {
        const env = getRunnerAgentEnv('codex', {
            HAPI_HOME: '/tmp/hapi-home',
            HAPI_CODEX_HOME: '/tmp/custom-codex-home',
        })

        expect(env).toEqual({ CODEX_HOME: '/tmp/custom-codex-home' })
    })

    it('defaults managed Codex sessions to HAPI_HOME/codex-home', () => {
        expect(getManagedCodexHome({ HAPI_HOME: '/tmp/hapi-home' })).toBe(join('/tmp/hapi-home', 'codex-home'))
        expect(getRunnerAgentEnv('codex', { HAPI_HOME: '/tmp/hapi-home' })).toEqual({
            CODEX_HOME: join('/tmp/hapi-home', 'codex-home'),
        })
    })

    it('falls back to HOME/.hapi/codex-home when HAPI_HOME is not set', () => {
        expect(getManagedCodexHome({ HOME: '/Users/example' })).toBe(join('/Users/example', '.hapi', 'codex-home'))
        expect(getRunnerAgentEnv('codex', { HOME: '/Users/example' })).toEqual({
            CODEX_HOME: join('/Users/example', '.hapi', 'codex-home'),
        })
    })

    it('does not inject CODEX_HOME for non-Codex agents', () => {
        expect(getRunnerAgentEnv('claude', { HAPI_HOME: '/tmp/hapi-home' })).toEqual({})
        expect(getRunnerAgentEnv('gemini', { HAPI_HOME: '/tmp/hapi-home' })).toEqual({})
        expect(getRunnerAgentEnv(undefined, { HAPI_HOME: '/tmp/hapi-home' })).toEqual({})
    })

    it('injects the local claude-deepseek wrapper only for claude-deepseek sessions', () => {
        expect(getRunnerAgentEnv('claude-deepseek', { HOME: '/Users/tehao' })).toEqual({
            HAPI_CLAUDE_PATH: '/Users/tehao/.local/bin/claude-deepseek',
        })
        expect(getRunnerAgentEnv('claude', { HOME: '/Users/tehao' })).not.toHaveProperty('HAPI_CLAUDE_PATH')
        expect(getRunnerAgentEnv('codex', { HOME: '/Users/tehao', HAPI_HOME: '/tmp/hapi-home' })).not.toHaveProperty('HAPI_CLAUDE_PATH')
    })

    it('bootstraps only non-history Codex resources into the managed home', async () => {
        const root = await mkdtemp(join(tmpdir(), 'hapi-codex-home-test-'))
        const fakeHome = join(root, 'home')
        const defaultCodexHome = join(fakeHome, '.codex')
        const hapiHome = join(root, 'hapi')
        await mkdir(defaultCodexHome, { recursive: true })
        await writeFile(join(defaultCodexHome, 'auth.json'), '{}')
        await writeFile(join(defaultCodexHome, 'config.toml'), 'model = "gpt-5.5"')
        await mkdir(join(defaultCodexHome, 'plugins'), { recursive: true })
        await mkdir(join(defaultCodexHome, 'sessions'), { recursive: true })
        await writeFile(join(defaultCodexHome, 'state_5.sqlite'), '')
        await writeFile(join(defaultCodexHome, 'session_index.jsonl'), '')

        const managedHome = await ensureManagedCodexHome({ HOME: fakeHome, HAPI_HOME: hapiHome })

        expect(managedHome).toBe(join(hapiHome, 'codex-home'))
        expect((await lstat(join(managedHome, 'auth.json'))).isSymbolicLink()).toBe(true)
        expect((await lstat(join(managedHome, 'config.toml'))).isSymbolicLink()).toBe(true)
        expect((await lstat(join(managedHome, 'plugins'))).isSymbolicLink()).toBe(true)
        await expect(lstat(join(managedHome, 'sessions'))).rejects.toThrow()
        await expect(lstat(join(managedHome, 'state_5.sqlite'))).rejects.toThrow()
        await expect(lstat(join(managedHome, 'session_index.jsonl'))).rejects.toThrow()
    })

    it('allows concurrent managed-home bootstrap attempts', async () => {
        const root = await mkdtemp(join(tmpdir(), 'hapi-codex-home-concurrent-test-'))
        const fakeHome = join(root, 'home')
        const defaultCodexHome = join(fakeHome, '.codex')
        const hapiHome = join(root, 'hapi')
        await mkdir(defaultCodexHome, { recursive: true })
        await writeFile(join(defaultCodexHome, 'auth.json'), '{}')
        await writeFile(join(defaultCodexHome, 'config.toml'), 'model = "gpt-5.5"')

        const [first, second] = await Promise.all([
            ensureManagedCodexHome({ HOME: fakeHome, HAPI_HOME: hapiHome }),
            ensureManagedCodexHome({ HOME: fakeHome, HAPI_HOME: hapiHome }),
        ])

        expect(first).toBe(second)
        expect((await lstat(join(first, 'auth.json'))).isSymbolicLink()).toBe(true)
        expect((await lstat(join(first, 'config.toml'))).isSymbolicLink()).toBe(true)
    })

    it('keeps history-like Codex entries out of the bootstrap allowlist', () => {
        const entries = getManagedCodexBootstrapEntryNames()
        expect(entries).not.toContain('sessions')
        expect(entries).not.toContain('archived_sessions')
        expect(entries).not.toContain('state_5.sqlite')
        expect(entries).not.toContain('session_index.jsonl')
        expect(entries).not.toContain('history.jsonl')
    })
})
