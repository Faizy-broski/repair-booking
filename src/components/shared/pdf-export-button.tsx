'use client'
import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PdfExportButtonProps {
  /** URL to fetch the PDF from (should return application/pdf) */
  url: string
  filename?: string
  label?: string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
}

/**
 * Downloads a PDF from a given API URL.
 * Works for invoices, reports, receipts — any endpoint returning application/pdf.
 */
export function PdfExportButton({
  url,
  filename = 'document.pdf',
  label = 'Export PDF',
  size = 'sm',
  variant = 'outline',
}: PdfExportButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to generate PDF')
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('PDF download failed', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant={variant} size={size} loading={loading} onClick={handleDownload}>
      <Download className="h-4 w-4" />
      {label}
    </Button>
  )
}
