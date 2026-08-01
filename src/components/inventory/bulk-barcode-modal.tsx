'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, AlertTriangle, Loader2, Barcode } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { useQueryClient } from '@tanstack/react-query'

interface SelectedProduct {
  id: string
  name: string
  barcode: string | null
  on_hand: number
  is_service?: boolean | null
  has_variants?: boolean | null
}

interface PrintItem {
  id: string
  name: string
  barcode: string
  quantity: number
}

interface SkippedItem {
  name: string
  reason: string
}

interface Props {
  open: boolean
  products: SelectedProduct[]
  onClose: () => void
}

function generateBarcodeValue() {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString()
}

export function BulkBarcodeModal({ open, products, onClose }: Props) {
  const [preparing, setPreparing] = useState(false)
  const [items, setItems] = useState<PrintItem[]>([])
  const [skipped, setSkipped] = useState<SkippedItem[]>([])
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function prepare() {
      setPreparing(true)
      const eligible: SelectedProduct[] = []
      const skippedList: SkippedItem[] = []

      for (const p of products) {
        if (p.is_service) skippedList.push({ name: p.name, reason: 'Service — no barcode' })
        else if (p.has_variants) skippedList.push({ name: p.name, reason: 'Has variants — print from the variant view' })
        else if (!p.on_hand || p.on_hand <= 0) skippedList.push({ name: p.name, reason: 'Out of stock' })
        else eligible.push(p)
      }

      // Generate + save a barcode for any eligible product that doesn't have one yet.
      let anyGenerated = false
      const withBarcodes = await Promise.all(eligible.map(async (p) => {
        if (p.barcode) return { ...p, barcode: p.barcode }
        const generated = generateBarcodeValue()
        try {
          const res = await fetch(`/api/products/${p.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: generated }),
          })
          if (!res.ok) throw new Error('Failed to generate barcode')
          anyGenerated = true
          return { ...p, barcode: generated }
        } catch {
          return { ...p, barcode: null }
        }
      }))

      if (cancelled) return

      const printItems: PrintItem[] = []
      for (const p of withBarcodes) {
        if (!p.barcode) {
          skippedList.push({ name: p.name, reason: 'Could not generate a barcode' })
          continue
        }
        printItems.push({ id: p.id, name: p.name, barcode: p.barcode, quantity: p.on_hand })
      }

      if (anyGenerated) queryClient.invalidateQueries({ queryKey: ['inventory'] })

      setItems(printItems)
      setSkipped(skippedList)
      setPreparing(false)
    }

    prepare()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const totalLabels = items.reduce((sum, i) => sum + i.quantity, 0)

  function handlePrint() {
    const content = document.getElementById('bulk-barcode-print-content')
    if (!content) return
    const w = window.open('', '_blank', 'width=600,height=600')
    if (!w) return
    w.document.write(`
      <html>
        <head>
          <title>Barcode Labels</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; background: #fff; }
            @page { size: 60mm 40mm; margin: 0; }
            .label {
              width: 60mm; height: 40mm;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              page-break-after: always;
            }
            .label-name {
              font-size: 18px; font-weight: 600; color: #000; margin-top: 6px;
              white-space: nowrap; text-overflow: ellipsis; overflow: hidden; max-width: 50mm;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 300)
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk Print Barcodes" size="lg">
      <div className="space-y-4">
        {preparing ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mb-3" />
            <p className="text-sm">Preparing barcodes…</p>
          </div>
        ) : (
          <>
            {items.length > 0 ? (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-left">Barcode</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="px-3 py-2 text-right">Labels</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td className="px-3 py-2 text-gray-900">{i.name}</td>
                        <td className="px-3 py-2 text-gray-500">{i.barcode}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{i.quantity}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{i.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg">
                <Barcode className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No labels to print for the selected products.</p>
              </div>
            )}

            {skipped.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">{skipped.length} product{skipped.length !== 1 ? 's' : ''} skipped</p>
                  <ul className="space-y-0.5">
                    {skipped.map((s, idx) => (
                      <li key={idx}>{s.name} — {s.reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {items.length > 0 && (
              <p className="text-sm text-gray-500">
                <strong className="text-gray-900">{totalLabels}</strong> label{totalLabels !== 1 ? 's' : ''} will be printed for <strong className="text-gray-900">{items.length}</strong> product{items.length !== 1 ? 's' : ''}.
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePrint} disabled={preparing || items.length === 0}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print {totalLabels > 0 ? totalLabels : ''} Label{totalLabels !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>

      {/* Off-screen render target for the print window — kept in the DOM (not display:none)
          so the browser actually lays out and rasterizes each <svg> before we copy its markup. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <div id="bulk-barcode-print-content">
          {items.flatMap((item) =>
            Array.from({ length: item.quantity }, (_, n) => (
              <div key={`${item.id}-${n}`} className="label">
                <svg
                  ref={(node) => {
                    if (!node) return
                    try {
                      JsBarcode(node, item.barcode, {
                        format: 'CODE128',
                        width: 2,
                        height: 50,
                        displayValue: true,
                        margin: 8,
                        background: '#ffffff',
                        lineColor: '#000000',
                      })
                    } catch (err) {
                      console.error('Barcode error:', err)
                    }
                  }}
                />
                <div className="label-name">{item.name}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
