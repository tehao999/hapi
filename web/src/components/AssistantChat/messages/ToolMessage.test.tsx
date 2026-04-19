import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { ToolCallBlock } from '@/chat/types'
import { groupConsecutiveToolBlocks, isToolGroupBlock } from '@/chat/toolGrouping'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'
import { I18nProvider } from '@/lib/i18n-context'

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTelegram: false,
        isTouch: false,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
            selection: vi.fn()
        }
    })
}))

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

const api = {
    approvePermission: vi.fn(async () => undefined),
    denyPermission: vi.fn(async () => undefined)
} as unknown as ApiClient

function makeTool(id: string): ToolCallBlock {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 0,
        tool: {
            id,
            name: 'Bash',
            state: 'completed',
            input: { command: `echo ${id}` },
            createdAt: 0,
            startedAt: 0,
            completedAt: 0,
            description: null
        },
        children: []
    }
}

function renderToolMessage(artifact: unknown) {
    const props = {
        artifact,
        argsText: '',
        result: undefined,
        isError: false,
        toolName: 'tool-group',
        status: { type: 'complete' }
    } as unknown as ToolCallMessagePartProps

    return render(
        <I18nProvider>
            <HappyChatProvider
                value={{
                    api,
                    sessionId: 'session-1',
                    metadata: null,
                    disabled: false,
                    onRefresh: vi.fn()
                }}
            >
                <HappyToolMessage {...props} />
            </HappyChatProvider>
        </I18nProvider>
    )
}

describe('HappyToolMessage tool groups', () => {
    it('renders consecutive tool groups as a compact collapsed summary', () => {
        const grouped = groupConsecutiveToolBlocks([
            makeTool('tool-1'),
            makeTool('tool-2'),
            makeTool('tool-3')
        ])
        const group = grouped[0]
        expect(isToolGroupBlock(group)).toBe(true)
        if (!isToolGroupBlock(group)) return

        renderToolMessage(group)

        const details = screen.getByTestId('tool-group') as HTMLDetailsElement
        expect(details.open).toBe(false)
        expect(screen.getByText('3 tool calls')).toBeInTheDocument()
        expect(screen.getByText('Terminal ×3')).toBeInTheDocument()
        expect(screen.getByText('Done')).toBeInTheDocument()
    })
})
