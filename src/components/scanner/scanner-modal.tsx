'use client'
import { useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  ScanLine, Camera, Usb, Package, ShoppingBag,
  AlertCircle, RotateCcw, Loader2, ExternalLink, CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { QuickCreateModal } from './quick-create-modal'
import { useHidScanner } from '@/hooks/use-hid-scanner'
import { useBarcodeLookup, type ProductWithStock, type QuickCreatePrefill } from '@/hooks/use-barcode-lookup'
import { formatCurrency } from '@/lib/utils'

// Fix #2: Dynamic import with SSR disabled — ZXing references window/navigator at module load
const WebcamScanner = dynamic(
  () => import('./webcam-scanner').then((m) => m.WebcamScanner),
  { ssr: false, loading: () => (
    <div className="flex h-48 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading camera…
    </div>
  ) }
)

type ScannerTab = 'webcam' | 'hid'
type ScanState = 'scanning' | 'looking' | 'found' | 'not_found' | 'error' | 'creating'

export interface ScannerModalProps {
  open: boolean
  onClose: () => void
  mode: 'inventory' | 'pos'
  branchId: string | null
  onAddToCart?: (product: ProductWithStock) => void
  onProductCreated?: () => void
}

export function ScannerModal({
  open,
  onClose,
  mode,
  branchId,
  onAddToCart,
  onProductCreated,
}: ScannerModalProps) {
  const [tab, setTab] = useState<ScannerTab>('webcam')
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [lastBarcode, setLastBarcode] = useState('')
  const [foundProduct, setFoundProduct] = useState<ProductWithStock | null>(null)
  const [prefill, setPrefill] = useState<QuickCreatePrefill | undefined>()
  const isProcessing = useRef(false)

  const { lookup, isLooking } = useBarcodeLookup(branchId)

  const handleScan = useCallback(async (code: string) => {
    // Guard against concurrent lookups (dedup at the orchestration level)
    if (isProcessing.current || !open) return
    isProcessing.current = true

    setLastBarcode(code)
    setScanState('looking')
    setFoundProduct(null)
    setPrefill(undefined)

    const result = await lookup(code)

    // Use the display barcode from the parsed result (e.g. SKU extracted from JSON)
    if (result.barcode !== code) setLastBarcode(result.barcode)

    if (result.status === 'found' && result.product) {
      setFoundProduct(result.product)
      setScanState('found')
    } else if (result.status === 'not_found') {
      setPrefill(result.prefill)
      setScanState('not_found')
    } else {
      toast.error(result.error ?? 'Lookup failed')
      setScanState('scanning')
    }
    isProcessing.current = false
  }, [open, lookup])

  function resetToScanning() {
    setScanState('scanning')
    setLastBarcode('')
    setFoundProduct(null)
    setPrefill(undefined)
    isProcessing.current = false
  }

  function handleClose() {
    resetToScanning()
    onClose()
  }

  function handleAddToCart() {
    if (!foundProduct) return
    onAddToCart?.(foundProduct)
    handleClose()
  }

  function handleProductCreated(product: ProductWithStock) {
    setScanState('scanning')
    setLastBarcode('')
    setFoundProduct(null)
    isProcessing.current = false
    onProductCreated?.()
    // In POS mode, offer to add to cart immediately after creation
    if (mode === 'pos') {
      onAddToCart?.(product)
      handleClose()
    }
  }

  // HID hook — always active while modal is open
  useHidScanner({ onScan: handleScan, enabled: open && scanState === 'scanning' })

  const isInventory = mode === 'inventory'

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title="Barcode / QR Scanner"
        description={isInventory ? 'Scan to look up or create a product in inventory.' : 'Scan to add a product to the cart.'}
        size="lg"
      >
        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="mb-4 flex overflow-hidden rounded-lg border border-gray-200">
          {(['webcam', 'hid'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); resetToScanning() }}
              className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-brand-teal text-white'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t === 'webcam' ? <Camera className="h-4 w-4" /> : <Usb className="h-4 w-4" />}
              {t === 'webcam' ? 'Webcam' : 'Physical Scanner'}
            </button>
          ))}
        </div>

        {/* ── Webcam tab ───────────────────────────────────────────────────── */}
        {tab === 'webcam' && scanState === 'scanning' && (
          <WebcamScanner
            active={open && tab === 'webcam' && scanState === 'scanning'}
            onResult={handleScan}
          />
        )}

        {/* ── HID / Physical scanner tab ───────────────────────────────────── */}
        {tab === 'hid' && scanState === 'scanning' && (
          <div className="flex flex-col items-center gap-4 rounded-xl bg-gray-50 border border-gray-200 px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 border-2 border-brand-teal">
              <ScanLine className="h-8 w-8 text-brand-teal" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Physical Scanner Ready</p>
              <p className="mt-1 text-sm text-gray-500">
                Point your USB barcode or QR scanner at a label and pull the trigger.
                <br />
                The code will be detected automatically.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-green-700">Listening for scanner input</span>
            </div>
          </div>
        )}

        {/* ── Looking up ───────────────────────────────────────────────────── */}
        {(scanState === 'looking' || isLooking) && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-brand-teal" />
            <p className="text-sm text-gray-500">
              Looking up <span className="font-mono font-medium text-gray-800">{lastBarcode}</span>…
            </p>
          </div>
        )}

        {/* ── Product found ────────────────────────────────────────────────── */}
        {scanState === 'found' && foundProduct && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wider text-green-600">Product Found</p>
                <p className="mt-1 text-base font-semibold text-gray-900 leading-snug">
                  {foundProduct.name}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  <span className="font-bold text-brand-teal">
                    {formatCurrency(foundProduct.selling_price)}
                  </span>
                  {foundProduct.sku && (
                    <span className="font-mono text-xs text-gray-400">SKU: {foundProduct.sku}</span>
                  )}
                  {foundProduct.on_hand !== undefined && !foundProduct.is_service && (
                    <span className={foundProduct.on_hand > 0 ? 'text-gray-500' : 'text-red-500'}>
                      {foundProduct.on_hand > 0 ? `${foundProduct.on_hand} in stock` : 'Out of stock'}
                    </span>
                  )}
                </div>
              </div>
              {foundProduct.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={foundProduct.image_url}
                  alt={foundProduct.name}
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                  {(foundProduct as any).item_type === 'part'
                    ? <Package className="h-6 w-6 text-gray-300" />
                    : <ShoppingBag className="h-6 w-6 text-gray-300" />}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={resetToScanning}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <RotateCcw className="h-4 w-4" /> Scan Again
              </button>
              <div className="flex items-center gap-2">
                <Link
                  href={`/inventory/${foundProduct.id}`}
                  onClick={handleClose}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {isInventory ? 'View Product' : 'Edit Product'}
                </Link>
                {mode === 'pos' && (
                  <Button size="sm" onClick={handleAddToCart}>
                    Add to Cart
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Product not found ────────────────────────────────────────────── */}
        {scanState === 'not_found' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-amber-600">No Product Found</p>
                <p className="mt-1 text-sm text-gray-700">
                  No product matched barcode{' '}
                  <span className="font-mono font-semibold">{lastBarcode}</span>.
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Create it now with the required fields — you can add full details later.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={resetToScanning}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <RotateCcw className="h-4 w-4" /> Scan Again
              </button>
              <Button size="sm" onClick={() => setScanState('creating')}>
                Create Product
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Quick Create — only mounted when creating so useForm gets the live
          barcode as its defaultValue, not the empty initial lastBarcode. */}
      {scanState === 'creating' && (
        <QuickCreateModal
          open
          onClose={() => setScanState('not_found')}
          barcode={lastBarcode}
          branchId={branchId}
          onCreated={handleProductCreated}
          prefill={prefill}
        />
      )}
    </>
  )
}
