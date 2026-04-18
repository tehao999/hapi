import { describe, expect, it } from 'bun:test'
import {
    acquireRunnerControl,
    initializeDesktopMirrorControl,
    releaseRunnerControl,
    shouldAcceptPassiveSync
} from './sessionControlService'

describe('sessionControlService', () => {
    it('initializes desktop mirror control on first passive sync', () => {
        const control = initializeDesktopMirrorControl(1_700_000_000_000)

        expect(control).toEqual({
            owner: 'desktop-sync',
            generation: 1,
            leaseExpiresAt: null,
            runnerSessionId: null,
            updatedAt: 1_700_000_000_000
        })
    })

    it('moves control to hapi-runner and bumps generation', () => {
        const desktop = initializeDesktopMirrorControl(10)
        const runner = acquireRunnerControl(desktop, 'session-runner', 110, 60_000)

        expect(runner).toEqual({
            owner: 'hapi-runner',
            generation: 2,
            leaseExpiresAt: 60_110,
            runnerSessionId: 'session-runner',
            updatedAt: 110
        })
    })

    it('rejects stale passive sync generations after takeover', () => {
        const desktop = initializeDesktopMirrorControl(10)
        const runner = acquireRunnerControl(desktop, 'session-runner', 110, 60_000)

        expect(shouldAcceptPassiveSync(runner, 1, 120).accepted).toBe(false)
        expect(shouldAcceptPassiveSync(runner, 2, 120).accepted).toBe(false)
    })

    it('returns control to desktop sync on release and bumps generation again', () => {
        const desktop = initializeDesktopMirrorControl(10)
        const runner = acquireRunnerControl(desktop, 'session-runner', 110, 60_000)
        const released = releaseRunnerControl(runner, 220)

        expect(released).toEqual({
            owner: 'desktop-sync',
            generation: 3,
            leaseExpiresAt: null,
            runnerSessionId: null,
            updatedAt: 220
        })
    })
})
