import type { AgentType } from './types'
import { useTranslation } from '@/lib/use-translation'

const AGENT_OPTIONS: { value: AgentType; label: string }[] = [
    { value: 'claude', label: 'Claude' },
    { value: 'claude-deepseek', label: 'CC-deepseek' },
    { value: 'codex', label: 'Codex' },
    { value: 'cursor', label: 'Cursor' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'opencode', label: 'Opencode' },
]

export function AgentSelector(props: {
    agent: AgentType
    isDisabled: boolean
    onAgentChange: (value: AgentType) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                {t('newSession.agent')}
            </label>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
                {AGENT_OPTIONS.map((option) => (
                    <label
                        key={option.value}
                        className="flex items-center gap-1.5 cursor-pointer"
                    >
                        <input
                            type="radio"
                            name="agent"
                            value={option.value}
                            checked={props.agent === option.value}
                            onChange={() => props.onAgentChange(option.value)}
                            disabled={props.isDisabled}
                            className="accent-[var(--app-link)]"
                        />
                        <span className="text-sm">{option.label}</span>
                    </label>
                ))}
            </div>
        </div>
    )
}
