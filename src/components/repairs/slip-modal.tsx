'use client'
import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, FileText, Loader2 } from 'lucide-react'
import { printSlip, previewSlipHtml } from './receipt-print'

interface Props {
  repair: any
  onClose: () => void
}

interface SlipData {
  jobNumber: string
  barcodeDataUrl: string
  paperSize: string
  customWidth: number | null
  // Full repair details for the complete thermal slip
  businessName: string
  branchAddress: string | null
  branchPhone: string | null
  customerName: string
  deviceLabel: string
  faults: string[]
  dueDate: string | null
  createdAt: string
  totalRepairCharges: number
  deposit: number
  remaining: number
}

// Paper sizes that print through the HTML popup path (thermal roll printers)
// instead of the PDF viewer — see receipt-print.ts for why.
const THERMAL_SIZES = ['Receipt80', 'Receipt58', 'Custom']

// Thermal receipts (Receipt80/58/Custom) are rendered client-side as a tiny
// barcode + ticket-ID tag and printed via receipt-print.ts's dynamic @page
// sizing — @react-pdf output is not reliably honoured by the browser's native
// PDF print dialog on thermal printers (paper size silently falls back to
// Letter/A4 and shrinks the whole page). Standard paper sizes keep the PDF.
export function RepairSlipModal({ repair, onClose }: Props) {
  const [data, setData]       = useState<SlipData | null>(null)
  const [pdfUrl, setPdfUrl]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)
  const iframeRef             = useRef<HTMLIFrameElement>(null)

  const isThermal = !!data && THERMAL_SIZES.includes(data.paperSize)

  useEffect(() => {
    if (!repair) return

    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch(`/api/repairs/${repair.id}/slip-data`)
        if (!res.ok) throw new Error(`Slip data failed (${res.status})`)
        const json = await res.json()
        const slipData = json.data as SlipData
        if (cancelled) return
        setData(slipData)

        if (!THERMAL_SIZES.includes(slipData.paperSize)) {
          const pdfRes = await fetch(`/api/repairs/${repair.id}/slip`)
          if (!pdfRes.ok) throw new Error(`Slip generation failed (${pdfRes.status})`)
          const blob = await pdfRes.blob()
          if (cancelled) return
          objectUrl = URL.createObjectURL(blob)
          setPdfUrl(objectUrl)
        }
      } catch (err) {
        console.error('Failed to load slip:', err)
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setData(null)
      setPdfUrl(null)
    }
  }, [repair])

  function handlePrint() {
    if (isThermal && data) {
      printSlip(data)
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
    <Modal open={!!repair} onClose={onClose} title="Repair Job Sheet Slip" size="md">
      <div className="flex flex-col h-[40vh]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium">Generating slip...</p>
          </div>
        ) : isThermal && data ? (
          <div className="flex-1 overflow-auto flex items-start justify-center rounded-lg border border-gray-200 bg-gray-50 py-8">
            <div style={{ transform: 'scale(1.3)', transformOrigin: 'top center' }}>
              <div className="mx-auto shadow-lg bg-white p-2" style={{ width: '240px', fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#000' }}>
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>{data.businessName}</div>
              {data.branchAddress && <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '2px' }}>{data.branchAddress}</div>}
              {data.branchPhone && <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '6px' }}>Tel: {data.branchPhone}</div>}
              <hr style={{ borderTop: '1px solid #000', margin: '4px 0' }} />
              <div><strong>Date:</strong> {data.dueDate ? new Date(data.dueDate).toLocaleDateString('en-GB') : new Date(data.createdAt).toLocaleDateString('en-GB')}</div>
              <div><strong>Ticket ID:</strong> T-{data.jobNumber}</div>
              <div><strong>Customer:</strong> {data.customerName}</div>
              <div><strong>Device:</strong> {data.deviceLabel}</div>
              {data.faults.length > 0 && <div><strong>Faults:</strong> {data.faults.join(', ')}</div>}
              <hr style={{ borderTop: '1px solid #000', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><strong>Repair Charges:</strong></span><span>£{data.totalRepairCharges.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><strong>Deposit:</strong></span><span>£{data.deposit.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><strong>Remaining:</strong></span><span>£{data.remaining.toFixed(2)}</span></div>
              <hr style={{ borderTop: '1px solid #000', margin: '4px 0' }} />
              <img src={data.barcodeDataUrl} alt="Barcode" style={{ width: '100%', marginTop: '6px' }} />
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
            {error ? 'Failed to generate slip. Please try again.' : 'Failed to load preview.'}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-3 px-1 pb-1">
        <Button variant="outline" onClick={onClose}>Close</Button>
        {!isThermal && pdfUrl && (
          <Button variant="outline" onClick={() => window.open(pdfUrl)}>
            <FileText className="h-4 w-4 mr-1.5" />
            Open PDF
          </Button>
        )}
        {isThermal && data && (
          <Button variant="outline" onClick={() => previewSlipHtml(data)}>
            <FileText className="h-4 w-4 mr-1.5" />
            Open
          </Button>
        )}
        {ready && (
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print Slip
          </Button>
        )}
      </div>
    </Modal>
  )
}
