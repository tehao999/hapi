import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleNeedRefresh, scheduleServiceWorkerRefresh } from './pwaUpdate'

type MatchMedia = (query: string) => Pick<MediaQueryList, 'matches'>

function matchMediaFor(activeQueries: string[]): MatchMedia {
    return (query: string) => ({ matches: activeQueries.includes(query) })
}

describe('handleNeedRefresh', () => {
    it('auto reloads updates for touch/mobile-like environments without prompting', async () => {
        const updateSW = vi.fn(async () => {})
        const confirmReload = vi.fn(() => false)

        await handleNeedRefresh(updateSW, {
            confirmReload,
            matchMedia: matchMediaFor(['(pointer: coarse)']),
            navigator: { standalone: false } as Navigator & { standalone?: boolean },
        })

        expect(confirmReload).not.toHaveBeenCalled()
        expect(updateSW).toHaveBeenCalledWith(true)
    })

    it('auto reloads updates when installed as a standalone app', async () => {
        const updateSW = vi.fn(async () => {})
        const confirmReload = vi.fn(() => false)

        await handleNeedRefresh(updateSW, {
            confirmReload,
            matchMedia: matchMediaFor(['(display-mode: standalone)']),
            navigator: { standalone: false } as Navigator & { standalone?: boolean },
        })

        expect(confirmReload).not.toHaveBeenCalled()
        expect(updateSW).toHaveBeenCalledWith(true)
    })

    it('keeps desktop confirm flow when not in mobile or standalone mode', async () => {
        const updateSW = vi.fn(async () => {})
        const confirmReload = vi.fn(() => true)

        await handleNeedRefresh(updateSW, {
            confirmReload,
            matchMedia: matchMediaFor([]),
            navigator: { standalone: false } as Navigator & { standalone?: boolean },
        })

        expect(confirmReload).toHaveBeenCalledTimes(1)
        expect(updateSW).toHaveBeenCalledWith(true)
    })

    it('does not reload on desktop when the user declines the prompt', async () => {
        const updateSW = vi.fn(async () => {})
        const confirmReload = vi.fn(() => false)

        await handleNeedRefresh(updateSW, {
            confirmReload,
            matchMedia: matchMediaFor([]),
            navigator: { standalone: false } as Navigator & { standalone?: boolean },
        })

        expect(updateSW).not.toHaveBeenCalled()
    })
})

describe('scheduleServiceWorkerRefresh', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('updates immediately, periodically, and when the page becomes visible', async () => {
        vi.useFakeTimers()
        const update = vi.fn(async () => undefined)
        const listeners = new Map<string, () => void>()
        const setIntervalSpy = vi.fn((callback: () => void, delay: number) => {
            return setInterval(callback, delay)
        })
        let visibilityState: DocumentVisibilityState = 'hidden'

        scheduleServiceWorkerRefresh({ update } as unknown as ServiceWorkerRegistration, {
            document: {
                addEventListener: vi.fn((event: string, callback: () => void) => {
                    listeners.set(event, callback)
                }),
                get visibilityState() {
                    return visibilityState
                },
            },
            setInterval: setIntervalSpy,
        })

        expect(update).toHaveBeenCalledTimes(1)
        expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000)

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
        expect(update).toHaveBeenCalledTimes(2)

        visibilityState = 'visible'
        listeners.get('visibilitychange')?.()
        expect(update).toHaveBeenCalledTimes(3)
    })

    it('swallows registration update failures', async () => {
        vi.useFakeTimers()
        const update = vi.fn(async () => {
            throw new Error('network down')
        })

        expect(() => scheduleServiceWorkerRefresh({ update } as unknown as ServiceWorkerRegistration, {
            document,
            setInterval,
        })).not.toThrow()

        await vi.runOnlyPendingTimersAsync()
        expect(update).toHaveBeenCalled()
    })
})
