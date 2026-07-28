'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Truck, XCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate, formatStatus } from '@/lib/utils'
import { confirmToast } from '@/lib/confirm-toast'

interface ReturnItem {
  id: string; name: string; sku: string | null
  quantity: number; unit_cost: number; reason: string | null
  products?: { name: string; sku: string | null } | null
  product_variants?: { name: string } | null
}
interface SupplierReturn {
  id: string; return_number: string; status: 'draft' | 'shipped' | 'resolved' | 'cancelled'
  notes: string | null; total_value: number
  po_id: string | null
  resolution_type: 'replacement' | 'credit' | 'refund' | null
  resolution_amount: number | null
  resolution_note: string | null
  shipped_at: string | null
  resolved_at: string | null
  created_at: string
  suppliers?: { name: string } | null
  purchase_orders?: { po_number: string; status: string } | null
  supplier_return_items: ReturnItem[]
}

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  draft: 'default', shipped: 'warning', resolved: 'success', cancelled: 'destructive',
}

export default function DamageReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { activeBranch } = useAuthStore()

  const [ret, setRet] = useState<SupplierReturn | null>(null)
  const [loading, setLoading] = useState(true)
  const [shipping, setShipping] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolutionType, setResolutionType] = useState<'replacement' | 'credit' | 'refund'>('replacement')
  const [resolutionAmount, setResolutionAmount] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolving, setResolving] = useState(false)

  async function fetchReturn() {
    setLoading(true)
    const res = await fetch(`/api/supplier-returns/${id}`)
    const json = await res.json()
    setRet(json.data)
    setLoading(false)
  }

  useEffect(() => { fetchReturn() }, [id])

  async function handleShip() {
    if (!activeBranch) return
    const ok = await confirmToast(
      'Ship this return to the supplier? Stock will be deducted from inventory now.',
      'Ship'
    )
    if (!ok) return
    setShipping(true)
    try {
      const res = await fetch(`/api/supplier-returns/${id}/ship?branch_id=${activeBranch.id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to ship return')
      toast.success('Return shipped to supplier — stock updated')
      setRet(json.data)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setShipping(false)
    }
  }

  async function handleCancel() {
    if (!activeBranch || !ret) return
    const message = ret.status === 'shipped'
      ? 'Cancel this return? The previously deducted stock will be put back into inventory.'
      : 'Cancel this draft return? No inventory has been affected yet.'
    const ok = await confirmToast(message, 'Cancel')
    if (!ok) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/supplier-returns/${id}/cancel?branch_id=${activeBranch.id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to cancel return')
      toast.success('Return cancelled')
      setRet(json.data)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCancelling(false)
    }
  }

  function openResolve() {
    setResolutionType('replacement')
    setResolutionAmount('')
    setResolutionNote('')
    setResolveOpen(true)
  }

  async function handleResolve() {
    setResolving(true)
    try {
      const res = await fetch(`/api/supplier-returns/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution_type: resolutionType,
          resolution_amount: resolutionType === 'replacement' ? undefined : (parseFloat(resolutionAmount) || 0),
          resolution_note: resolutionNote || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to resolve return')
      toast.success('Return marked as resolved')
      setRet(json.data)
      setResolveOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setResolving(false)
    }
  }

  if (loading || !ret) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/inventory/damage-returns')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 font-mono">{ret.return_number}</h1>
            <Badge variant={STATUS_VARIANT[ret.status] ?? 'default'}>{ret.status}</Badge>
          </div>
          <p className="text-sm text-gray-500">
            {ret.suppliers?.name ?? 'Unknown supplier'} · Created {formatDate(ret.created_at)}
            {ret.purchase_orders?.po_number && (
              <>
                {' · '}
                <a href={`/inventory/purchase-orders/${ret.po_id}`} className="text-brand-teal hover:underline">
                  {ret.purchase_orders.po_number}
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {ret.status === 'draft' && (
            <>
              <Button size="sm" onClick={handleShip} loading={shipping}>
                <Truck className="h-4 w-4" /> Ship to Supplier
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} loading={cancelling}>
                <XCircle className="h-4 w-4" /> Cancel
              </Button>
            </>
          )}
          {ret.status === 'shipped' && (
            <>
              <Button size="sm" onClick={openResolve}>
                <CheckCircle2 className="h-4 w-4" /> Resolve
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} loading={cancelling}>
                <XCircle className="h-4 w-4" /> Cancel / Reverse
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Value', value: formatCurrency(ret.total_value) },
          { label: 'Status', value: formatStatus(ret.status) },
          {
            label: 'Resolution',
            value: ret.resolution_type
              ? `${formatStatus(ret.resolution_type)}${ret.resolution_amount ? ` · ${formatCurrency(ret.resolution_amount)}` : ''}`
              : '—',
          },
          {
            label: 'Shipped',
            value: ret.shipped_at ? formatDate(ret.shipped_at) : '—',
          },
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
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Unit Cost</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-left">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ret.supplier_return_items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{item.name}</p>
                  {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.unit_cost)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                  {formatCurrency(item.quantity * item.unit_cost)}
                </td>
                <td className="px-4 py-3 text-gray-600">{item.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(ret.total_value)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {ret.notes && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
          <p className="text-sm text-gray-600">{ret.notes}</p>
        </div>
      )}

      {(ret.status === 'resolved' || ret.status === 'cancelled') && ret.resolution_note && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Resolution Note</p>
          <p className="text-sm text-gray-600">{ret.resolution_note}</p>
        </div>
      )}

      {/* Resolve Modal */}
      <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title="Resolve Return" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">How did the supplier make this right?</p>
          <div className="space-y-2">
            {(['replacement', 'credit', 'refund'] as const).map((type) => (
              <label
                key={type}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                  resolutionType === type ? 'border-brand-teal bg-brand-teal-light/10' : 'border-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="resolution_type"
                  checked={resolutionType === type}
                  onChange={() => setResolutionType(type)}
                />
                <span className="capitalize font-medium text-gray-800">{type}</span>
              </label>
            ))}
          </div>

          {resolutionType !== 'replacement' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {resolutionType === 'credit' ? 'Credit Amount' : 'Refund Amount'}
              </label>
              <input
                type="number" min={0} step="0.01"
                value={resolutionAmount}
                onChange={(e) => setResolutionAmount(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
                placeholder="0.00"
              />
              {ret.po_id && (
                <p className="mt-1 text-xs text-gray-400">
                  This amount will automatically be posted against {ret.purchase_orders?.po_number}'s balance.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Note</label>
            <textarea
              rows={2}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <Button className="w-full" onClick={handleResolve} loading={resolving}>
            Mark as Resolved
          </Button>
        </div>
      </Modal>
    </div>
  )
}
