import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

export function useResolveSendTargetSession(api: ApiClient | null, session: Session | null) {
    return {
        async resolve(currentSessionId: string): Promise<string> {
            if (!api || !session) return currentSessionId

            const metadata = session.metadata as Record<string, unknown> | null
            const control = metadata && typeof metadata === 'object' && typeof metadata.executionControl === 'object'
                ? metadata.executionControl as Record<string, unknown>
                : null
            const isDesktopMirror = metadata?.mirrorSource === 'codex-desktop-sync'
            const owner = control?.owner

            if (isDesktopMirror && owner === 'desktop-sync') {
                return await api.takeoverSession(currentSessionId)
            }
            if (!session.active) {
                return await api.resumeSession(currentSessionId)
            }
            return currentSessionId
        }
    }
}
