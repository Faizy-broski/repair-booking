'use client'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, Download, Loader2, X } from 'lucide-react'
import { PDFViewer, blobStream, pdf } from '@react-pdf/renderer'
import { InvoicePdf } from '@/components/pdf/invoice-pdf'
import type { InvoiceSettings } from '@/types/invoice-settings'
import type { RepairRow } from '@/app/(tenant)/repairs/page'

interface Props {
  open: boolean
  onClose: () => void
  repair: any
  settings: InvoiceSettings
  branch: any
}

export function RepairInvoiceModal({ open, onClose, repair, settings, branch }: Props) {
  const [instance, setInstance] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !repair) return

    async function generate() {
      setLoading(true)
      try {
        const customer = repair.customers
        const cf = (repair.custom_fields as any) ?? {}
        const items = [{
          description: `${repair.issue || 'Repair Service'} (${repair.device_type} ${repair.device_brand} ${repair.device_model})`,
          quantity: 1,
          unit_price: repair.estimated_cost ?? 0
        }]

        const doc = (
          <InvoicePdf
            settings={settings}
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
            subtotal={repair.estimated_cost ?? 0}
            discount={0}
            tax={0}
            total={repair.estimated_cost ?? 0}
            amountPaid={repair.deposit_paid ?? 0}
            notes={repair.notes}
          />
        )

        const blob = await pdf(doc).toBlob()
        const url = URL.createObjectURL(blob)
        setInstance(url)
      } catch (err) {
        console.error('Failed to generate PDF:', err)
      } finally {
        setLoading(false)
      }
    }

    generate()

    return () => {
      if (instance) URL.revokeObjectURL(instance)
    }
  }, [open, repair, settings, branch])

  if (!repair) return null

  return (
    <Modal open={open} onClose={onClose} title={`Invoice - ${repair.job_number}`} size="xl">
      <div className="flex flex-col h-[75vh]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium">Generating high-fidelity PDF...</p>
          </div>
        ) : instance ? (
          <iframe
            src={`${instance}#toolbar=0&navpanes=0&scrollbar=0`}
            className="flex-1 w-full rounded-lg border border-gray-200"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-500">
            Failed to load preview.
          </div>
        )}

        <div className="mt-4 flex justify-between items-center gap-3 border-t border-gray-100 pt-4">
          <div className="text-xs text-gray-400">
            Preview uses your custom Branding & Paper settings
          </div>
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
