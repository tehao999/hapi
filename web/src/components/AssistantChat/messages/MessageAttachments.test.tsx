import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MessageAttachments } from './MessageAttachments'

afterEach(() => {
    cleanup()
})

describe('MessageAttachments', () => {
    it('renders inline file attachments as downloadable links', () => {
        render(
            <MessageAttachments
                attachments={[{
                    id: 'agent-att-1',
                    filename: 'report.txt',
                    mimeType: 'text/plain',
                    size: 5,
                    path: 'hapi-agent-inline://agent-att-1/report.txt',
                    previewUrl: 'data:text/plain;base64,aGVsbG8='
                }]}
            />
        )

        const link = screen.getByRole('link', { name: /download report\.txt/i })
        expect(link).toHaveAttribute('href', 'data:text/plain;base64,aGVsbG8=')
        expect(link).toHaveAttribute('download', 'report.txt')
    })

    it('does not render unsafe preview URLs as links', () => {
        render(
            <MessageAttachments
                attachments={[{
                    id: 'agent-att-unsafe',
                    filename: 'report.txt',
                    mimeType: 'text/plain',
                    size: 5,
                    path: 'hapi-agent-inline://agent-att-unsafe/report.txt',
                    previewUrl: 'javascript:alert(1)'
                }, {
                    id: 'agent-att-html',
                    filename: 'page.txt',
                    mimeType: 'text/plain',
                    size: 5,
                    path: 'hapi-agent-inline://agent-att-html/page.txt',
                    previewUrl: 'data:text/html;base64,PGh0bWw+'
                }, {
                    id: 'agent-att-svg',
                    filename: 'image.png',
                    mimeType: 'image/png',
                    size: 5,
                    path: 'hapi-agent-inline://agent-att-svg/image.png',
                    previewUrl: 'data:image/svg+xml;base64,PHN2Zz4='
                }]}
            />
        )

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(screen.getByText('report.txt')).toBeInTheDocument()
        expect(screen.getByText('page.txt')).toBeInTheDocument()
        expect(screen.getByText('image.png')).toBeInTheDocument()
    })
})
