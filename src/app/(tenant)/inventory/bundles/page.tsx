'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Package2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

interface BundleItem {
  id: string
  product_id: string
  quantity: number
  products?: { id: string; name: string; sku: string | null; selling_price: number } | null
}

interface Bundle {
  id: string; name: string; description: string | null; bundle_price: number
  sku: string | null; is_active: boolean; created_at: string
  product_bundle_items: BundleItem[]
}

interface ProductOption { id: string; name: string; sku: string | null; selling_price: number }

const emptyForm = {
  name: '', description: '', bundle_price: 0, sku: '', is_active: true,
  items: [{ product_id: '', quantity: 1 }] as { product_id: string; quantity: number }[],
}

export default function BundlesPage() {
  const { activeProfile } = useAuthStore()
  const [bundles,   setBundles]   = useState<Bundle[]>([])
  const [products,  setProducts]  = useState<ProductOption[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState<{ open: boolean; editing: Bundle | null }>({ open: false, editing: null })
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)

  const fetchData = useCallback(async () => {
    if (!activeProfile) return
    setLoading(true)
    const [bRes, pRes] = await Promise.all([
      fetch(`/api/inventory/bundles?business_id=${activeProfile.business_id}`),
      fetch(`/api/products?limit=200`),
    ])
    const [bJson, pJson] = await Promise.all([bRes.json(), pRes.json()])
    setBundles(bJson.data ?? [])
    setProducts(pJson.data ?? [])
    setLoading(false)
  }, [activeProfile])

  useEffect(() => { fetchData() }, [fetchData])

  function openModal(editing: Bundle | null = null) {
    if (editing) {
      setForm({
        name: editing.name,
        description: editing.description ?? '',
        bundle_price: editing.bundle_price,
        sku: editing.sku ?? '',
        is_active: editing.is_active,
        items: editing.product_bundle_items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      })
    } else {
      setForm(emptyForm)
    }
    setModal({ open: true, editing })
  }

  async function save() {
    if (!activeProfile) return
    setSaving(true)
    const { editing } = modal
    const payload = {
      ...form,
      business_id: activeProfile.business_id,
      items: form.items.filter((i) => i.product_id),
      sku: form.sku || undefined,
      description: form.description || undefined,
    }

    if (editing) {
      await fetch(`/api/inventory/bundles/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch('/api/inventory/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    setModal({ open: false, editing: null })
    fetchData()
    setSaving(false)
  }

  async function deleteBundle(id: string) {
    if (!confirm('Delete this bundle?')) return
    await fetch(`/api/inventory/bundles/${id}`, { method: 'DELETE' })
    fetchData()
  }

  const estimatedCost = form.items.reduce((sum, item) => {
    const p = products.find((p) => p.id === item.product_id)
    return sum + (p?.selling_price ?? 0) * item.quantity
  }, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Product Bundles</h1>
          <p className="text-sm text-gray-500">{bundles.length} bundles</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="h-4 w-4" /> New Bundle
        </Button>
      </div>

      <div className="divide-y rounded-xl border border-gray-200 bg-white">
        {loading ? (
          [1,2,3].map((i) => <div key={i} className="h-16 animate-pulse bg-gray-50 m-2 rounded-lg" />)
        ) : bundles.length === 0 ? (
          <div className="py-16 text-center">
            <Package2 className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">No bundles yet.</p>
          </div>
        ) : (
          bundles.map((b) => (
            <div key={b.id} className="px-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800">{b.name}</p>
                    {!b.is_active && <Badge variant="default">Inactive</Badge>}
                    {b.sku && <span className="text-xs text-gray-400">SKU: {b.sku}</span>}
                  </div>
                  {b.description && <p className="text-xs text-gray-400 mt-0.5">{b.description}</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {b.product_bundle_items.map((item) => (
                      <span key={item.id} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {item.products?.name} ×{item.quantity}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">{formatCurrency(b.bundle_price)}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openModal(b)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteBundle(b.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        title={modal.editing ? 'Edit Bundle' : 'New Bundle'}
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bundle Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Bundle Price *</label>
              <input
                type="number" min="0" step="0.01"
                value={form.bundle_price}
                onChange={(e) => setForm((f) => ({ ...f, bundle_price: Number(e.target.value) }))}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">SKU</label>
              <input
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Items</label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, items: [...f.items, { product_id: '', quantity: 1 }] }))}
                className="text-xs text-blue-600 hover:underline"
              >+ Add item</button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={item.product_id}
                    onChange={(e) => {
                      const u = [...form.items]; u[idx] = { ...u[idx], product_id: e.target.value }
                      setForm((f) => ({ ...f, items: u }))
                    }}
                    className="h-8 flex-1 rounded-md border border-gray-300 px-2 text-sm"
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                    ))}
                  </select>
                  <input
                    type="number" min="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const u = [...form.items]; u[idx] = { ...u[idx], quantity: Number(e.target.value) }
                      setForm((f) => ({ ...f, items: u }))
                    }}
                    className="h-8 w-16 rounded-md border border-gray-300 px-2 text-sm"
                  />
                  {form.items.length > 1 && (
                    <button onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="text-gray-400 hover:text-red-500">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {estimatedCost > 0 && (
            <div className="rounded-lg bg-gray-50 p-2 flex justify-between text-xs">
              <span className="text-gray-500">Individual total</span>
              <span className="text-gray-700">{formatCurrency(estimatedCost)}</span>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
            Active
          </label>
          <Button className="w-full" onClick={save} loading={saving} disabled={!form.name || form.bundle_price <= 0 || !form.items.some((i) => i.product_id)}>
            {modal.editing ? 'Save Changes' : 'Create Bundle'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
