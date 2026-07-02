'use client'
import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, Loader2 } from 'lucide-react'

interface Props {
  repair: any
  onClose: () => void
}

// The slip (CODE128 barcode + ticket number) is rendered server-side as a PDF
// with a fixed ~100x60mm page (/api/repairs/[id]/slip), so the preview and the
// print are the same document — no document.write popup, no print/close races.
export function RepairSlipModal({ repair, onClose }: Props) {
  const [pdfUrl, setPdfUrl]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)
  const iframeRef             = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!repair) return

    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch(`/api/repairs/${repair.id}/slip`)
        if (!res.ok) throw new Error(`Slip generation failed (${res.status})`)
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPdfUrl(objectUrl)
      } catch (err) {
        console.error('Failed to load slip PDF:', err)
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setPdfUrl(null)
    }
  }, [repair])

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
    <Modal open={!!repair} onClose={onClose} title="Repair Job Sheet Slip" size="md">
      <div className="flex flex-col h-[40vh]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium">Generating slip...</p>
          </div>
        ) : pdfUrl ? (
          <iframe
            ref={iframeRef}
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="flex-1 w-full rounded-lg border border-gray-200"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
            {error ? 'Failed to generate slip. Please try again.' : 'Failed to load preview.'}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-3 px-1 pb-1">
        <Button variant="outline" onClick={onClose}>Close</Button>
        {pdfUrl && (
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print Slip
          </Button>
        )}
      </div>
    </Modal>
  )
}
