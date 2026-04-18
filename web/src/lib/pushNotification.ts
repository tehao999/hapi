export type PushPayload = {
    title: string
    body?: string
    icon?: string
    badge?: string
    tag?: string
    data?: {
        type?: string
        sessionId?: string
        url?: string
    }
}

export function buildNotificationOptions(payload: PushPayload): NotificationOptions {
    const icon = payload.icon ?? '/pwa-192x192.png'
    const badge = payload.badge ?? '/pwa-64x64.png'
    const data = payload.data
    const tag = payload.tag

    return {
        body: payload.body ?? '',
        icon,
        badge,
        data,
        tag,
        renotify: Boolean(tag)
    }
}
