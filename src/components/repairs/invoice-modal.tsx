'use client'
import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, FileText, Loader2, Mail } from 'lucide-react'
import { RepairReceiptHtml } from './repair-receipt-html'
import { printReceipt, previewReceiptHtml, type ReceiptPrintData } from './receipt-print'
import { toast } from 'sonner'

// lucide-react has no WhatsApp brand glyph — same path used elsewhere in the
// app (receipt-print.ts's footer social icons) for a consistent brand mark.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.36a9.85 9.85 0 0 0 4.62 1.17h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.64-1.03-5.13-2.9-7C17.17 3.03 14.68 2 12.04 2zm5.86 14.11c-.25.7-1.45 1.34-2 1.43-.5.08-1.14.11-1.84-.12-.42-.14-.96-.31-1.65-.61-2.9-1.26-4.8-4.17-4.94-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.77-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.72.81 2.02.96.3.15.5.22.57.35.07.13.07.75-.18 1.45z" />
    </svg>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  repair: any
}

// Paper sizes that print through the HTML popup path (thermal roll printers)
// instead of the PDF viewer — see receipt-print.ts for why.
const THERMAL_SIZES = ['Receipt80', 'Receipt58', 'Custom']

// Thermal receipts (Receipt80/58/Custom) are rendered client-side as HTML and
// printed via receipt-print.ts's dynamic @page sizing — @react-pdf output is
// not reliably honoured by the browser's native PDF print dialog on thermal
// printers (paper size silently falls back to Letter/A4 and shrinks the whole
// page). Standard paper sizes (A4/A5/Letter) keep using the server PDF.
export function RepairInvoiceModal({ open, onClose, repair }: Props) {
  const [data, setData]       = useState<ReceiptPrintData | null>(null)
  const [pdfUrl, setPdfUrl]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
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

  async function handleSendWhatsApp() {
    if (!repair) return
    setSendingWhatsApp(true)
    try {
      const res = await fetch(`/api/repairs/${repair.id}/whatsapp-link`)
      const json = await res.json()
      if (!res.ok || !json.data?.url) {
        toast.error(json.error?.message ?? 'Failed to prepare WhatsApp message.')
        return
      }
      window.open(json.data.url, '_blank')
    } finally {
      setSendingWhatsApp(false)
    }
  }

  async function handleSendEmail() {
    if (!repair) return
    setSendingEmail(true)
    try {
      const res = await fetch(`/api/repairs/${repair.id}/send-invoice-email`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.data?.sent) {
        toast.error(json.error?.message ?? 'Failed to send invoice email.')
        return
      }
      toast.success(`Invoice emailed to ${repair.customers?.email}.`)
    } finally {
      setSendingEmail(false)
    }
  }

  if (!repair) return null

  const ready = isThermal ? !!data : !!pdfUrl

  return (
    <Modal open={open} onClose={onClose} title={`Invoice - ${repair.job_number}`} size="xl">
      <div className="flex flex-col h-[75vh]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium">Generating invoice...</p>
          </div>
        ) : isThermal && data ? (
          <div className="flex-1 overflow-auto flex items-start justify-center rounded-lg border border-gray-200 bg-gray-50 py-8">
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
            className="flex-1 w-full rounded-lg border border-gray-200"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
            {error ? 'Failed to generate invoice. Please try again.' : 'Failed to load preview.'}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-between items-center gap-3 border-t border-gray-100 pt-4">
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
          {ready && !!repair.customers?.phone && (
            <Button
              variant="success"
              className="whitespace-nowrap shrink-0"
              loading={sendingWhatsApp}
              onClick={handleSendWhatsApp}
            >
              <WhatsAppIcon className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
          )}
          {ready && !!repair.customers?.email && (
            <Button
              className="whitespace-nowrap shrink-0 bg-blue-600 text-white hover:bg-blue-700"
              loading={sendingEmail}
              onClick={handleSendEmail}
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
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
