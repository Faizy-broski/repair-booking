'use client'
import { useState, useEffect } from 'react'
import { Plus, Send, CheckCircle2, XCircle, Clock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { formatCurrency, formatDateTime } from '@/lib/utils'

interface EstimateItem {
  name: string
  quantity: number
  unit_price: number
  total: number
}

interface Estimate {
  id: string
  status: 'pending' | 'approved' | 'declined' | 'changes_requested'
  items: EstimateItem[]
  total: number
  customer_note: string | null
  sent_at: string | null
  responded_at: string | null
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  pending:           'bg-yellow-100 text-yellow-700',
  approved:          'bg-green-100 text-green-700',
  declined:          'bg-red-100 text-red-700',
  changes_requested: 'bg-orange-100 text-orange-700',
}

interface EstimatesPanelProps {
  repairId: string
  customerId: string
  branchId: string
}

export function EstimatesPanel({ repairId, customerId, branchId }: EstimatesPanelProps) {
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [lineItems, setLineItems] = useState<EstimateItem[]>([
    { name: '', quantity: 1, unit_price: 0, total: 0 },
  ])

  const estimateTotal = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)

  useEffect(() => {
    fetchEstimates()
  }, [repairId])

  async function fetchEstimates() {
    setLoading(true)
    const res = await fetch(`/api/repairs/${repairId}/estimates`)
    const json = await res.json()
    setEstimates(json.data ?? [])
    setLoading(false)
  }

  function updateLine(idx: number, patch: Partial<EstimateItem>) {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, ...patch }
        updated.total = updated.quantity * updated.unit_price
        return updated
      })
    )
  }

  function addLine() {
    setLineItems((prev) => [...prev, { name: '', quantity: 1, unit_price: 0, total: 0 }])
  }

  function removeLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function createEstimate() {
    const validItems = lineItems.filter((i) => i.name.trim() && i.unit_price > 0)
    if (validItems.length === 0) return
    setSaving(true)
    const res = await fetch(`/api/repairs/${repairId}/estimates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        branch_id: branchId,
        items: validItems,
        total: validItems.reduce((s, i) => s + i.total, 0),
      }),
    })
    if (res.ok) {
      setCreateOpen(false)
      setLineItems([{ name: '', quantity: 1, unit_price: 0, total: 0 }])
      fetchEstimates()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Estimates</h3>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Estimate
        </Button>
      </div>

      {loading ? (
        <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
      ) : estimates.length === 0 ? (
        <p className="text-sm text-gray-400">No estimates yet</p>
      ) : (
        <div className="space-y-2">
          {estimates.map((est) => (
            <div key={est.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[est.status]}`}>
                    {est.status.replace('_', ' ')}
                  </span>
                  <p className="mt-1 text-xs text-gray-400">{formatDateTime(est.created_at)}</p>
                </div>
                <span className="text-base font-bold text-gray-900">{formatCurrency(est.total)}</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {(est.items as EstimateItem[]).map((item, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-1 text-gray-700">{item.name}</td>
                      <td className="py-1 text-right text-gray-500">{item.quantity} × {formatCurrency(item.unit_price)}</td>
                      <td className="py-1 text-right font-medium">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {est.customer_note && (
                <p className="mt-2 text-xs text-gray-500 italic">"{est.customer_note}"</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create estimate modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Estimate" size="md">
        <div className="space-y-3">
          {/* Line items */}
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-1 text-xs font-medium text-gray-500">
              <div className="col-span-5">Item</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-3 text-right">Unit Price</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1" />
            </div>
            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-1">
                <input
                  value={item.name}
                  onChange={(e) => updateLine(idx, { name: e.target.value })}
                  placeholder="Description"
                  className="col-span-5 h-8 rounded border border-gray-200 px-2 text-sm focus:border-blue-400 focus:outline-none"
                />
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateLine(idx, { quantity: parseInt(e.target.value) || 1 })}
                  className="col-span-2 h-8 rounded border border-gray-200 px-2 text-center text-sm focus:border-blue-400 focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unit_price || ''}
                  onChange={(e) => updateLine(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="col-span-3 h-8 rounded border border-gray-200 px-2 text-right text-sm focus:border-blue-400 focus:outline-none"
                />
                <span className="col-span-1 text-right text-xs text-gray-600">
                  {item.total > 0 ? formatCurrency(item.total) : '—'}
                </span>
                <button onClick={() => removeLine(idx)} className="col-span-1 flex justify-center text-gray-300 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addLine}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add line
          </button>

          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-lg font-bold text-gray-900">{formatCurrency(estimateTotal)}</span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              disabled={lineItems.filter((i) => i.name.trim()).length === 0}
              onClick={createEstimate}
            >
              <Send className="h-4 w-4 mr-1.5" />
              Create Estimate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
