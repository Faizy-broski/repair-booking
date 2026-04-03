'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Package, Truck, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'

interface SpecialOrder {
  id: string
  name: string
  quantity: number
  unit_cost: number
  status: string
  tracking_id: string | null
  notes: string | null
  created_at: string
  customers?: { first_name: string; last_name: string } | null
  repairs?: { job_number: string } | null
  products?: { name: string } | null
}

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'purple'> = {
  pending: 'default',
  ordered: 'warning',
  received: 'success',
  linked: 'purple',
}

const emptyForm = {
  name: '', quantity: 1, unit_cost: 0, repair_id: '', customer_id: '',
  product_id: '', tracking_id: '', notes: '',
}

export default function SpecialOrdersPage() {
  const { activeBranch } = useAuthStore()
  const [orders, setOrders] = useState<SpecialOrder[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // Status update modal
  const [statusModal, setStatusModal] = useState<{ open: boolean; order: SpecialOrder | null }>({ open: false, order: null })
  const [newStatus, setNewStatus] = useState('')
  const [newTracking, setNewTracking] = useState('')

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    const res = await fetch(`/api/special-orders?${params}`)
    const json = await res.json()
    setOrders(json.data ?? [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { if (activeBranch) fetchOrders() }, [activeBranch, fetchOrders])

  const filtered = orders.filter((o) =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.customers?.first_name.toLowerCase().includes(search.toLowerCase()) ||
    o.customers?.last_name.toLowerCase().includes(search.toLowerCase()) ||
    o.tracking_id?.toLowerCase().includes(search.toLowerCase())
  )

  async function createOrder() {
    setSaving(true)
    const payload: Record<string, unknown> = {
      name: form.name,
      quantity: form.quantity,
      unit_cost: form.unit_cost,
      notes: form.notes || null,
    }
    if (form.repair_id) payload.repair_id = form.repair_id
    if (form.customer_id) payload.customer_id = form.customer_id
    if (form.product_id) payload.product_id = form.product_id
    if (form.tracking_id) payload.tracking_id = form.tracking_id

    const res = await fetch('/api/special-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setCreateOpen(false)
      setForm(emptyForm)
      fetchOrders()
    }
    setSaving(false)
  }

  async function updateOrderStatus() {
    if (!statusModal.order || !newStatus) return
    setSaving(true)
    const body: Record<string, string> = { status: newStatus }
    if (newTracking) body.tracking_id = newTracking
    await fetch(`/api/special-orders/${statusModal.order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setStatusModal({ open: false, order: null })
    setNewStatus('')
    setNewTracking('')
    setSaving(false)
    fetchOrders()
  }

  function openStatusModal(order: SpecialOrder) {
    setNewStatus(order.status)
    setNewTracking(order.tracking_id ?? '')
    setStatusModal({ open: true, order })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Special Orders</h1>
          <p className="text-sm text-gray-500">{filtered.length} orders</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Special Order
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search orders…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          {['', 'pending', 'ordered', 'received', 'linked'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm text-gray-400">
          No special orders found.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">{order.name}</p>
                  <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>{order.status}</Badge>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <span>Qty: {order.quantity}</span>
                  <span>{formatCurrency(order.unit_cost)} each</span>
                  {order.customers && (
                    <span>Customer: {order.customers.first_name} {order.customers.last_name}</span>
                  )}
                  {order.repairs && (
                    <span>Ticket: {order.repairs.job_number}</span>
                  )}
                  {order.tracking_id && (
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3" /> {order.tracking_id}
                    </span>
                  )}
                  <span>{formatDate(order.created_at)}</span>
                </div>
                {order.notes && <p className="mt-1 text-xs text-gray-400 truncate">{order.notes}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => openStatusModal(order)}>
                Update Status
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Special Order"
        size="sm"
      >
        <div className="space-y-3">
          <Input
            label="Part / Item Name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. iPhone 15 Pro LCD Assembly"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
            />
            <Input
              label="Unit Cost (£)"
              type="number"
              min="0"
              step="0.01"
              value={form.unit_cost}
              onChange={(e) => setForm((f) => ({ ...f, unit_cost: Number(e.target.value) }))}
            />
          </div>
          <Input
            label="Tracking ID"
            value={form.tracking_id}
            onChange={(e) => setForm((f) => ({ ...f, tracking_id: e.target.value }))}
            placeholder="Supplier tracking number"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Additional details…"
            />
          </div>
          <Button
            className="w-full"
            onClick={createOrder}
            loading={saving}
            disabled={!form.name.trim()}
          >
            Create Special Order
          </Button>
        </div>
      </Modal>

      {/* Status Update Modal */}
      <Modal
        open={statusModal.open}
        onClose={() => setStatusModal({ open: false, order: null })}
        title="Update Order Status"
        size="sm"
      >
        {statusModal.order && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium">{statusModal.order.name}</span> — Qty: {statusModal.order.quantity}
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              >
                <option value="pending">Pending</option>
                <option value="ordered">Ordered</option>
                <option value="received">Received</option>
                <option value="linked">Linked to Ticket</option>
              </select>
            </div>
            <Input
              label="Tracking ID"
              value={newTracking}
              onChange={(e) => setNewTracking(e.target.value)}
              placeholder="Optional tracking number"
            />
            <Button className="w-full" onClick={updateOrderStatus} loading={saving}>
              Update Status
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
