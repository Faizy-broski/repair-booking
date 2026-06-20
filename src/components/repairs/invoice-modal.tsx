'use client'
import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, FileText, Loader2 } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { InvoicePdf } from '@/components/pdf/invoice-pdf'
import { RepairReceiptHtml } from '@/components/repairs/repair-receipt-html'
import { DEFAULT_INVOICE_SETTINGS, type InvoiceSettings } from '@/types/invoice-settings'

interface Props {
  open: boolean
  onClose: () => void
  repair: any
  settings: InvoiceSettings | null | undefined
  branch: any
}

interface ReceiptData {
  items: Array<{ description: string; quantity: number; unit_price: number }>
  invoiceTotal: number
  amountPaid: number
  mergedSettings: InvoiceSettings
  customerName: string
}

export function RepairInvoiceModal({ open, onClose, repair, settings, branch }: Props) {
  const [instance, setInstance] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!open || !repair) return

    if (!settings) {
      setLoading(true)
      return
    }

    let cancelled = false

    async function generate() {
      setLoading(true)
      try {
        const customer = repair.customers
        const cf = (repair.custom_fields as any) ?? {}

        let repairItems: any[] = []
        try {
          const res = await fetch(`/api/repairs/${repair.id}`)
          if (res.ok) {
            const full = await res.json()
            repairItems = Array.isArray(full.repair_items) ? full.repair_items : []
          }
        } catch { /* fallback to single-line item */ }

        const items = repairItems.length > 0
          ? repairItems.map((item: any) => ({
              description: item.name,
              quantity: item.quantity ?? 1,
              unit_price: item.unit_price ?? 0,
            }))
          : [{
              description: `${repair.issue || 'Repair Service'} (${repair.device_type} ${repair.device_brand} ${repair.device_model})`,
              quantity: 1,
              unit_price: repair.estimated_cost ?? 0,
            }]

        const itemsTotal = items.reduce((s: number, it: any) => s + it.quantity * it.unit_price, 0)
        const invoiceTotal = repairItems.length > 0 ? itemsTotal : (repair.estimated_cost ?? 0)
        const amountPaid = repair.deposit_paid ?? 0
        const customerName = customer ? `${customer.first_name} ${customer.last_name ?? ''}`.trim() : 'Walk-In'

        const mergedSettings: InvoiceSettings = {
          ...DEFAULT_INVOICE_SETTINGS,
          ...settings,
          logo_url: settings.logo_url ?? branch?.logo_url ?? null,
          show_logo: settings.show_logo !== false && !!(settings.logo_url ?? branch?.logo_url),
        }

        if (!cancelled) {
          setReceiptData({ items, invoiceTotal, amountPaid, mergedSettings, customerName })
        }

        const doc = (
          <InvoicePdf
            settings={mergedSettings}
            invoiceNumber={repair.job_number}
            status={repair.status}
            issuedAt={repair.created_at}
            dueAt={cf.due_date}
            businessName={branch?.name || 'Business'}
            branchName={branch?.name}
            branchAddress={branch?.address}
            branchPhone={branch?.phone}
            branchEmail={branch?.email}
            customerName={customerName}
            customerEmail={customer?.email}
            customerPhone={customer?.phone}
            customerAddress={customer?.address}
            items={items}
            subtotal={invoiceTotal}
            discount={0}
            tax={0}
            total={invoiceTotal}
            amountPaid={amountPaid}
            notes={repair.notes}
          />
        )

        const blob = await pdf(doc).toBlob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        setInstance(url)
      } catch (err) {
        if (!cancelled) console.error('Failed to generate PDF:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    generate()
    return () => { cancelled = true }
  }, [open, repair, settings, branch])

  useEffect(() => {
    if (!open) {
      setInstance(null)
      setLoading(false)
      setReceiptData(null)
    }
  }, [open])

  function handlePrint() {
    const ps = receiptData?.mergedSettings.paper_size ?? 'A4'
    const isReceipt = ps === 'Receipt80' || ps === 'Receipt58'

    if (isReceipt) {
      // Thermal: inject @page size, then defer window.print() by one frame so
      // Chrome has time to apply the stylesheet before opening the print dialog.
      const paperWidth = ps === 'Receipt58' ? '58mm' : '80mm'
      const styleEl = document.createElement('style')
      styleEl.id = 'receipt-page-size'
      styleEl.textContent = `@page { size: ${paperWidth} auto; margin: 0; }`
      document.head.appendChild(styleEl)
      setTimeout(() => {
        window.print()
        window.addEventListener('afterprint', () => {
          document.getElementById('receipt-page-size')?.remove()
        }, { once: true })
      }, 50)
    } else {
      // A4 / A5 / Letter: print the high-fidelity PDF already loaded in the iframe
      iframeRef.current?.contentWindow?.print()
    }
  }

  if (!repair) return null

  const isReceiptFormat = receiptData?.mergedSettings.paper_size === 'Receipt80'
    || receiptData?.mergedSettings.paper_size === 'Receipt58'

  const canPrint = isReceiptFormat ? !!receiptData : !!instance

  return (
    <Modal open={open} onClose={onClose} title={`Invoice - ${repair.job_number}`} size="xl" printable>
      {/* Screen-only: PDF preview — hidden during print */}
      <div className="flex flex-col h-[75vh] print:hidden">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium">Generating invoice...</p>
          </div>
        ) : instance ? (
          <iframe
            ref={iframeRef}
            src={`${instance}#toolbar=0&navpanes=0&scrollbar=0`}
            className="flex-1 w-full rounded-lg border border-gray-200"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
            Failed to load preview.
          </div>
        )}
      </div>

      {/* Print-only: HTML receipt for thermal sizes.
          No absolute positioning needed — Dialog.Content is print:static so
          this div is already in normal document flow, which lets the browser
          measure its height and compute @page { size: 80mm auto } correctly.
          Normal flow = exact page height = no extra blank paper at bottom. */}
      {receiptData && isReceiptFormat && (
        <div className="hidden print:block print:w-full print:h-auto print:overflow-visible print:bg-white print:m-0 print:p-0">
          <RepairReceiptHtml
            settings={receiptData.mergedSettings}
            invoiceNumber={repair.job_number}
            status={repair.status}
            issuedAt={repair.created_at}
            businessName={branch?.name || 'Business'}
            branchName={branch?.name}
            branchAddress={branch?.address}
            branchPhone={branch?.phone}
            customerName={receiptData.customerName}
            items={receiptData.items}
            subtotal={receiptData.invoiceTotal}
            total={receiptData.invoiceTotal}
            amountPaid={receiptData.amountPaid}
          />
        </div>
      )}

      {/* Bottom bar — hidden during print */}
      <div className="mt-4 flex justify-between items-center gap-3 border-t border-gray-100 pt-4 print:hidden">
        <p className="text-xs text-gray-400">Preview uses your Invoice Design settings</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {instance && (
            <Button variant="outline" onClick={() => window.open(instance)}>
              <FileText className="h-4 w-4 mr-2" />
              Open PDF
            </Button>
          )}
          {canPrint && (
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
