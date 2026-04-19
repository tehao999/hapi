import { CODEX_DESKTOP_SYNC_SOURCE } from './messages'

type SessionTitleMetadata = {
    name?: string | null
    title?: string | null
    path?: string | null
    summary?: { text?: string | null } | null
    mirrorSource?: string | null
}

export function getSessionDisplayTitle(session: {
    id: string
    metadata?: SessionTitleMetadata | null
}): string {
    const metadata = session.metadata
    if (metadata?.name) return metadata.name
    if (metadata?.title) return metadata.title

    const isDesktopMirror = metadata?.mirrorSource === CODEX_DESKTOP_SYNC_SOURCE
    if (!isDesktopMirror && metadata?.summary?.text) {
        return metadata.summary.text
    }

    if (metadata?.path) {
        const parts = metadata.path.split('/').filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : session.id.slice(0, 8)
    }

    return session.id.slice(0, 8)
}
