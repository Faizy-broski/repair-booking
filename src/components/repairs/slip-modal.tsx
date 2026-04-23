'use client'
// 1. Swap useEffect and useRef for useCallback
import { useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import JsBarcode from 'jsbarcode'

// ... [Keep your interfaces the same] ...

export function RepairSlipModal({ repair, onClose }: Props) {

  // 2. Use a callback ref. This fires exactly when the element attaches to the DOM.
  const barcodeRef = useCallback((node: SVGSVGElement | null) => {
    if (!node || !repair?.job_number) return;

    try {
      JsBarcode(node, repair.job_number, {
        format: 'CODE128',
        width: 2,
        height: 80,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch (err) {
      console.error('Barcode error:', err)
    }
  }, [repair?.job_number]); // Only re-run if the job number actually changes

  function handlePrint() {
    const slip = document.getElementById('repair-slip-content')
    if (!slip) return
    const w = window.open('', '_blank', 'width=400,height=300')
    if (!w) return
    w.document.write(`
      <html>
        <head>
          <title>Repair Slip – ${repair?.job_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
            @page { size: 100mm 60mm; margin: 4mm; }
            @media print { body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>${slip.innerHTML}</body>
      </html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 300)
  }

  if (!repair) return null

  return (
    <Modal open={!!repair} onClose={onClose} title="Repair Job Sheet Slip" size="md">
      <div className="flex justify-center p-4">
        <div
          id="repair-slip-content"
          style={{
            width: '100mm',
            minHeight: '60mm',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 16px',
            background: '#fff',
            border: '1px solid #e5e7eb'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            {/* 3. Change canvas to svg so it works with innerHTML printing */}
            <svg ref={barcodeRef} style={{ maxWidth: '100%' }} />

            <div style={{
              fontSize: '24px',
              fontWeight: '800',
              color: '#000',
              marginTop: '12px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              whiteSpace: 'nowrap'
            }}>
              Ticket ID: {repair.job_number}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-3 px-1 pb-1">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-1.5" />
          Print Slip
        </Button>
      </div>
    </Modal>
  )
}