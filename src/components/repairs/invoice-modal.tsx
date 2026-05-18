'use client'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, Loader2 } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { InvoicePdf } from '@/components/pdf/invoice-pdf'
import { DEFAULT_INVOICE_SETTINGS, type InvoiceSettings } from '@/types/invoice-settings'

interface Props {
  open: boolean
  onClose: () => void
  repair: any
  settings: InvoiceSettings | null | undefined
  branch: any
}

export function RepairInvoiceModal({ open, onClose, repair, settings, branch }: Props) {
  const [instance, setInstance] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !repair) return

    // Show spinner while settings are still loading from the server
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

        // Fetch full repair data with repair_items
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

        const mergedSettings: InvoiceSettings = {
          ...DEFAULT_INVOICE_SETTINGS,
          ...settings,
          logo_url: settings.logo_url ?? branch?.logo_url ?? null,
          show_logo: settings.show_logo !== false && !!(settings.logo_url ?? branch?.logo_url),
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
            customerName={customer ? `${customer.first_name} ${customer.last_name ?? ''}`.trim() : 'Walk-In'}
            customerEmail={customer?.email}
            customerPhone={customer?.phone}
            customerAddress={customer?.address}
            items={items}
            subtotal={invoiceTotal}
            discount={0}
            tax={0}
            total={invoiceTotal}
            amountPaid={repair.deposit_paid ?? 0}
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

    return () => {
      cancelled = true
    }
  }, [open, repair, settings, branch])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setInstance(null)
      setLoading(false)
    }
  }, [open])

  if (!repair) return null

  return (
    <Modal open={open} onClose={onClose} title={`Invoice - ${repair.job_number}`} size="xl">
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

        <div className="mt-4 flex justify-between items-center gap-3 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400">Preview uses your Invoice Design settings</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {instance && (
              <Button onClick={() => window.open(instance)}>
                <Printer className="h-4 w-4 mr-2" />
                Print / Open Full
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
