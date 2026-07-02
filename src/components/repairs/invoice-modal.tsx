'use client'
import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, FileText, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  repair: any
}

// The invoice PDF is rendered server-side (/api/repairs/[id]/pdf) with a fixed
// page size, so the preview and the print are the exact same document. Printing
// happens through the already-loaded preview iframe — no popup window, no
// client-side height measurement, no race with logo/font loading.
export function RepairInvoiceModal({ open, onClose, repair }: Props) {
  const [pdfUrl, setPdfUrl]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)
  const iframeRef             = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!open || !repair) return

    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch(`/api/repairs/${repair.id}/pdf`)
        if (!res.ok) throw new Error(`PDF generation failed (${res.status})`)
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPdfUrl(objectUrl)
      } catch (err) {
        console.error('Failed to load invoice PDF:', err)
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, repair])

  useEffect(() => {
    if (!open) { setPdfUrl(null); setError(false); setLoading(false) }
  }, [open])

  function handlePrint() {
    const win = iframeRef.current?.contentWindow
    if (win) {
      win.focus()
      win.print()
    } else if (pdfUrl) {
      window.open(pdfUrl)
    }
  }

  if (!repair) return null

  return (
    <Modal open={open} onClose={onClose} title={`Invoice - ${repair.job_number}`} size="xl">
      <div className="flex flex-col h-[75vh]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium">Generating invoice...</p>
          </div>
        ) : pdfUrl ? (
          <iframe
            ref={iframeRef}
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="flex-1 w-full rounded-lg border border-gray-200"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
            {error ? 'Failed to generate invoice. Please try again.' : 'Failed to load preview.'}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-between items-center gap-3 border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400">Preview uses your Invoice Design settings</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {pdfUrl && (
            <Button variant="outline" onClick={() => window.open(pdfUrl)}>
              <FileText className="h-4 w-4 mr-2" />
              Open PDF
            </Button>
          )}
          {pdfUrl && (
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
