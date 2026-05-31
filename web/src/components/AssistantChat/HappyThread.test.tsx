import type { ComponentProps, ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@assistant-ui/react', () => ({
    ThreadPrimitive: {
        Root: ({ children, className }: { children: ReactNode; className?: string }) => (
            <div data-testid="thread-root" className={className}>{children}</div>
        ),
        Viewport: ({ children }: { asChild?: boolean; autoScroll?: boolean; children: ReactNode }) => <>{children}</>,
        Messages: () => <div data-testid="thread-messages" />,
    },
}))

vi.mock('@/components/AssistantChat/messages/AssistantMessage', () => ({
    HappyAssistantMessage: () => null,
}))
vi.mock('@/components/AssistantChat/messages/UserMessage', () => ({
    HappyUserMessage: () => null,
}))
vi.mock('@/components/AssistantChat/messages/SystemMessage', () => ({
    HappySystemMessage: () => null,
}))
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, variant: _variant, size: _size, ...rest }: { children: ReactNode; variant?: string; size?: string }) => (
        <button {...rest}>{children}</button>
    ),
}))
vi.mock('@/components/Spinner', () => ({
    Spinner: () => <span data-testid="spinner" />,
}))
vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (
            values && 'n' in values ? `${values.n} new messages` : key
        ),
    }),
}))

import { HappyThread } from './HappyThread'

type HappyThreadProps = ComponentProps<typeof HappyThread>

const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

let rafCallbacks: FrameRequestCallback[] = []

function restoreDescriptor(name: 'scrollHeight' | 'clientHeight' | 'scrollTo', descriptor: PropertyDescriptor | undefined) {
    if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor)
        return
    }
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
}

function flushOneAnimationFrame() {
    const callback = rafCallbacks.shift()
    if (callback) {
        callback(performance.now())
    }
}

function buildThreadProps(overrides: Partial<HappyThreadProps> = {}): HappyThreadProps {
    return {
        api: {} as HappyThreadProps['api'],
        sessionId: 'session-1',
        metadata: null,
        disabled: false,
        onRefresh: vi.fn(),
        onRetryMessage: vi.fn(),
        onFlushPending: vi.fn(),
        onAtBottomChange: vi.fn(),
        isLoadingMessages: false,
        messagesWarning: null,
        hasMoreMessages: false,
        isLoadingMoreMessages: false,
        onLoadMore: vi.fn(async () => {}),
        pendingCount: 0,
        rawMessagesCount: 3,
        normalizedMessagesCount: 3,
        messagesVersion: 1,
        forceScrollToken: 0,
        ...overrides,
    }
}

function renderThread(overrides: Partial<HappyThreadProps> = {}) {
    return render(<HappyThread {...buildThreadProps(overrides)} />)
}

class ImmediateIntersectionObserver implements IntersectionObserver {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds: ReadonlyArray<number> = []

    constructor(private readonly callback: IntersectionObserverCallback) {}

    disconnect = vi.fn()
    observe = vi.fn((target: Element) => {
        this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this)
    })
    takeRecords = vi.fn((): IntersectionObserverEntry[] => [])
    unobserve = vi.fn()
}

describe('HappyThread initial scroll positioning', () => {
    beforeEach(() => {
        rafCallbacks = []
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get: () => 1000,
        })
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
            configurable: true,
            get: () => 400,
        })
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            value: vi.fn(function (this: HTMLElement, options?: ScrollToOptions) {
                if (options && typeof options.top === 'number') {
                    this.scrollTop = options.top
                }
            }),
        })
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            rafCallbacks.push(callback)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        restoreDescriptor('scrollHeight', originalScrollHeight)
        restoreDescriptor('clientHeight', originalClientHeight)
        restoreDescriptor('scrollTo', originalScrollTo)
        rafCallbacks = []
    })

    it('uses an instant bottom scroll after the first message page renders', () => {
        const onFlushPending = vi.fn()

        renderThread({ onFlushPending })

        act(() => {
            flushOneAnimationFrame()
        })

        expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' })
        expect(onFlushPending).toHaveBeenCalled()
    })

    it('keeps the initial bottom scroll active while first page layout height settles', () => {
        let scrollHeight = 100
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get: () => scrollHeight,
        })

        renderThread()

        act(() => {
            flushOneAnimationFrame()
        })
        expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({ top: 100, behavior: 'auto' })

        scrollHeight = 1000
        act(() => {
            flushOneAnimationFrame()
        })

        expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'auto' })
    })

    it('does not request older messages before the initial bottom scroll settles', async () => {
        const onLoadMore = vi.fn(async () => {})
        vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver)

        renderThread({
            hasMoreMessages: true,
            onLoadMore,
        })
        await act(async () => {
            await Promise.resolve()
        })

        expect(onLoadMore).not.toHaveBeenCalled()
    })

    it('allows the top sentinel to request older messages after the initial scroll settles', async () => {
        const onLoadMore = vi.fn(async () => {})
        vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver)

        renderThread({
            hasMoreMessages: true,
            onLoadMore,
        })

        act(() => {
            flushOneAnimationFrame()
            flushOneAnimationFrame()
            flushOneAnimationFrame()
        })
        await act(async () => {
            await Promise.resolve()
        })

        expect(onLoadMore).toHaveBeenCalledTimes(1)
    })

    it('keeps the new-message indicator on the smooth scroll path and flushes pending messages', () => {
        const onFlushPending = vi.fn()

        renderThread({
            pendingCount: 2,
            onFlushPending,
        })

        fireEvent.click(screen.getByRole('button', { name: '2 new messages ↓' }))

        expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'smooth' })
        expect(onFlushPending).toHaveBeenCalledTimes(1)
    })

    it('settles the initial scroll after the maximum frame budget if layout height keeps changing', () => {
        const onLoadMore = vi.fn(async () => {})
        vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver)
        let scrollHeight = 100
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get: () => {
                scrollHeight += 10
                return scrollHeight
            },
        })

        renderThread({
            hasMoreMessages: true,
            onLoadMore,
        })

        act(() => {
            for (let index = 0; index < 12; index += 1) {
                flushOneAnimationFrame()
            }
        })

        expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(12)
        expect(onLoadMore).toHaveBeenCalledTimes(1)
    })

    it('restarts the initial bottom scroll when the session changes', () => {
        let scrollHeight = 1000
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get: () => scrollHeight,
        })
        const { rerender } = render(<HappyThread {...buildThreadProps({
            sessionId: 'session-1',
            messagesVersion: 1,
            rawMessagesCount: 3,
        })} />)

        act(() => {
            flushOneAnimationFrame()
            flushOneAnimationFrame()
            flushOneAnimationFrame()
        })

        scrollHeight = 2000
        rerender(<HappyThread {...buildThreadProps({
            sessionId: 'session-2',
            messagesVersion: 1,
            rawMessagesCount: 3,
        })} />)

        act(() => {
            flushOneAnimationFrame()
        })

        expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
    })
})
