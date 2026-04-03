/**
 * PDF Service — wraps @react-pdf/renderer for server-side PDF generation.
 * All methods return a Buffer suitable for streaming as application/pdf.
 */

export const PdfService = {
  async renderToBuffer(component: React.ReactElement): Promise<Buffer> {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    return await renderToBuffer(component as unknown as React.ReactElement<unknown>)
  },

  headers(filename: string): Record<string, string> {
    return {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    }
  },
}
