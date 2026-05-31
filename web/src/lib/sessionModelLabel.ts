import { DEFAULT_CLAUDE_MODEL_LABEL, getClaudeModelLabel, supportsEffort } from '@hapi/protocol'

type SessionModelSource = {
    model?: string | null
    modelReasoningEffort?: string | null
    serviceTier?: string | null
    effort?: string | null
    metadata?: {
        flavor?: string | null
    } | null
}

export type SessionModelLabel = {
    key: 'session.item.model'
    value: string
}

export type SessionEffortLabel = {
    key: 'session.item.effort'
    value: string
}

const CODEX_REASONING_EFFORT_LABELS: Record<string, string> = {
    none: 'None',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'XHigh',
}

const CODEX_SERVICE_TIER_LABELS: Record<string, string> = {
    standard: 'Standard',
    fast: 'Fast',
    priority: 'Fast',
}

const CLAUDE_EFFORT_LABELS: Record<string, string> = {
    auto: 'Auto',
    medium: 'Medium',
    high: 'High',
    max: 'Max',
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
    const normalized = value?.trim().toLowerCase()
    if (!normalized || normalized === 'default') {
        return null
    }
    return normalized
}

function formatLabel(value: string, labels: Record<string, string>): string {
    return labels[value] ?? `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function normalizedFlavor(session: SessionModelSource): string | null {
    return normalizeOptionalValue(session.metadata?.flavor)
}

function isClaudeSession(session: SessionModelSource): boolean {
    return normalizedFlavor(session) === 'claude'
}

function isCodexSession(session: SessionModelSource): boolean {
    return normalizedFlavor(session) === 'codex'
}

function getCodexModelLabel(model: string): string {
    const normalized = model.trim().toLowerCase()
    if (!normalized || normalized === 'auto' || normalized === 'default') {
        return 'Auto'
    }
    return model.trim()
}

function getCodexSuffixes(session: SessionModelSource): string[] {
    if (!isCodexSession(session)) {
        return []
    }

    return [
        normalizeOptionalValue(session.modelReasoningEffort),
        normalizeOptionalValue(session.serviceTier),
    ].flatMap((value, index) => {
        if (!value) return []
        return [formatLabel(value, index === 0 ? CODEX_REASONING_EFFORT_LABELS : CODEX_SERVICE_TIER_LABELS)]
    })
}

export function getSessionModelLabel(session: SessionModelSource): SessionModelLabel | null {
    const explicitModel = typeof session.model === 'string' ? session.model.trim() : ''
    const claudeSession = isClaudeSession(session)
    if (explicitModel) {
        if (claudeSession && (explicitModel.toLowerCase() === 'auto' || explicitModel.toLowerCase() === 'default')) {
            return {
                key: 'session.item.model',
                value: DEFAULT_CLAUDE_MODEL_LABEL
            }
        }

        const modelLabel = isCodexSession(session)
            ? getCodexModelLabel(explicitModel)
            : getClaudeModelLabel(explicitModel) ?? explicitModel
        return {
            key: 'session.item.model',
            value: [modelLabel, ...getCodexSuffixes(session)].join(' · ')
        }
    }

    if (claudeSession) {
        return {
            key: 'session.item.model',
            value: DEFAULT_CLAUDE_MODEL_LABEL
        }
    }

    const codexSuffixes = getCodexSuffixes(session)
    if (codexSuffixes.length > 0) {
        return {
            key: 'session.item.model',
            value: ['Auto', ...codexSuffixes].join(' · ')
        }
    }

    return null
}

export function getSessionEffortLabel(session: SessionModelSource): SessionEffortLabel | null {
    const flavor = normalizedFlavor(session)
    if (!supportsEffort(flavor)) {
        return null
    }

    const normalizedEffort = normalizeOptionalValue(session.effort)
        ?? (flavor === 'claude-deepseek' ? 'max' : 'auto')
    return {
        key: 'session.item.effort',
        value: formatLabel(normalizedEffort, CLAUDE_EFFORT_LABELS)
    }
}
