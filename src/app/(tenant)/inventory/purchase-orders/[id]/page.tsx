'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Package, CheckCircle2, XCircle, Pencil, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'

interface POItem {
  id: string; name: string; sku: string | null
  quantity_ordered: number; quantity_received: number; unit_cost: number
  product_id?: string | null
}
interface Supplier { id: string; name: string; email: string | null; phone: string | null }
interface PO {
  id: string; po_number: string; status: string; total: number
  supplier_id: string
  notes: string | null; expected_delivery_date: string | null; created_at: string
  suppliers?: Supplier | null
  purchase_order_items: POItem[]
}

const PO_STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  draft: 'default', pending: 'warning', in_progress: 'warning', received: 'success', cancelled: 'destructive',
}

export default function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { activeBranch } = useAuthStore()
  const [po,       setPo]       = useState<PO | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [grnModal, setGrnModal] = useState(false)
  const [grnQtys,  setGrnQtys]  = useState<Record<string, number>>({})
  const [grnNote,  setGrnNote]  = useState('')
  const [processing, setProcessing] = useState(false)
  const [cloning, setCloning]   = useState(false)

  // Edit state
  const [editOpen,      setEditOpen]      = useState(false)
  const [editSupplier,  setEditSupplier]  = useState('')
  const [editDate,      setEditDate]      = useState('')
  const [editNotes,     setEditNotes]     = useState('')
  const [editItems,     setEditItems]     = useState<Array<{ product_id?: string; name: string; sku: string; quantity_ordered: number; unit_cost: number }>>([])
  const [suppliers,     setSuppliers]     = useState<Array<{ id: string; name: string }>>([])
  const [saving,        setSaving]        = useState(false)

  async function fetchPO() {
    setLoading(true)
    const res  = await fetch(`/api/purchase-orders/${id}`)
    const json = await res.json()
    setPo(json.data)
    setLoading(false)
  }

  useEffect(() => { fetchPO() }, [id])

  function openGrn() {
    if (!po) return
    const defaults: Record<string, number> = {}
    po.purchase_order_items.forEach((item) => {
      defaults[item.id] = item.quantity_ordered - item.quantity_received
    })
    setGrnQtys(defaults)
    setGrnModal(true)
  }

  async function processGrn() {
    setProcessing(true)
    const items = Object.entries(grnQtys)
      .filter(([, qty]) => qty > 0)
      .map(([po_item_id, quantity_received]) => ({ po_item_id, quantity_received }))

    if (items.length === 0) { setProcessing(false); return }

    await fetch(`/api/purchase-orders/${id}/grn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, notes: grnNote || undefined }),
    })
    setGrnModal(false)
    fetchPO()
    setProcessing(false)
  }

  async function updateStatus(status: string) {
    await fetch(`/api/purchase-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchPO()
  }

  function openEdit() {
    if (!po) return
    setEditSupplier(po.supplier_id)
    setEditDate(po.expected_delivery_date ?? '')
    setEditNotes(po.notes ?? '')
    setEditItems(po.purchase_order_items.map((i) => ({
      product_id: i.product_id ?? undefined,
      name: i.name,
      sku: i.sku ?? '',
      quantity_ordered: i.quantity_ordered,
      unit_cost: i.unit_cost,
    })))
    // Fetch suppliers for the dropdown
    fetch('/api/suppliers').then((r) => r.json()).then((j) => setSuppliers(j.data ?? []))
    setEditOpen(true)
  }

  async function savePO() {
    const items = editItems.filter((i) => i.name.trim())
    if (items.length === 0) return
    setSaving(true)
    const res = await fetch(`/api/purchase-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: editSupplier || undefined,
        expected_delivery_date: editDate || null,
        notes: editNotes || null,
        items,
      }),
    })
    if (res.ok) {
      setEditOpen(false)
      fetchPO()
    }
    setSaving(false)
  }

  async function clonePO() {
    if (!activeBranch) return
    setCloning(true)
    const res = await fetch(`/api/purchase-orders/${id}/clone?branch_id=${activeBranch.id}`, { method: 'POST' })
    if (res.ok) {
      const json = await res.json()
      router.push(`/inventory/purchase-orders/${json.data.id}`)
    }
    setCloning(false)
  }

  if (loading || !po) {
    return (
      <div className="space-y-4">
        {[1,2,3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}
      </div>
    )
  }

  const canReceive = ['pending','in_progress'].includes(po.status)
  const canCancel  = ['draft','pending'].includes(po.status)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 font-mono">{po.po_number}</h1>
            <Badge variant={PO_STATUS_VARIANT[po.status] ?? 'default'}>{po.status.replace('_', ' ')}</Badge>
          </div>
          <p className="text-sm text-gray-500">{po.suppliers?.name} · Created {formatDate(po.created_at)}</p>
        </div>
        <div className="flex gap-2">
          {po.status === 'draft' && (
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={clonePO} loading={cloning}>
            <Copy className="h-4 w-4" /> Clone
          </Button>
          {po.status === 'draft' && (
            <Button variant="outline" size="sm" onClick={() => updateStatus('pending')}>
              Send to Supplier
            </Button>
          )}
          {canReceive && (
            <Button size="sm" onClick={openGrn}>
              <Package className="h-4 w-4" /> Receive Stock
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" onClick={() => updateStatus('cancelled')}>
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Value', value: formatCurrency(po.total) },
          { label: 'Expected Delivery', value: po.expected_delivery_date ? formatDate(po.expected_delivery_date) : '—' },
          { label: 'Supplier', value: po.suppliers?.name ?? '—' },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-400">{card.label}</p>
            <p className="font-semibold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="font-semibold text-gray-900 text-sm">Items</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Item</th>
              <th className="px-4 py-2 text-right">Ordered</th>
              <th className="px-4 py-2 text-right">Received</th>
              <th className="px-4 py-2 text-right">Unit Cost</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {po.purchase_order_items.map((item) => {
              const fullyReceived = item.quantity_received >= item.quantity_ordered
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{item.name}</p>
                    {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{item.quantity_ordered}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={fullyReceived ? 'text-green-600 font-medium' : 'text-gray-700'}>
                      {item.quantity_received}
                      {fullyReceived && <CheckCircle2 className="inline h-3.5 w-3.5 ml-1" />}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.unit_cost)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatCurrency(item.quantity_ordered * item.unit_cost)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(po.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {po.notes && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
          <p className="text-sm text-gray-600">{po.notes}</p>
        </div>
      )}

      {/* GRN Modal */}
      <Modal
        open={grnModal}
        onClose={() => setGrnModal(false)}
        title="Receive Stock (GRN)"
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Enter quantities received for each item. Stock will be updated automatically.</p>
          <div className="space-y-2">
            {po.purchase_order_items.map((item) => {
              const remaining = item.quantity_ordered - item.quantity_received
              return (
                <div key={item.id} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">Outstanding: {remaining}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={remaining}
                    value={grnQtys[item.id] ?? 0}
                    onChange={(e) => setGrnQtys((q) => ({ ...q, [item.id]: Number(e.target.value) }))}
                    className="h-8 w-20 rounded-md border border-gray-300 px-2 text-right text-sm"
                  />
                </div>
              )
            })}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} value={grnNote} onChange={(e) => setGrnNote(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <Button
            className="w-full"
            onClick={processGrn}
            loading={processing}
            disabled={Object.values(grnQtys).every((q) => q === 0)}
          >
            Confirm Receipt &amp; Update Stock
          </Button>
        </div>
      </Modal>

      {/* Edit Sheet (draft only) */}
      <InlineFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Purchase Order"
        side="right"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Supplier</label>
            <select
              value={editSupplier}
              onChange={(e) => setEditSupplier(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <Input
            label="Expected Delivery Date"
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Line Items</label>
              <button
                type="button"
                onClick={() => setEditItems((l) => [...l, { name: '', sku: '', quantity_ordered: 1, unit_cost: 0 }])}
                className="text-xs text-blue-600 hover:underline"
              >
                + Add row
              </button>
            </div>
            <div className="space-y-2">
              {editItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr,3rem,4.5rem,1.5rem] gap-1.5 items-end">
                  <input
                    placeholder="Item name"
                    value={item.name}
                    onChange={(e) => {
                      const u = [...editItems]; u[idx] = { ...u[idx], name: e.target.value }; setEditItems(u)
                    }}
                    className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                  />
                  <input
                    type="number" min="1" placeholder="Qty"
                    value={item.quantity_ordered}
                    onChange={(e) => {
                      const u = [...editItems]; u[idx] = { ...u[idx], quantity_ordered: Number(e.target.value) }; setEditItems(u)
                    }}
                    className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Cost"
                    value={item.unit_cost}
                    onChange={(e) => {
                      const u = [...editItems]; u[idx] = { ...u[idx], unit_cost: Number(e.target.value) }; setEditItems(u)
                    }}
                    className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                  />
                  {editItems.length > 1 && (
                    <button
                      onClick={() => setEditItems((l) => l.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 text-sm"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 flex justify-between text-sm">
            <span className="text-gray-500">Total</span>
            <span className="font-semibold text-gray-900">
              {formatCurrency(editItems.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0))}
            </span>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <Button className="w-full" onClick={savePO} loading={saving} disabled={!editItems.some((i) => i.name.trim())}>
            Save Changes
          </Button>
        </div>
      </InlineFormSheet>
    </div>
  )
}
