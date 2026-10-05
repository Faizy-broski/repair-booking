'use client'
import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, FileText, Loader2, Check } from 'lucide-react'
import { RepairReceiptHtml } from './repair-receipt-html'
import { printReceipt, previewReceiptHtml, type ReceiptPrintData } from './receipt-print'
import { SendDocumentActions } from '@/components/shared/send-document-actions'

interface Props {
  open: boolean
  onClose: () => void
  repair: any
  /** Show a "Job Created Successfully" banner above the preview — set when
   * this modal is auto-opened right after creating the job, rather than
   * opened manually later from the table's "Invoice" action. */
  justCreated?: boolean
}

// Paper sizes that print through the HTML popup path (thermal roll printers)
// instead of the PDF viewer — see receipt-print.ts for why.
const THERMAL_SIZES = ['Receipt80', 'Receipt58', 'Custom']

// Thermal receipts (Receipt80/58/Custom) are rendered client-side as HTML and
// printed via receipt-print.ts's dynamic @page sizing — @react-pdf output is
// not reliably honoured by the browser's native PDF print dialog on thermal
// printers (paper size silently falls back to Letter/A4 and shrinks the whole
// page). Standard paper sizes (A4/A5/Letter) keep using the server PDF.
export function RepairInvoiceModal({ open, onClose, repair, justCreated }: Props) {
  const [data, setData]       = useState<ReceiptPrintData | null>(null)
  const [pdfUrl, setPdfUrl]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)
  const iframeRef             = useRef<HTMLIFrameElement>(null)

  const isThermal = !!data && THERMAL_SIZES.includes(data.settings.paper_size)

  useEffect(() => {
    if (!open || !repair) return

    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch(`/api/repairs/${repair.id}/invoice-data`)
        if (!res.ok) throw new Error(`Invoice data failed (${res.status})`)
        const json = await res.json()
        const invoiceData = json.data as ReceiptPrintData
        if (cancelled) return
        setData(invoiceData)

        if (!THERMAL_SIZES.includes(invoiceData.settings.paper_size)) {
          const pdfRes = await fetch(`/api/repairs/${repair.id}/pdf`)
          if (!pdfRes.ok) throw new Error(`PDF generation failed (${pdfRes.status})`)
          const blob = await pdfRes.blob()
          if (cancelled) return
          objectUrl = URL.createObjectURL(blob)
          setPdfUrl(objectUrl)
        }
      } catch (err) {
        console.error('Failed to load invoice:', err)
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
    if (!open) { setData(null); setPdfUrl(null); setError(false); setLoading(false) }
  }, [open])

  function handlePrint() {
    if (isThermal && data) {
      printReceipt(data)
      return
    }
    const win = iframeRef.current?.contentWindow
    if (win) {
      win.focus()
      win.print()
    } else if (pdfUrl) {
      window.open(pdfUrl)
    }
  }

  if (!repair) return null

  const ready = isThermal ? !!data : !!pdfUrl

  return (
    <Modal open={open} onClose={onClose} title={`Invoice - ${repair.job_number}`} size="xl">
      {justCreated && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
            <Check className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">Job Created Successfully</p>
            <p className="text-xs text-green-600">Job #{repair.job_number} — share the invoice below, or close to keep going.</p>
          </div>
        </div>
      )}
      <div className="flex flex-col h-[75vh]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium">Generating invoice...</p>
          </div>
        ) : isThermal && data ? (
          <div className="flex-1 overflow-auto flex items-start justify-center rounded-lg border border-outline-variant bg-surface-container-low py-8">
            <div style={{ transform: 'scale(1.3)', transformOrigin: 'top center' }}>
              <div className="shadow-lg">
                <RepairReceiptHtml {...data} />
              </div>
            </div>
          </div>
        ) : pdfUrl ? (
          <iframe
            ref={iframeRef}
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="flex-1 w-full rounded-lg border border-outline-variant"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
            {error ? 'Failed to generate invoice. Please try again.' : 'Failed to load preview.'}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-between items-center gap-3 border-t border-outline-variant pt-4">
        <div className="flex flex-nowrap gap-2 overflow-x-auto">
          <Button variant="outline" className="whitespace-nowrap shrink-0" onClick={onClose}>Close</Button>
          {!isThermal && pdfUrl && (
            <Button
              className="whitespace-nowrap shrink-0 bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => window.open(pdfUrl)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Open PDF
            </Button>
          )}
          {isThermal && data && (
            <Button
              className="whitespace-nowrap shrink-0 bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => previewReceiptHtml(data)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Open
            </Button>
          )}
          {ready && (
            <SendDocumentActions
              whatsappUrl={`/api/repairs/${repair.id}/whatsapp-link`}
              emailUrl={`/api/repairs/${repair.id}/send-invoice-email`}
              phone={repair.customers?.phone}
              email={repair.customers?.email}
            />
          )}
          {ready && (
            <Button className="whitespace-nowrap shrink-0" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
