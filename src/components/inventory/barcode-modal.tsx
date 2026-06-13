'use client'

import { useState, useCallback, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Printer, RefreshCw, Barcode } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { useQueryClient } from '@tanstack/react-query'

interface ProductRow {
  id: string
  name: string
  barcode: string | null
}

interface Props {
  product: ProductRow | null
  onClose: () => void
}

export function BarcodeModal({ product, onClose }: Props) {
  const [generating, setGenerating] = useState(false)
  const [currentBarcode, setCurrentBarcode] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    setCurrentBarcode(product?.barcode ?? null)
  }, [product])

  const barcodeRef = useCallback((node: SVGSVGElement | null) => {
    if (!node || !currentBarcode) return
    try {
      JsBarcode(node, currentBarcode, {
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
  }, [currentBarcode])

  async function handleGenerate() {
    if (!product) return
    setGenerating(true)
    try {
      // Generate a 12 digit random number for the barcode
      const generated = Math.floor(100000000000 + Math.random() * 900000000000).toString()
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: generated })
      })
      if (!res.ok) throw new Error('Failed to update product')
      setCurrentBarcode(generated)
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    } catch (err) {
      console.error('Failed to generate barcode', err)
    } finally {
      setGenerating(false)
    }
  }

  function handlePrint() {
    const slip = document.getElementById('barcode-print-content')
    if (!slip) return
    const w = window.open('', '_blank', 'width=400,height=300')
    if (!w) return
    w.document.write(`
      <html>
        <head>
          <title>Barcode – ${product?.name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; background: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
            @page { size: 60mm 40mm; margin: 0; }
            @media print { 
              body { -webkit-print-color-adjust: exact; margin: 0; }
              #barcode-print-content {
                border: none !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100%;
                height: 100%;
              }
            }
          </style>
        </head>
        <body>${slip.innerHTML}</body>
      </html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 300)
  }

  if (!product) return null

  return (
    <Modal open={!!product} onClose={onClose} title="Product Barcode" size="sm">
      <div className="flex flex-col items-center justify-center p-4 space-y-4">
        {currentBarcode ? (
          <>
            <div
              id="barcode-print-content"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <svg ref={barcodeRef} style={{ maxWidth: '100%' }} />
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#000',
                  marginTop: '4px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  maxWidth: '50mm'
                }}>
                  {product.name}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 w-full border border-dashed border-gray-200 rounded-lg">
            <Barcode className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4 px-4">This product doesn't have a barcode yet.</p>
            <Button onClick={handleGenerate} loading={generating}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Generate Barcode
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-3 px-1 pb-1">
        <Button variant="outline" onClick={onClose}>Close</Button>
        {currentBarcode && (
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print Label
          </Button>
        )}
      </div>
    </Modal>
  )
}
