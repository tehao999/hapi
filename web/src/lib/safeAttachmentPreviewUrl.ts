const ACTIVE_CONTENT_MIME_TYPES = new Set([
    'text/html',
    'image/svg+xml',
    'application/xhtml+xml'
])
const MIME_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i

function getDataUrlMimeType(value: string): string | null {
    if (!value.startsWith('data:')) return null
    const commaIndex = value.indexOf(',')
    if (commaIndex < 0) return null
    const mediaType = value.slice(5, commaIndex).split(';', 1)[0]?.trim().toLowerCase()
    if (!mediaType || !MIME_TYPE_PATTERN.test(mediaType)) return null
    return mediaType
}

export function getSafeAttachmentPreviewUrl(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const mediaType = getDataUrlMimeType(value)
    if (!mediaType) return undefined
    if (ACTIVE_CONTENT_MIME_TYPES.has(mediaType)) return undefined
    return value
}
