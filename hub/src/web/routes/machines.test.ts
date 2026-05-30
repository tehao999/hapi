import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Machine, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMachinesRoutes } from './machines'

function createMachine(overrides?: Partial<Machine>): Machine {
    const base: Machine = {
        id: 'machine-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            host: 'localhost',
            platform: 'darwin',
            happyCliVersion: '0.0.0'
        },
        metadataVersion: 1,
        runnerState: null,
        runnerStateVersion: 1
    }

    return {
        ...base,
        ...overrides,
        metadata: overrides?.metadata === undefined
            ? base.metadata
            : overrides.metadata
    }
}

function createApp(machines: Machine[]) {
    const engine = {
        getMachine: (machineId: string) => machines.find((machine) => machine.id === machineId),
        getMachinesByNamespace: (namespace: string) => machines.filter((machine) => machine.namespace === namespace),
        getOnlineMachinesByNamespace: (namespace: string) => machines.filter((machine) => machine.namespace === namespace && machine.active),
        spawnSession: async () => ({ type: 'success' as const, sessionId: 'session-1' })
    } as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

    return app
}

describe('machines routes', () => {
    it('includes known and offline machine counts for the current namespace', async () => {
        const app = createApp([
            createMachine({ id: 'online-machine', active: true }),
            createMachine({ id: 'offline-machine', active: false }),
            createMachine({ id: 'other-namespace-machine', namespace: 'other', active: false }),
        ])

        const response = await app.request('/api/machines')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            machines: [expect.objectContaining({ id: 'online-machine', active: true })],
            knownMachinesCount: 2,
            offlineMachinesCount: 1
        })
    })

    it('passes service tier when spawning a Codex session', async () => {
        let capturedServiceTier: string | undefined
        const machines = [createMachine({ id: 'machine-1', active: true })]
        const engine = {
            getMachine: (machineId: string) => machines.find((machine) => machine.id === machineId),
            getMachinesByNamespace: (namespace: string) => machines.filter((machine) => machine.namespace === namespace),
            getOnlineMachinesByNamespace: (namespace: string) => machines.filter((machine) => machine.namespace === namespace && machine.active),
            spawnSession: async (...args: unknown[]) => {
                capturedServiceTier = args[11] as string | undefined
                return { type: 'success' as const, sessionId: 'session-codex-fast' }
            }
        } as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('namespace', 'default')
            await next()
        })
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/spawn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                directory: '/tmp/project',
                agent: 'codex',
                serviceTier: 'fast'
            })
        })

        expect(response.status).toBe(200)
        expect(capturedServiceTier).toBe('fast')
        expect(await response.json()).toEqual({ type: 'success', sessionId: 'session-codex-fast' })
    })

    it('accepts CC-deepseek as a spawn agent', async () => {
        let capturedAgent: string | undefined
        const machines = [createMachine({ id: 'machine-1', active: true })]
        const engine = {
            getMachine: (machineId: string) => machines.find((machine) => machine.id === machineId),
            getMachinesByNamespace: (namespace: string) => machines.filter((machine) => machine.namespace === namespace),
            getOnlineMachinesByNamespace: (namespace: string) => machines.filter((machine) => machine.namespace === namespace && machine.active),
            spawnSession: async (
                _machineId: string,
                _directory: string,
                agent?: string
            ) => {
                capturedAgent = agent
                return { type: 'success' as const, sessionId: 'session-cc-deepseek' }
            }
        } as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.use('*', async (c, next) => {
            c.set('namespace', 'default')
            await next()
        })
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/spawn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                directory: '/tmp/project',
                agent: 'claude-deepseek'
            })
        })

        expect(response.status).toBe(200)
        expect(capturedAgent).toBe('claude-deepseek')
        expect(await response.json()).toEqual({ type: 'success', sessionId: 'session-cc-deepseek' })
    })
})
