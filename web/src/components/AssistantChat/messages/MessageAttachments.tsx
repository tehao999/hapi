import type { AttachmentMetadata } from '@/types/api'
import { FileIcon } from '@/components/FileIcon'
import { isImageMimeType } from '@/lib/fileAttachments'
import { getSafeAttachmentPreviewUrl } from '@/lib/safeAttachmentPreviewUrl'

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type AttachmentView = {
    attachment: AttachmentMetadata
    previewUrl?: string
}

function ImageAttachment(props: AttachmentView) {
    const { attachment, previewUrl } = props
    const preview = (
        <div className="relative overflow-hidden rounded-lg">
            <img
                src={previewUrl}
                alt={attachment.filename}
                className="max-h-48 max-w-full object-contain"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                <span className="text-xs text-white/90 line-clamp-1">
                    {attachment.filename}
                </span>
            </div>
        </div>
    )
    if (!previewUrl) return preview
    return (
        <a
            href={previewUrl}
            download={attachment.filename}
            aria-label={`Download ${attachment.filename}`}
            className="block"
        >
            {preview}
        </a>
    )
}

function FileAttachment(props: AttachmentView) {
    const { attachment, previewUrl } = props
    const content = (
        <>
            <FileIcon fileName={attachment.filename} size={24} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium text-[var(--app-fg)]">
                    {attachment.filename}
                </div>
                <div className="text-xs text-[var(--app-hint)]">
                    {formatFileSize(attachment.size)}
                </div>
            </div>
        </>
    )
    const className = 'flex items-center gap-2 rounded-lg bg-[var(--app-bg)] px-3 py-2'

    if (!previewUrl) {
        return (
            <div className={className}>
                {content}
            </div>
        )
    }

    return (
        <a
            href={previewUrl}
            download={attachment.filename}
            aria-label={`Download ${attachment.filename}`}
            className={`${className} hover:bg-[var(--app-subtle-bg)]`}
        >
            {content}
        </a>
    )
}

export function MessageAttachments(props: { attachments: AttachmentMetadata[] }) {
    const { attachments } = props
    if (!attachments || attachments.length === 0) return null

    const views = attachments.map((attachment) => ({
        attachment,
        previewUrl: getSafeAttachmentPreviewUrl(attachment.previewUrl)
    }))
    const images = views.filter(({ attachment, previewUrl }) => isImageMimeType(attachment.mimeType) && previewUrl)
    const files = views.filter(({ attachment, previewUrl }) => !isImageMimeType(attachment.mimeType) || !previewUrl)

    return (
        <div className="mt-2 flex flex-col gap-2">
            {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {images.map(({ attachment, previewUrl }) => (
                        <ImageAttachment key={attachment.id} attachment={attachment} previewUrl={previewUrl} />
                    ))}
                </div>
            )}
            {files.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {files.map(({ attachment, previewUrl }) => (
                        <FileAttachment key={attachment.id} attachment={attachment} previewUrl={previewUrl} />
                    ))}
                </div>
            )}
        </div>
    )
}
