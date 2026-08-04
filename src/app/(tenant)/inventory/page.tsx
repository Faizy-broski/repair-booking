'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Plus, Search, AlertTriangle, Upload, Download, CheckCircle2, Package, Boxes, TrendingDown, ShoppingCart, Edit2, Trash2, Layers, X, ExternalLink, Filter, ChevronDown, RefreshCw, Barcode, MoreVertical, Copy, ShoppingBag, Percent, Loader2, Archive, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/shared/data-table'
import { Select } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ScanButton } from '@/components/scanner/scan-button'
import { ScannerModal } from '@/components/scanner/scanner-modal'
import { BarcodeModal } from '@/components/inventory/barcode-modal'
import { BulkBarcodeModal } from '@/components/inventory/bulk-barcode-modal'

interface ProductRow {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  imei: string | null
  selling_price: number
  cost_price: number | null
  next_batch_cost: number | null
  active_discount: { discount_price: number; quantity_remaining: number } | null
  has_variant_discount?: boolean
  is_service: boolean | null
  is_serialized: boolean | null
  is_draft: boolean | null
  has_variants: boolean | null
  variant_count: number
  valuation_method: string | null
  on_hand: number
  low_stock_alert: number | null
  item_type?: string | null
  part_type?: string | null
  categories?: { name: string } | null
  brands?: { name: string } | null
  suppliers?: { name: string } | null
  service_devices?: { name: string } | null
}

interface ProductVariant {
  id: string; name: string; sku: string | null; barcode?: string | null; selling_price: number
  cost_price: number | null; attributes: Record<string, string>
  stock?: number | null
  active_discount?: { discount_price: number; quantity_remaining: number } | null
}

interface Category { id: string; name: string }
interface Brand { id: string; name: string }
interface Supplier { id: string; name: string }

interface ProductStats {
  stockRetailValue: number
  stockCostValue: number
  lowStockCount: number
  inPoCount: number
  customerBoughtCount: number
}

function RowActionsMenu({
  productId,
  onDelete,
  onDuplicate,
  duplicating,
  showDiscount,
  hasActiveDiscount,
  onPutOnSale,
  onMoveToBin,
  onReturnToSupplier,
}: {
  productId: string
  onDelete: () => void
  onDuplicate: () => void
  duplicating?: boolean
  showDiscount?: boolean
  hasActiveDiscount?: boolean
  onPutOnSale?: () => void
  onMoveToBin: () => void
  onReturnToSupplier: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + window.scrollY + 4, left: r.right + window.scrollX - 144 })
    setOpen((v) => !v)
  }

  return (
    <div>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={duplicating}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-800 hover:bg-gray-100 hover:text-black transition-colors disabled:opacity-60"
        title={duplicating ? 'Duplicating…' : 'More actions'}
      >
        {duplicating
          ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-teal" />
          : <MoreVertical className="h-5 w-5" />
        }
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <Link
            href={`/inventory/${productId}`}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </Link>
          <button
            onClick={() => { onDuplicate(); setOpen(false) }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          {showDiscount && (
            <button
              onClick={() => { onPutOnSale?.(); setOpen(false) }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-teal-700 hover:bg-teal-50"
            >
              <Percent className="h-3.5 w-3.5" />
              {hasActiveDiscount ? 'Edit Sale Price' : 'Put on Sale'}
            </button>
          )}
          <button
            onClick={() => { onMoveToBin(); setOpen(false) }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
          >
            <Archive className="h-3.5 w-3.5" />
            Move to Bin
          </button>
          <button
            onClick={() => { onReturnToSupplier(); setOpen(false) }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Return to Supplier
          </button>
          <button
            onClick={() => { onDelete(); setOpen(false) }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

function DiscountModal({
  product, variant, branchId, onClose, onSaved,
}: {
  product: ProductRow | null
  variant?: ProductVariant | null
  branchId: string | undefined
  onClose: () => void
  onSaved: () => void
}) {
  // A variant target overrides the product's own on-hand/price/discount —
  // a has_variants product's own base row is never discounted directly.
  const onHand = variant ? (variant.stock ?? 0) : (product?.on_hand ?? 0)
  const sellingPrice = variant ? variant.selling_price : (product?.selling_price ?? 0)
  const existing = variant ? (variant.active_discount ?? null) : (product?.active_discount ?? null)
  const targetName = variant ? `${product?.name} – ${variant.name}` : product?.name
  const [quantity, setQuantity] = useState('')
  const [discountPrice, setDiscountPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [ending, setEnding] = useState(false)

  useEffect(() => {
    if (!product) return
    setQuantity(existing ? String(existing.quantity_remaining) : '')
    setDiscountPrice(existing ? String(existing.discount_price) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, variant?.id])

  if (!product || !branchId) return null

  async function handleSave() {
    const qty = parseInt(quantity)
    const price = parseFloat(discountPrice)
    if (!qty || qty < 1) { toast.error('Enter a quantity to discount.'); return }
    if (qty > onHand) { toast.error(`Only ${onHand} on hand.`); return }
    if (!price || price <= 0) { toast.error('Enter a discount price.'); return }
    if (price >= sellingPrice) { toast.error('Discount price must be less than the normal selling price.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${product!.id}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId, variant_id: variant?.id, quantity: qty, discount_price: price }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to set discount')
      toast.success('Discount stock updated')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleEnd() {
    setEnding(true)
    try {
      const qs = new URLSearchParams({ branch_id: branchId! })
      if (variant?.id) qs.set('variant_id', variant.id)
      const res = await fetch(`/api/products/${product!.id}/discount?${qs}`, { method: 'DELETE' })
      if (!res.ok) { const json = await res.json(); throw new Error(json.error?.message ?? 'Failed to end discount') }
      toast.success('Discount ended — remaining stock is back to normal price')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setEnding(false)
    }
  }

  return (
    <Modal open={!!product} onClose={onClose} title={existing ? 'Edit Sale Price' : 'Put Stock on Sale'} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Mark part of <strong>{targetName}</strong>'s stock at a discount price. The rest stays at the normal price ({formatCurrency(sellingPrice)}) — cashiers choose which to sell at checkout.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Quantity to discount</label>
            <input
              type="number" min={1} max={onHand}
              className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={quantity}
              onChange={e => {
                const val = e.target.value
                if (val === '') { setQuantity(''); return }
                const num = parseInt(val, 10)
                setQuantity(!isNaN(num) && num > onHand ? String(onHand) : val)
              }}
              placeholder={`Max ${onHand}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Discount price</label>
            <input
              type="number" min={0} step="0.01"
              className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={discountPrice} onChange={e => setDiscountPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        {existing && (
          <p className="text-xs text-gray-400">{existing.quantity_remaining} unit(s) currently on sale at {formatCurrency(existing.discount_price)}.</p>
        )}
        <div className="flex gap-2">
          {existing && (
            <Button variant="outline" className="flex-1 text-red-600 hover:bg-red-50" onClick={handleEnd} loading={ending}>
              End Discount
            </Button>
          )}
          <Button className="flex-1 bg-teal-700 hover:bg-teal-800 text-white" onClick={handleSave} loading={saving}>
            {existing ? 'Update' : 'Put on Sale'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function BinModal({
  product, branchId, onClose, onSaved,
}: {
  product: ProductRow | null
  branchId: string | undefined
  onClose: () => void
  onSaved: () => void
}) {
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [variantId, setVariantId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!product) return
    setVariantId('')
    setQuantity('')
    setReason('')
    if (product.has_variants && branchId) {
      setLoadingVariants(true)
      fetch(`/api/products/${product.id}/variants?branch_id=${branchId}`)
        .then((res) => res.json())
        .then((json) => setVariants(json.data ?? []))
        .finally(() => setLoadingVariants(false))
    } else {
      setVariants([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, branchId])

  if (!product || !branchId) return null

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null
  const onHand = product.has_variants ? (selectedVariant?.stock ?? 0) : (product.on_hand ?? 0)

  async function handleSubmit() {
    if (product!.has_variants && !variantId) { toast.error('Select a variant.'); return }
    const qty = parseInt(quantity, 10)
    if (!qty || qty < 1) { toast.error('Enter a quantity to move to the Bin.'); return }
    if (qty > onHand) { toast.error(`Only ${onHand} on hand.`); return }
    setSaving(true)
    try {
      const res = await fetch('/api/inventory/bin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id:  branchId,
          product_id: product!.id,
          variant_id: product!.has_variants ? variantId : undefined,
          quantity:   qty,
          reason:     reason || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to move item to Bin')
      toast.success('Moved to Bin')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!product} onClose={onClose} title="Move to Bin" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Move stock of <strong>{product.name}</strong> to the Bin as a 100% loss. It's removed from active inventory and can be restored later if this was a mistake.
        </p>
        {product.has_variants && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Variant</label>
            <select
              className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              disabled={loadingVariants}
            >
              <option value="">{loadingVariants ? 'Loading…' : 'Select variant…'}</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.stock ?? 0} on hand)</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Quantity to move to Bin</label>
          <input
            type="number" min={1} max={onHand || undefined}
            className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={quantity}
            onChange={(e) => {
              const val = e.target.value
              if (val === '') { setQuantity(''); return }
              const num = parseInt(val, 10)
              setQuantity(!isNaN(num) && onHand > 0 && num > onHand ? String(onHand) : val)
            }}
            placeholder={`Max ${onHand}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Reason (optional)</label>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Water damaged, screen cracked in storage"
          />
        </div>
        <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" onClick={handleSubmit} loading={saving}>
          <Archive className="h-4 w-4" /> Move to Bin
        </Button>
      </div>
    </Modal>
  )
}

function ReturnToSupplierModal({
  product, branchId, onClose, onSaved,
}: {
  product: ProductRow | null
  branchId: string | undefined
  onClose: () => void
  onSaved: (returnId: string) => void
}) {
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [variantId, setVariantId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!product) return
    setVariantId('')
    setQuantity('')
    setReason('')
    setSupplierId('')
    fetch('/api/suppliers').then((r) => r.json()).then((j) => setSuppliers(j.data ?? []))
    if (product.has_variants && branchId) {
      setLoadingVariants(true)
      fetch(`/api/products/${product.id}/variants?branch_id=${branchId}`)
        .then((res) => res.json())
        .then((json) => setVariants(json.data ?? []))
        .finally(() => setLoadingVariants(false))
    } else {
      setVariants([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, branchId])

  if (!product || !branchId) return null

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null
  const onHand = product.has_variants ? (selectedVariant?.stock ?? 0) : (product.on_hand ?? 0)
  const unitCost = product.has_variants ? (selectedVariant?.cost_price ?? 0) : (product.cost_price ?? 0)

  async function handleSubmit() {
    if (!supplierId) { toast.error('Select a supplier.'); return }
    if (product!.has_variants && !variantId) { toast.error('Select a variant.'); return }
    const qty = parseInt(quantity, 10)
    if (!qty || qty < 1) { toast.error('Enter a quantity to return.'); return }
    if (qty > onHand) { toast.error(`Only ${onHand} on hand.`); return }
    setSaving(true)
    try {
      const name = product!.has_variants && selectedVariant
        ? `${product!.name} – ${selectedVariant.name}`
        : product!.name
      const sku = product!.has_variants ? (selectedVariant?.sku ?? null) : product!.sku
      const res = await fetch(`/api/supplier-returns?branch_id=${branchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          items: [{
            product_id: product!.id,
            variant_id: product!.has_variants ? variantId : undefined,
            name,
            sku: sku ?? undefined,
            quantity: qty,
            unit_cost: unitCost,
            reason: reason || undefined,
          }],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to create return')
      toast.success('Draft return created — ship it from Damage Returns to update stock')
      onSaved(json.data.id)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!product} onClose={onClose} title="Return to Supplier" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Create a draft damage return for <strong>{product.name}</strong>. Stock is only deducted once you ship the return to the supplier.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Supplier</label>
          <select
            className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {product.has_variants && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Variant</label>
            <select
              className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              disabled={loadingVariants}
            >
              <option value="">{loadingVariants ? 'Loading…' : 'Select variant…'}</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.stock ?? 0} on hand)</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Quantity to return</label>
          <input
            type="number" min={1} max={onHand || undefined}
            className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={quantity}
            onChange={(e) => {
              const val = e.target.value
              if (val === '') { setQuantity(''); return }
              const num = parseInt(val, 10)
              setQuantity(!isNaN(num) && onHand > 0 && num > onHand ? String(onHand) : val)
            }}
            placeholder={`Max ${onHand}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Reason (e.g. water damaged, screen cracked)</label>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Water damaged, screen cracked in storage"
          />
        </div>
        <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white" onClick={handleSubmit} loading={saving}>
          <Undo2 className="h-4 w-4" /> Create Draft Return
        </Button>
      </div>
    </Modal>
  )
}

export default function InventoryPage() {
  const { activeBranch, isLoading: authLoading, verticalTemplateSlug } = useAuthStore()
  const isRetail = verticalTemplateSlug === 'retail-store'
  const isTyreShop = verticalTemplateSlug === 'mobile-tyre-fitting'
  // Simplified catalog (Category + Brand + Attributes, no Device Type/Model/
  // Part split) — shared by Retail and Mobile Tyre Fitting. Valuation Method
  // and "Put on Sale" stay isRetail-only below (tyre shops still do batch
  // costing; "Put on Sale" is a retail promo feature, not requested here).
  const useSimpleCatalog = isRetail || isTyreShop
  // Use the branch ID as a stable primitive — avoids re-running effects when
  // the layout refreshes the activeBranch object reference but the ID is the same.
  const branchId = activeBranch?.id ?? null
  const prevBranchIdRef = useRef<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()


  // URL-based page state
  const page = parseInt(searchParams.get('page') || '0', 10)

  const setPage = useCallback((newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, pathname, router])
  // Start in loading state — stays true until branchId is known and first
  // fetch completes. Prevents the DataTable from briefly rendering products
  // with on_hand=0 before the branch-aware fetch returns.
  const [pageSize, setPageSize] = useState(20)
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null)
  const [barcodeTarget, setBarcodeTarget] = useState<ProductRow | null>(null)
  const [discountTarget, setDiscountTarget] = useState<{ product: ProductRow; variant?: ProductVariant | null } | null>(null)
  const [binTarget, setBinTarget] = useState<ProductRow | null>(null)
  const [returnTarget, setReturnTarget] = useState<ProductRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'part'>('all')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [valuationFilter, setValuationFilter] = useState('')
  const [hideOutOfStock, setHideOutOfStock] = useState(false)
  const [lowStockOnly, setLowStockOnly] = useState(() => searchParams.get('low_stock') === 'true')

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showBulkBarcode, setShowBulkBarcode] = useState(false)

  // View Variants drawer
  const [variantDrawer, setVariantDrawer] = useState<ProductRow | null>(null)
  const [drawerVariants, setDrawerVariants] = useState<ProductVariant[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  // When branch changes, immediately flush stale product rows and reset page
  // so the DataTable never shows the previous branch's on_hand values.
  useEffect(() => {
    if (prevBranchIdRef.current !== null && prevBranchIdRef.current !== branchId) {
      setPage(0)
    }
    prevBranchIdRef.current = branchId
  }, [branchId, setPage])

  const queryClient = useQueryClient()

  // ── Products Query — fires immediately, table shows as soon as this returns ──
  const { data: productResponse, isLoading: loading } = useQuery({
    queryKey: ['inventory', branchId, page, pageSize, search, categoryFilter, brandFilter, supplierFilter, valuationFilter, hideOutOfStock, typeFilter, lowStockOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page + 1), limit: String(pageSize), branch_id: branchId!, include_drafts: 'true' })
      if (search) params.set('search', search)
      if (categoryFilter) params.set('category_id', categoryFilter)
      if (brandFilter) params.set('brand_id', brandFilter)
      if (supplierFilter) params.set('supplier_id', supplierFilter)
      if (valuationFilter) params.set('valuation', valuationFilter)
      if (hideOutOfStock) params.set('hide_out_of_stock', 'true')
      if (lowStockOnly) params.set('low_stock_only', 'true')
      if (typeFilter === 'product') params.set('item_type', 'product')
      if (typeFilter === 'part') params.set('item_type', 'part')

      const res = await fetch(`/api/products?${params}`)
      if (!res.ok) throw new Error('Failed to fetch products')
      return res.json()
    },
    enabled: !!branchId,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  const products = productResponse?.data ?? []
  const total = productResponse?.meta?.total ?? 0

  // ── Stats Query — fires in parallel with products as soon as branchId is known ──
  // Long staleTime means stats are NOT re-fetched on every filter/page change,
  // only on branch change or after mutations (add/delete product).
  const { data: stats } = useQuery({
    queryKey: ['inventory-stats', branchId],
    queryFn: async () => {
      const res = await fetch(`/api/products/stats?branch_id=${branchId}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json().then((j: any) => j.data ?? j)
    },
    enabled: !!branchId && !authLoading,
    staleTime: 15 * 60 * 1000,
  })
  // Reference data — also fires in parallel; cached forever until page reload
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => fetch('/api/categories').then(r => r.json()).then(j => j.data ?? []),
    enabled: !!branchId && !authLoading,
    staleTime: Infinity,
  })
  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['brands'],
    queryFn: async () => fetch('/api/brands').then(r => r.json()).then(j => j.data ?? []),
    enabled: !!branchId && !authLoading,
    staleTime: Infinity,
  })
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => fetch('/api/suppliers').then(r => r.json()).then(j => j.data ?? []),
    enabled: !!branchId && !authLoading,
    staleTime: Infinity,
  })


  async function openVariantDrawer(product: ProductRow) {
    setVariantDrawer(product)
    setDrawerVariants([])
    setDrawerLoading(true)
    // branch_id is required for the API to populate per-variant stock and
    // active_discount — omitting it (as this used to) silently returned both
    // as null/empty for every variant.
    const qs = branchId ? `?branch_id=${branchId}` : ''
    const res = await fetch(`/api/products/${product.id}/variants${qs}`)
    const json = await res.json()
    setDrawerVariants(json.data ?? [])
    setDrawerLoading(false)
  }

  async function handleDuplicate(product: ProductRow) {
    setDuplicatingId(product.id)
    try {
      const qs = branchId ? `?branch_id=${branchId}` : ''
      const res = await fetch(`/api/products/${product.id}/duplicate${qs}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error?.message ?? 'Failed to duplicate product.')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      toast.success('Product duplicated as a draft.')
      router.push(`/inventory/${json.data.id}`)
    } finally {
      setDuplicatingId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const target = { ...deleteTarget }
    const invKey = ['inventory', branchId, page, pageSize, search, categoryFilter, brandFilter, supplierFilter, valuationFilter, hideOutOfStock, typeFilter, lowStockOnly] as const
    const prev = queryClient.getQueryData(invKey)
    setDeleteTarget(null)
    queryClient.setQueryData(invKey, (old: any) => {
      if (!old?.data) return old
      return {
        ...old,
        data: old.data.filter((p: ProductRow) => p.id !== target.id),
        meta: { ...old.meta, total: Math.max(0, old.meta.total - 1) },
      }
    })
    setDeleting(true)
    const qs = branchId ? `?branch_id=${branchId}` : ''
    const res = await fetch(`/api/products/${target.id}${qs}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`"${target.name}" deleted successfully`)
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
    } else {
      if (prev) queryClient.setQueryData(invKey, prev)
      toast.error('Failed to delete product. Please try again.')
    }
    setDeleting(false)
  }

  async function handleBulkDelete() {
    const toDelete = new Set(selectedIds)
    const invKey = ['inventory', branchId, page, pageSize, search, categoryFilter, brandFilter, supplierFilter, valuationFilter, hideOutOfStock, typeFilter, lowStockOnly] as const
    const prev = queryClient.getQueryData(invKey)
    setShowBulkDeleteConfirm(false)
    setSelectedIds(new Set())
    queryClient.setQueryData(invKey, (old: any) => {
      if (!old?.data) return old
      return {
        ...old,
        data: old.data.filter((p: ProductRow) => !toDelete.has(p.id)),
        meta: { ...old.meta, total: Math.max(0, old.meta.total - toDelete.size) },
      }
    })
    setBulkDeleting(true)
    const qs = branchId ? `?branch_id=${branchId}` : ''
    const results = await Promise.all([...toDelete].map((id) => fetch(`/api/products/${id}${qs}`, { method: 'DELETE' })))
    if (results.every(r => r.ok)) {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
    } else {
      if (prev) queryClient.setQueryData(invKey, prev)
      toast.error('Some products could not be deleted.')
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    }
    setBulkDeleting(false)
  }

  function clearFilters() {
    setSearch('')
    setCategoryFilter('')
    setBrandFilter('')
    setSupplierFilter('')
    setValuationFilter('')
    setHideOutOfStock(false)
    setLowStockOnly(false)
    setTypeFilter('all')
    setPage(0)
  }

  const hasActiveFilters = search || categoryFilter || brandFilter || supplierFilter || valuationFilter || hideOutOfStock || lowStockOnly || typeFilter !== 'all'

  const displayProducts = products

  const allOnPageSelected = displayProducts.length > 0 && displayProducts.every((p: ProductRow) => selectedIds.has(p.id))
  const someOnPageSelected = displayProducts.some((p: ProductRow) => selectedIds.has(p.id))

  const columns: ColumnDef<ProductRow>[] = [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={allOnPageSelected}
          ref={(el) => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected }}
          onChange={() => {
            if (allOnPageSelected) {
              setSelectedIds((prev) => { const n = new Set(prev); displayProducts.forEach((p: ProductRow) => n.delete(p.id)); return n })
            } else {
              setSelectedIds((prev) => { const n = new Set(prev); displayProducts.forEach((p: ProductRow) => n.add(p.id)); return n })
            }
          }}
          className="rounded border-gray-300 cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.original.id)}
          onChange={() => {
            setSelectedIds((prev) => {
              const n = new Set(prev)
              if (n.has(row.original.id)) n.delete(row.original.id)
              else n.add(row.original.id)
              return n
            })
          }}
          className="rounded border-gray-300 cursor-pointer"
        />
      ),
    },
    {
      accessorKey: 'name',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/inventory/${row.original.id}`} className="font-medium text-gray-900 text-sm hover:text-blue-600 transition-colors">
              {row.original.name}
            </Link>
            {row.original.is_draft && <Badge variant="warning" className="text-xs">Draft</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {row.original.sku && <span className="text-xs text-gray-400">SKU: {row.original.sku}</span>}
            {row.original.barcode && <span className="text-xs text-gray-400">· {row.original.barcode}</span>}
            {row.original.imei && <span className="text-xs text-gray-400">· IMEI: {row.original.imei}</span>}
          </div>
        </div>
      ),
    },
    {
      id: 'category',
      header: useSimpleCatalog ? 'Category' : 'Device Type',
      cell: ({ row }) => row.original.categories?.name
        ? <Badge variant="secondary">{row.original.categories.name}</Badge>
        : <span className="text-gray-300">—</span>,
    },
    {
      id: 'brand',
      header: 'Brand',
      cell: ({ row }) => row.original.brands?.name
        ? <span className="text-sm text-gray-600">{row.original.brands.name}</span>
        : <span className="text-gray-300">—</span>,
    },
    ...(!useSimpleCatalog ? [
      {
        id: 'model',
        header: 'Model',
        cell: ({ row }: any) => (row.original as any).service_devices?.name
          ? <span className="text-sm text-gray-600">{(row.original as any).service_devices.name}</span>
          : <span className="text-gray-300">—</span>,
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }: any) => {
          const t = row.original.item_type ?? (row.original.is_service ? 'part' : 'product')
          return (
            <div className="flex flex-col gap-1 items-start">
              <Badge variant={t === 'part' ? 'warning' : 'secondary'}>
                {t === 'part' ? 'Part' : 'Product'}
              </Badge>
              {row.original.part_type && (
                <span className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">
                  {row.original.part_type}
                </span>
              )}
            </div>
          )
        },
      },
    ] as any : []),
    {
      accessorKey: 'selling_price',
      header: 'Price',
      cell: ({ getValue }) => <span className="font-medium">{formatCurrency(getValue() as number)}</span>,
    },
    {
      accessorKey: 'cost_price',
      header: 'Unit Cost',
      cell: ({ getValue, row }) => {
        // Prefer the real next-to-sell FIFO batch cost when this product has
        // open batches — falls back to the raw cost_price field for products
        // that haven't been restocked since the FIFO rollout yet.
        const cost = row.original.next_batch_cost ?? (getValue() as number | null)
        const sell = row.original.selling_price
        const margin = cost && sell > 0 ? Math.round(((sell - cost) / sell) * 100) : null
        return (
          <div>
            <span className="text-sm">{cost != null ? formatCurrency(cost) : '—'}</span>
            {margin != null && <span className="ml-1.5 text-xs text-green-600">{margin}%</span>}
          </div>
        )
      },
    },
    {
      id: 'stock',
      header: 'Stock',
      cell: ({ row }) => {
        const p = row.original
        if (p.is_service) return <span className="text-xs text-gray-400">Service</span>
        if ((p.variant_count ?? 0) > 0 || p.has_variants) {
          return (
            <button
              onClick={() => openVariantDrawer(p)}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200 transition-colors"
            >
              <Layers className="h-3 w-3" />
              {p.variant_count ?? 0} Variants
            </button>
          )
        }
        const isLow = p.low_stock_alert != null && p.on_hand <= p.low_stock_alert && p.on_hand > 0
        const isOut = p.on_hand === 0
        return (
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-medium ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'}`}>
              {p.on_hand}
            </span>
            {isOut && <Badge variant="destructive" className="text-xs">Out</Badge>}
            {isLow && !isOut && <Badge variant="warning" className="text-xs">Low</Badge>}
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setBarcodeTarget(row.original)}
            className="rounded-md p-2 text-brand-teal bg-brand-teal/10 hover:bg-brand-teal/20 transition-colors"
            title="Generate or Print Barcode"
          >
            <Barcode className="h-5 w-5" />
          </button>
          <RowActionsMenu
            productId={row.original.id}
            onDelete={() => setDeleteTarget(row.original)}
            onDuplicate={() => handleDuplicate(row.original)}
            duplicating={duplicatingId === row.original.id}
            showDiscount={isRetail && !row.original.is_service}
            hasActiveDiscount={row.original.has_variants ? !!row.original.has_variant_discount : !!row.original.active_discount}
            onPutOnSale={() => row.original.has_variants ? openVariantDrawer(row.original) : setDiscountTarget({ product: row.original })}
            onMoveToBin={() => setBinTarget(row.original)}
            onReturnToSupplier={() => setReturnTarget(row.original)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex overflow-x-auto gap-1 border-b border-gray-200 pb-3 no-scrollbar">
        {[
          { label: 'Products',        href: '/inventory' },
          { label: 'Purchase Orders', href: '/inventory/purchase-orders' },
          { label: 'Suppliers',       href: '/inventory/suppliers' },
          { label: 'Bin',             href: '/inventory/bin' },
          { label: 'Damage Returns',  href: '/inventory/damage-returns' },
          // { label: 'Stock Count', href: '/inventory/stock-count' },  // disabled
          ...(useSimpleCatalog ? [
            { label: 'Categories',    href: '/inventory/categories' },
            { label: 'Attributes',    href: '/inventory/attributes' },
          ] : []),
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              (href === '/inventory' ? pathname === '/inventory' : pathname.startsWith(href))
                ? 'bg-brand-teal text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">{total} products found</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => window.open(`/api/products/export`, '_blank')}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => router.push('/inventory/bulk-upload')}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => router.push('/inventory/new')}>
            <Plus className="h-4 w-4" /> Add Item
          </Button>
          <ScanButton onClick={() => setScannerOpen(true)} label="Scan" />
          <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['inventory'] }); queryClient.invalidateQueries({ queryKey: ['inventory-stats'] }) }} title="Refresh data">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats from API */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          {
            label: 'Stock Retail Value',
            value: stats ? formatCurrency(stats.stockRetailValue) : null,
            icon: Boxes,
            iconColor: 'text-blue-600',
            iconBg: 'bg-blue-100',
            borderColor: 'bg-blue-600',
            subtitle: 'potential revenue',
          },
          {
            label: 'Stock Cost Value',
            value: stats ? formatCurrency(stats.stockCostValue) : null,
            icon: Package,
            iconColor: 'text-indigo-600',
            iconBg: 'bg-indigo-100',
            borderColor: 'bg-indigo-600',
            subtitle: 'invested capital',
          },
          {
            label: 'Low Stock Items',
            value: stats?.lowStockCount ?? null,
            icon: AlertTriangle,
            iconColor: 'text-amber-600',
            iconBg: 'bg-amber-100',
            borderColor: 'bg-amber-500',
            subtitle: 'needs reordering',
            onClick: () => {
              setLowStockOnly((prev: boolean) => !prev);
              setPage(0);
            },
            isActive: lowStockOnly
          },
          {
            label: 'In Purchase Order',
            value: stats?.inPoCount ?? null,
            icon: ShoppingCart,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-100',
            borderColor: 'bg-emerald-500',
            subtitle: 'incoming stock',
          },
          {
            label: 'Customer Bought',
            value: stats?.customerBoughtCount ?? null,
            icon: ShoppingBag,
            iconColor: 'text-purple-600',
            iconBg: 'bg-purple-100',
            borderColor: 'bg-purple-500',
            subtitle: 'sourced from customers',
          },
        ].map((s: any) => {
          const Icon = s.icon
          return (
            <div 
              key={s.label} 
              onClick={s.onClick}
              className={`relative overflow-hidden rounded-xl border bg-white pb-4 pt-4 sm:pt-5 px-4 sm:px-5 shadow-sm ${s.onClick ? 'cursor-pointer hover:shadow-md transition-all' : ''} ${s.isActive ? 'border-amber-500 ring-1 ring-amber-500' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-gray-500 truncate">{s.label}</p>
                  {s.value !== null ? (
                    <p className="mt-2 text-base sm:text-xl lg:text-2xl font-bold text-gray-900 break-words leading-tight" title={String(s.value)}>{s.value}</p>
                  ) : (
                    <div className="mt-2 h-8 w-24 rounded bg-gray-100 animate-pulse" />
                  )}
                </div>
                <div className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl ${s.iconBg}`}>
                  <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${s.iconColor}`} />
                </div>
              </div>
              {s.value !== null ? (
                <p className={`mt-2 sm:mt-3 text-[10px] sm:text-xs font-medium truncate ${s.iconColor}`}>
                  {s.subtitle}
                </p>
              ) : (
                <div className="mt-3 h-4 w-24 rounded bg-gray-100 animate-pulse" />
              )}
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${s.borderColor}`} />
            </div>
          )
        })}
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        {/* Simplified-catalog verticals (Retail, Tyre Fitting): category quick-filter pills */}
        {useSimpleCatalog && categories.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pb-1 border-b border-gray-100">
            <button
              onClick={() => { setCategoryFilter(''); setPage(0) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!categoryFilter ? 'bg-brand-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => { setCategoryFilter(categoryFilter === c.id ? '' : c.id); setPage(0) }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${categoryFilter === c.id ? 'bg-brand-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Row 1: search + type tabs + advanced toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder={useSimpleCatalog ? 'Search by name, SKU, barcode...' : 'Search by name, SKU, barcode, IMEI...'}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          {!useSimpleCatalog && (
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
              {(['all', 'product', 'part'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setTypeFilter(f); setPage(0) }}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${typeFilter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {f === 'all' ? 'All' : f === 'product' ? 'Products' : 'Parts'}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${showAdvancedFilters ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Filter className="h-4 w-4" />
            Filters
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
            {hasActiveFilters && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Clear filters
            </button>
          )}
        </div>

        {/* Row 2: advanced filters */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{useSimpleCatalog ? 'Category' : 'Device Type / Category'}</label>
              <Select
                options={[{ value: '', label: 'All Categories' }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
                value={categoryFilter}
                onValueChange={(v) => { setCategoryFilter(v); setPage(0) }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
              <Select
                options={[{ value: '', label: 'All Brands' }, ...brands.map(b => ({ value: b.id, label: b.name }))]}
                value={brandFilter}
                onValueChange={(v) => { setBrandFilter(v); setPage(0) }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Supplier</label>
              <Select
                options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
                value={supplierFilter}
                onValueChange={(v) => { setSupplierFilter(v); setPage(0) }}
              />
            </div>
            {!isRetail && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Valuation Method</label>
                <Select
                  options={[
                    { value: '', label: 'All Methods' },
                    { value: 'weighted_average', label: 'Weighted Average' },
                    { value: 'fifo', label: 'FIFO' },
                    { value: 'lifo', label: 'LIFO' },
                  ]}
                  value={valuationFilter}
                  onValueChange={(v) => { setValuationFilter(v); setPage(0) }}
                />
              </div>
            )}
            <div className="flex items-end pb-1 gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideOutOfStock}
                  onChange={(e) => { setHideOutOfStock(e.target.checked); setPage(0) }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Hide out of stock</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => { setLowStockOnly(e.target.checked); setPage(0) }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Low stock</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <span className="text-sm font-medium text-red-700">{selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected</span>
          <Button size="sm" variant="outline" onClick={() => setShowBulkBarcode(true)}>
            <Barcode className="h-4 w-4" /> Print Barcodes
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setShowBulkDeleteConfirm(true)}>
            <Trash2 className="h-4 w-4" /> Delete selected
          </Button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
            Clear selection
          </button>
        </div>
      )}

      <DataTable
        data={displayProducts}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No products yet. Click Add Product to get started!"
      />

      {/* Bulk Delete Confirm Modal */}
      <Modal open={showBulkDeleteConfirm} onClose={() => !bulkDeleting && setShowBulkDeleteConfirm(false)} title="Delete Products" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{selectedIds.size} product{selectedIds.size !== 1 ? 's' : ''}</strong>? Stock movement history is preserved.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleBulkDelete} loading={bulkDeleting}>
              {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} title="Delete Product" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will hide it from the POS and inventory. Stock movements history is preserved.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete} loading={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Variants Drawer */}
      {variantDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={() => setVariantDrawer(null)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
            {/* Brand accent bar */}
            <div className="h-1.5 w-full bg-brand-teal" />
            
            <div className="flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal-light/50 border border-brand-teal/10 text-brand-teal">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 tracking-tight flex items-center gap-2">
                    {variantDrawer.name}
                    {drawerLoading && <Loader2 className="h-4 w-4 animate-spin text-brand-teal" />}
                  </h2>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">
                    {drawerLoading ? 'Loading variants...' : `${drawerVariants.length} variant${drawerVariants.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/inventory/${variantDrawer.id}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  title="Open product"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <button onClick={() => setVariantDrawer(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
              {drawerLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-teal mb-6" />
                  <div className="w-full space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-32 w-full animate-pulse rounded-2xl bg-gray-200" />
                    ))}
                  </div>
                </div>
              ) : drawerVariants.length === 0 ? (
                <div className="py-20 text-center text-sm text-gray-400 flex flex-col items-center">
                  <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <Layers className="h-6 w-6 text-gray-300" />
                  </div>
                  No variants found
                </div>
              ) : (
                <div className="space-y-3">
                  {drawerVariants.map(v => {
                    const isSale = !!v.active_discount
                    return (
                      <div
                        key={v.id}
                        className={`rounded-2xl border bg-white p-4 transition-all hover:shadow-sm ${
                          isSale ? 'border-brand-teal/30 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-brand-teal truncate">{v.name}</p>
                            {Object.keys(v.attributes ?? {}).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {Object.entries(v.attributes ?? {}).map(([k, val]) => (
                                  <span key={k} className="rounded-md bg-brand-teal-light/20 text-brand-teal px-1.5 py-0.5 text-[10px] font-medium">
                                    {k}: {val}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {isRetail && (
                              <button
                                onClick={() => setDiscountTarget({ product: variantDrawer!, variant: v })}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] bg-brand-teal text-white hover:bg-brand-teal/90 shadow-sm"
                              >
                                <Percent className="h-3.5 w-3.5" />
                                {isSale ? 'Edit Sale' : 'Put on Sale'}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Barcode</p>
                            <p className="text-sm font-medium text-gray-700 truncate">{v.barcode ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Stock</p>
                            <p className="text-sm font-bold text-gray-900">{v.stock ?? '—'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Price</p>
                            {isSale ? (
                              <div className="flex flex-col items-end leading-tight">
                                <span className="text-base font-extrabold text-brand-teal">{formatCurrency(v.active_discount!.discount_price)}</span>
                                <span className="text-[10px] font-medium text-gray-400 line-through mt-0.5">{formatCurrency(v.selling_price)}</span>
                              </div>
                            ) : (
                              <span className="text-base font-bold text-brand-teal">{formatCurrency(v.selling_price)}</span>
                            )}
                          </div>
                        </div>

                        {isSale && (
                          <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-brand-teal-light/40 px-3 py-2 text-xs font-semibold text-brand-teal border border-brand-teal/10">
                            <Percent className="h-3.5 w-3.5" />
                            {v.active_discount!.quantity_remaining} unit{v.active_discount!.quantity_remaining !== 1 ? 's' : ''} left at sale price
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            <div className="border-t border-gray-100 bg-white p-4">
              <Link href={`/inventory/${variantDrawer.id}?tab=variants`} className="block">
                <Button variant="outline" className="w-full font-semibold border-gray-200 hover:border-brand-teal/50 hover:bg-brand-teal-light/20 hover:text-brand-teal transition-all">
                  Manage Variants
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        mode="inventory"
        branchId={branchId}
        onProductCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['inventory'] })
          queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
          setScannerOpen(false)
        }}
      />

      <BarcodeModal
        product={barcodeTarget}
        onClose={() => {
          setBarcodeTarget(null)
          queryClient.invalidateQueries({ queryKey: ['inventory'] })
        }}
      />

      <BulkBarcodeModal
        open={showBulkBarcode}
        products={displayProducts.filter((p: ProductRow) => selectedIds.has(p.id))}
        onClose={() => setShowBulkBarcode(false)}
      />

      <DiscountModal
        product={discountTarget?.product ?? null}
        variant={discountTarget?.variant}
        branchId={branchId ?? undefined}
        onClose={() => setDiscountTarget(null)}
        onSaved={() => {
          setDiscountTarget(null)
          queryClient.invalidateQueries({ queryKey: ['inventory'] })
          // POS caches products/variants for 5 minutes (staleTime) — without this,
          // a discount set here wouldn't show up in POS until that cache expired
          // or the user manually reloaded the page.
          queryClient.invalidateQueries({ queryKey: ['pos-products'] })
          queryClient.invalidateQueries({ queryKey: ['pos-variants'] })
          // The variant drawer's list is local state, not react-query — if a
          // variant was just discounted, re-fetch so the drawer reflects it.
          if (variantDrawer) openVariantDrawer(variantDrawer)
        }}
      />

      <BinModal
        product={binTarget}
        branchId={branchId ?? undefined}
        onClose={() => setBinTarget(null)}
        onSaved={() => {
          setBinTarget(null)
          queryClient.invalidateQueries({ queryKey: ['inventory'] })
          queryClient.invalidateQueries({ queryKey: ['pos-products'] })
          queryClient.invalidateQueries({ queryKey: ['pos-variants'] })
          if (variantDrawer) openVariantDrawer(variantDrawer)
        }}
      />

      <ReturnToSupplierModal
        product={returnTarget}
        branchId={branchId ?? undefined}
        onClose={() => setReturnTarget(null)}
        onSaved={(returnId) => {
          setReturnTarget(null)
          queryClient.invalidateQueries({ queryKey: ['inventory'] })
          router.push(`/inventory/damage-returns/${returnId}`)
        }}
      />

    </div>
  )
}
