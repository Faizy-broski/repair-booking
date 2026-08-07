'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProductVariantPicker } from '@/components/inventory/product-variant-picker'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'

interface Supplier { id: string; name: string }
interface POItem {
  id: string; name: string; sku: string | null
  quantity_ordered: number; quantity_received: number; unit_cost: number
  product_id?: string | null; variant_id?: string | null
}
interface PO { id: string; po_number: string; status: string; supplier_id: string; purchase_order_items: POItem[] }

interface DraftItem {
  product_id?: string
  variant_id?: string
  po_item_id?: string
  name: string
  sku: string
  quantity: number
  unit_cost: number
  reason: string
  maxQuantity?: number
}

export default function NewDamageReturnPage() {
  const router = useRouter()
  const { activeBranch } = useAuthStore()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [pos, setPos] = useState<PO[]>([])
  const [poId, setPoId] = useState('')
  const [poDetail, setPoDetail] = useState<PO | null>(null)
  const [loadingPo, setLoadingPo] = useState(false)
  const [items, setItems] = useState<DraftItem[]>([])
  const [notes, setNotes] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/suppliers').then((r) => r.json()).then((j) => setSuppliers(j.data ?? []))
  }, [])

  useEffect(() => {
    setPoId('')
    setPoDetail(null)
    setPos([])
    if (!supplierId || !activeBranch) return
    const params = new URLSearchParams({ branch_id: activeBranch.id, supplier_id: supplierId, limit: '50' })
    fetch(`/api/purchase-orders?${params}`)
      .then((r) => r.json())
      .then((j) => {
        const list: PO[] = (j.data ?? []).filter((p: PO) => ['in_progress', 'received'].includes(p.status))
        setPos(list)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, activeBranch?.id])

  async function selectPo(id: string) {
    setPoId(id)
    setPoDetail(null)
    if (!id) return
    setLoadingPo(true)
    try {
      const res = await fetch(`/api/purchase-orders/${id}`)
      const json = await res.json()
      const po: PO = json.data
      setPoDetail(po)
      const received = po.purchase_order_items.filter((i) => i.quantity_received > 0)
      setItems(received.map((i) => ({
        product_id: i.product_id ?? undefined,
        variant_id: i.variant_id ?? undefined,
        po_item_id: i.id,
        name: i.name,
        sku: i.sku ?? '',
        quantity: 0,
        unit_cost: i.unit_cost,
        reason: '',
        maxQuantity: i.quantity_received,
      })))
    } finally {
      setLoadingPo(false)
    }
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems((list) => {
      const u = [...list]
      u[idx] = { ...u[idx], ...patch }
      return u
    })
  }

  function removeItem(idx: number) {
    setItems((list) => list.filter((_, i) => i !== idx))
  }

  const activeItems = items.filter((i) => i.quantity > 0)
  const total = activeItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0)

  async function handleSubmit() {
    if (!supplierId) { toast.error('Select a supplier.'); return }
    if (activeItems.length === 0) { toast.error('Add at least one item with a quantity.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/supplier-returns?branch_id=${activeBranch!.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          po_id: poId || undefined,
          notes: notes || undefined,
          items: activeItems.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id,
            po_item_id: i.po_item_id,
            name: i.name,
            sku: i.sku || undefined,
            quantity: i.quantity,
            unit_cost: i.unit_cost,
            reason: i.reason || undefined,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to create return')
      toast.success('Draft return created')
      router.push(`/inventory/damage-returns/${json.data.id}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
            <Undo2 className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Damage Return</h1>
            <p className="text-sm text-gray-500">Creates a draft — stock isn't deducted until you ship it</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Link to Purchase Order (optional)</label>
            <select
              value={poId}
              onChange={(e) => selectPo(e.target.value)}
              disabled={!supplierId || loadingPo}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm disabled:bg-gray-50"
            >
              <option value="">No linked PO</option>
              {pos.map((p) => (
                <option key={p.id} value={p.id}>{p.po_number} ({p.status.replace('_', ' ')})</option>
              ))}
            </select>
            {supplierId && pos.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">No received purchase orders for this supplier</p>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Line Items</label>
            {!poDetail && (
              <button type="button" onClick={() => setPickerOpen(true)} className="text-xs font-medium text-brand-teal hover:underline">
                + Add product
              </button>
            )}
          </div>

          {poDetail && (
            <p className="mb-2 text-xs text-gray-500">
              Items from {poDetail.po_number} — quantity capped at what was actually received.
            </p>
          )}

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr,4.5rem,4.5rem,1fr,1.5rem] gap-1.5 items-center">
                <div className="flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm truncate">
                  <span className="truncate">{item.name}</span>
                </div>
                <input
                  type="number" min={0} max={item.maxQuantity} placeholder="Qty"
                  value={item.quantity || ''}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    const capped = item.maxQuantity != null ? Math.min(val, item.maxQuantity) : val
                    updateItem(idx, { quantity: isNaN(capped) ? 0 : capped })
                  }}
                  className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                />
                <input
                  type="number" min={0} step="0.01" placeholder="Cost"
                  value={item.unit_cost}
                  onChange={(e) => updateItem(idx, { unit_cost: Number(e.target.value) })}
                  className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                />
                <input
                  type="text" placeholder="Reason (e.g. screen cracked)"
                  value={item.reason}
                  onChange={(e) => updateItem(idx, { reason: e.target.value })}
                  className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                />
                {!poDetail && (
                  <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500 text-sm">×</button>
                )}
              </div>
            ))}
            {items.length === 0 && (
              <p className="py-3 text-center text-xs text-gray-400">
                {poDetail ? 'No received items on this PO.' : 'Add a product to get started'}
              </p>
            )}
          </div>

          <ProductVariantPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            branchId={activeBranch?.id}
            onSelect={(product, variant) => {
              setItems((l) => [...l, {
                product_id: product.id,
                variant_id: variant?.id,
                name: variant ? `${product.name} – ${variant.name}` : product.name,
                sku: variant?.sku ?? '',
                quantity: 1,
                unit_cost: variant?.cost_price ?? product.cost_price ?? 0,
                reason: '',
              }])
            }}
          />
        </div>

        <div className="rounded-lg bg-gray-50 p-3 flex justify-between text-sm">
          <span className="text-gray-500">Total Value</span>
          <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <Button className="w-full" onClick={handleSubmit} loading={saving} disabled={!supplierId || activeItems.length === 0}>
          Create Draft Return
        </Button>
      </div>
    </div>
  )
}
