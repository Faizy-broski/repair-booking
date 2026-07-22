'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Check, X, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '@/lib/utils'

interface CostLayer {
  id: string
  quantity: number
  unit_cost: number
  selling_price: number | null
  received_at: string
  source_type: string
  variant_id: string | null
}

interface BatchManagerProps {
  productId: string
  variantId: string | null
  branchId: string | undefined
}

export function BatchManager({ productId, variantId, branchId }: BatchManagerProps) {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [adding, setAdding] = useState(false)
  const [newQty, setNewQty] = useState('')
  const [newCost, setNewCost] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const queryKey = ['inv-product-cost-layers', productId, branchId]

  const { data: allLayers, isLoading } = useQuery<CostLayer[]>({
    queryKey,
    queryFn: async () => {
      const branchParam = branchId ? `?branch_id=${branchId}` : ''
      const res = await fetch(`/api/products/${productId}/cost-layers${branchParam}`)
      const json = await res.json()
      return json.data ?? []
    },
    staleTime: 15_000,
    enabled: !!productId,
  })

  const layers = (allLayers ?? []).filter(l => l.variant_id === variantId)

  function invalidateAll() {
    qc.invalidateQueries({ queryKey })
    qc.invalidateQueries({ queryKey: ['product', productId] })
    qc.invalidateQueries({ queryKey: ['inv-product', productId] })
    qc.invalidateQueries({ queryKey: ['inventory'] })
  }

  function startEdit(layer: CostLayer) {
    setEditingId(layer.id)
    setEditQty(String(layer.quantity))
    setEditCost(String(layer.unit_cost))
    setEditPrice(layer.selling_price != null ? String(layer.selling_price) : '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(layerId: string) {
    const quantity = parseInt(editQty)
    const unitCost = parseFloat(editCost)
    if (isNaN(quantity) || quantity < 0) { toast.error('Enter a valid quantity.'); return }
    if (isNaN(unitCost) || unitCost < 0) { toast.error('Enter a valid cost price.'); return }
    setSaving(true)
    const res = await fetch(`/api/products/${productId}/cost-layers/${layerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity, unit_cost: unitCost,
        selling_price: editPrice ? parseFloat(editPrice) : null,
      }),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j?.error?.message || j?.message || 'Failed to update batch.'); return }
    setEditingId(null)
    invalidateAll()
    toast.success('Batch updated.')
  }

  async function deleteBatch(layer: CostLayer) {
    if (!confirm(`Remove this batch? This will subtract ${layer.quantity} unit${layer.quantity === 1 ? '' : 's'} from stock.`)) return
    const res = await fetch(`/api/products/${productId}/cost-layers/${layer.id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j?.error?.message || j?.message || 'Failed to delete batch.'); return }
    invalidateAll()
    toast.success('Batch removed.')
  }

  async function addBatch() {
    if (!branchId) { toast.error('Select a branch first.'); return }
    const quantity = parseInt(newQty)
    const unitCost = parseFloat(newCost)
    if (isNaN(quantity) || quantity <= 0) { toast.error('Enter a quantity greater than 0.'); return }
    if (isNaN(unitCost) || unitCost < 0) { toast.error('Enter a valid cost price.'); return }
    setSaving(true)
    const res = await fetch(`/api/products/${productId}/cost-layers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branchId, variant_id: variantId,
        quantity, unit_cost: unitCost,
        selling_price: newPrice ? parseFloat(newPrice) : null,
        note: 'Manual stock batch',
      }),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j?.error?.message || j?.message || 'Failed to add batch.'); return }
    setNewQty(''); setNewCost(''); setNewPrice(''); setAdding(false)
    invalidateAll()
    toast.success('Batch added.')
  }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading batches…</p>
      ) : layers.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center">
          <Layers className="mx-auto h-6 w-6 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No stock batches yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Received</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Quantity</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Cost Price</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Selling Price</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {layers.map((layer, i) => {
                const editing = editingId === layer.id
                return (
                  <tr key={layer.id} className={i === 0 ? 'bg-brand-teal-light/20' : ''}>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {formatDate(layer.received_at)}
                      {i === 0 && <span className="ml-1.5 rounded-full bg-brand-teal px-1.5 py-0.5 text-[10px] font-semibold text-white">Next to sell</span>}
                    </td>
                    {editing ? (
                      <>
                        <td className="px-3 py-2"><input type="number" min="0" value={editQty} onChange={e => setEditQty(e.target.value)} className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/30" /></td>
                        <td className="px-3 py-2"><input type="number" min="0" step="0.01" value={editCost} onChange={e => setEditCost(e.target.value)} className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/30" /></td>
                        <td className="px-3 py-2"><input type="number" min="0" step="0.01" placeholder="Optional" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/30" /></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => saveEdit(layer.id)} disabled={saving} className="rounded-md p-1.5 bg-brand-teal text-white hover:bg-brand-teal-dark transition-colors disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={cancelEdit} className="rounded-md p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium text-gray-800">{layer.quantity}</td>
                        <td className="px-3 py-2 text-gray-700">{formatCurrency(layer.unit_cost)}</td>
                        <td className="px-3 py-2 text-gray-700">{layer.selling_price != null ? formatCurrency(layer.selling_price) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => startEdit(layer)} className="rounded-md p-1.5 text-gray-400 hover:text-brand-teal hover:bg-brand-teal/10 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => deleteBatch(layer)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
            <input type="number" min="1" value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="0" className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price</label>
            <input type="number" min="0" step="0.01" value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="0.00" className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Selling Price</label>
            <input type="number" min="0" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0.00" className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30" />
          </div>
          <button type="button" onClick={addBatch} disabled={saving} className="rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-teal-dark transition-colors disabled:opacity-50">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:text-brand-teal-dark">
          <Plus className="h-3.5 w-3.5" /> Add batch
        </button>
      )}
    </div>
  )
}
