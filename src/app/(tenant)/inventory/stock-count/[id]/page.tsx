'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, CheckCircle2, XCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { formatDate } from '@/lib/utils'

interface CountItem {
  id: string
  product_id: string
  system_qty: number
  counted_qty: number | null
  notes: string | null
  products?: { id: string; name: string; sku: string | null } | null
}

interface CountDetail {
  id: string; name: string; status: string; created_at: string; completed_at: string | null
  notes: string | null
  profiles?: { full_name: string } | null
  inventory_count_items: CountItem[]
}

export default function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [count,       setCount]       = useState<CountDetail | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [localQtys,   setLocalQtys]   = useState<Record<string, string>>({})
  const [saving,      setSaving]      = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [completing,  setCompleting]  = useState(false)

  async function fetchCount() {
    setLoading(true)
    const res  = await fetch(`/api/inventory/counts/${id}`)
    const json = await res.json()
    setCount(json.data)
    // Initialise local qty state from existing counted_qty
    const qtys: Record<string, string> = {}
    for (const item of json.data?.inventory_count_items ?? []) {
      qtys[item.id] = item.counted_qty != null ? String(item.counted_qty) : ''
    }
    setLocalQtys(qtys)
    setLoading(false)
  }

  useEffect(() => { fetchCount() }, [id])

  async function saveProgress() {
    if (!count) return
    setSaving(true)
    const updates = count.inventory_count_items
      .filter((item) => localQtys[item.id] !== '')
      .map((item) => ({
        item_id:     item.id,
        counted_qty: Number(localQtys[item.id]),
      }))

    await fetch(`/api/inventory/counts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    setSaving(false)
    fetchCount()
  }

  async function completeCount() {
    setCompleting(true)
    await saveProgress()
    await fetch(`/api/inventory/counts/${id}/complete`, { method: 'POST' })
    setConfirmOpen(false)
    setCompleting(false)
    fetchCount()
  }

  async function cancelCount() {
    if (!confirm('Cancel this stock count? No adjustments will be made.')) return
    await fetch(`/api/inventory/counts/${id}/cancel`, { method: 'POST' })
    fetchCount()
  }

  if (loading || !count) {
    return (
      <div className="space-y-4">
        {[1,2,3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}
      </div>
    )
  }

  const isEditable = count.status === 'in_progress'
  const filtered = count.inventory_count_items.filter((item) =>
    !search || item.products?.name.toLowerCase().includes(search.toLowerCase()) ||
    item.products?.sku?.toLowerCase().includes(search.toLowerCase())
  )
  const countedItems  = count.inventory_count_items.filter((i) => i.counted_qty != null)
  const variantItems  = count.inventory_count_items.filter(
    (i) => i.counted_qty != null && i.counted_qty !== i.system_qty
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{count.name}</h1>
            <Badge variant={count.status === 'completed' ? 'success' : count.status === 'cancelled' ? 'destructive' : 'warning'}>
              {count.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">
            Started {formatDate(count.created_at)}
            {count.profiles?.full_name && ` · ${count.profiles.full_name}`}
          </p>
        </div>
        {isEditable && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cancelCount}>
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={saveProgress} loading={saving}>
              <Save className="h-4 w-4" /> Save
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              <CheckCircle2 className="h-4 w-4" /> Complete & Adjust
            </Button>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Items', value: count.inventory_count_items.length },
          { label: 'Counted', value: `${countedItems.length} / ${count.inventory_count_items.length}` },
          { label: 'Variances', value: variantItems.length },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-400">{card.label}</p>
            <p className="text-lg font-semibold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="h-9 w-full rounded-lg border border-gray-300 pl-8 pr-3 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Items table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Product</th>
              <th className="px-4 py-2 text-right">System Qty</th>
              <th className="px-4 py-2 text-right">Counted Qty</th>
              <th className="px-4 py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((item) => {
              const counted  = localQtys[item.id] !== '' ? Number(localQtys[item.id]) : null
              const variance = counted != null ? counted - item.system_qty : null
              return (
                <tr key={item.id} className={`hover:bg-gray-50 ${variance !== null && variance !== 0 ? 'bg-yellow-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{item.products?.name}</p>
                    {item.products?.sku && <p className="text-xs text-gray-400">SKU: {item.products.sku}</p>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{item.system_qty}</td>
                  <td className="px-4 py-3 text-right">
                    {isEditable ? (
                      <input
                        type="number"
                        min="0"
                        value={localQtys[item.id] ?? ''}
                        onChange={(e) => setLocalQtys((q) => ({ ...q, [item.id]: e.target.value }))}
                        placeholder="—"
                        className="h-8 w-20 rounded-md border border-gray-300 px-2 text-right text-sm"
                      />
                    ) : (
                      <span className="text-gray-700">{item.counted_qty ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {variance !== null ? (
                      <span className={`font-medium ${variance > 0 ? 'text-green-600' : variance < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Confirm complete modal */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Complete Stock Count" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            This will apply inventory adjustments for all <strong>{variantItems.length}</strong> items with variances.
            This action cannot be undone.
          </p>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            Items not yet counted will be skipped and no adjustment will be made for them.
          </div>
          <Button className="w-full" onClick={completeCount} loading={completing}>
            Confirm & Apply Adjustments
          </Button>
        </div>
      </Modal>
    </div>
  )
}
