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
  const receiptRef = useRef<HTMLDivElement>(null)

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
      // Write receipt HTML into a fresh isolated iframe and print that.
      // window.print() is never called on the main page — the iframe's contentWindow.print()
      // opens a separate print dialog with only the receipt content.
      // @page { size: auto } works correctly here because the iframe document IS the receipt.
      if (!receiptRef.current) return
      const paperWidth = ps === 'Receipt58' ? '58mm' : '80mm'
      const html = receiptRef.current.innerHTML

      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;'
      document.body.appendChild(iframe)

      const doc = iframe.contentDocument!
      doc.open()
      doc.write(
        `<!DOCTYPE html><html><head>` +
        `<style>@page{size:${paperWidth} auto;margin:0;}` +
        `*{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}` +
        `body{margin:0;padding:0;}</style>` +
        `</head><body>${html}</body></html>`
      )
      doc.close()

      // Give the iframe time to load images before printing
      setTimeout(() => {
        iframe.contentWindow?.print()
        const cleanup = () => { if (document.body.contains(iframe)) document.body.removeChild(iframe) }
        iframe.contentWindow?.addEventListener('afterprint', cleanup, { once: true })
        setTimeout(cleanup, 5000)
      }, 300)
    } else {
      if (instance) window.open(instance)
    }
  }

  if (!repair) return null

  const isReceiptFormat = receiptData?.mergedSettings.paper_size === 'Receipt80'
    || receiptData?.mergedSettings.paper_size === 'Receipt58'

  const canPrint = isReceiptFormat ? !!receiptData : !!instance

  return (
    <Modal open={open} onClose={onClose} title={`Invoice - ${repair.job_number}`} size="xl">
      {/* PDF preview (screen only) */}
      <div className="flex flex-col h-[75vh]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium">Generating invoice...</p>
          </div>
        ) : instance ? (
          <iframe
            src={`${instance}#toolbar=0&navpanes=0&scrollbar=0`}
            className="flex-1 w-full rounded-lg border border-gray-200"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
            Failed to load preview.
          </div>
        )}
      </div>

      {/* Receipt HTML kept in DOM so receiptRef.current.innerHTML is readable.
          Never shown on screen — we copy it into an isolated iframe for printing. */}
      {receiptData && isReceiptFormat && (
        <div ref={receiptRef} className="hidden" aria-hidden="true">
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

      {/* Bottom bar */}
      <div className="mt-4 flex justify-between items-center gap-3 border-t border-gray-100 pt-4">
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
