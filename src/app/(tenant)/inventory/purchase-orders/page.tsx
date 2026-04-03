'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Eye, X, CheckCircle, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import type { ColumnDef } from '@tanstack/react-table'

interface Supplier { id: string; name: string }
interface PORow {
  id: string; po_number: string; status: string; total: number
  created_at: string; expected_delivery_date: string | null
  suppliers?: { name: string } | null
}

const PO_STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  draft:       'default',
  pending:     'warning',
  in_progress: 'warning',
  received:    'success',
  cancelled:   'destructive',
}

export default function PurchaseOrdersPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()

  const [orders,    setOrders]    = useState<PORow[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  // Create form state
  const [supplierId,      setSupplierId]      = useState('')
  const [deliveryDate,    setDeliveryDate]    = useState('')
  const [poNotes,         setPoNotes]         = useState('')
  const [lineItems,       setLineItems]       = useState([{ name: '', sku: '', quantity_ordered: 1, unit_cost: 0 }])
  const [submitting,      setSubmitting]      = useState(false)

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const params = new URLSearchParams({ branch_id: activeBranch.id, page: String(page + 1) })
    if (statusFilter) params.set('status', statusFilter)
    const [poRes, supRes] = await Promise.all([
      fetch(`/api/purchase-orders?${params}`),
      fetch('/api/suppliers'),
    ])
    const [poJson, supJson] = await Promise.all([poRes.json(), supRes.json()])
    setOrders(poJson.data ?? [])
    setTotal(poJson.meta?.total ?? 0)
    setSuppliers(supJson.data ?? [])
    setLoading(false)
  }, [activeBranch, page, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  async function createPO() {
    if (!activeBranch || !supplierId) return
    setSubmitting(true)
    const items = lineItems.filter((i) => i.name.trim())
    const res = await fetch(`/api/purchase-orders?branch_id=${activeBranch.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        expected_delivery_date: deliveryDate || undefined,
        notes: poNotes || undefined,
        items,
      }),
    })
    if (res.ok) {
      const json = await res.json()
      setSheetOpen(false)
      setSupplierId('')
      setDeliveryDate('')
      setPoNotes('')
      setLineItems([{ name: '', sku: '', quantity_ordered: 1, unit_cost: 0 }])
      fetchData()
    }
    setSubmitting(false)
  }

  const columns: ColumnDef<PORow>[] = [
    {
      accessorKey: 'po_number',
      header: 'PO Number',
      cell: ({ getValue }) => (
        <span className="font-mono font-semibold text-blue-600">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: 'suppliers',
      header: 'Supplier',
      cell: ({ getValue }) => (getValue() as PORow['suppliers'])?.name ?? '—',
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string
        return <Badge variant={PO_STATUS_VARIANT[s] ?? 'default'}>{s.replace('_', ' ')}</Badge>
      },
    },
    {
      accessorKey: 'expected_delivery_date',
      header: 'Expected',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? formatDate(v) : '—'
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => router.push(`/inventory/purchase-orders/${row.original.id}`)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" title="Clone" onClick={async () => {
            if (!activeBranch) return
            const res = await fetch(`/api/purchase-orders/${row.original.id}/clone?branch_id=${activeBranch.id}`, { method: 'POST' })
            if (res.ok) fetchData()
          }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  const poTotal = lineItems.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-500">{total} orders</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> New PO
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {['', 'draft', 'pending', 'in_progress', 'received', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      <DataTable
        data={orders}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No purchase orders yet."
      />

      <InlineFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="New Purchase Order"
        side="right"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Supplier *</label>
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

          <Input
            label="Expected Delivery Date"
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Line Items</label>
              <button
                type="button"
                onClick={() => setLineItems((l) => [...l, { name: '', sku: '', quantity_ordered: 1, unit_cost: 0 }])}
                className="text-xs text-blue-600 hover:underline"
              >
                + Add row
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr,3rem,4.5rem,1.5rem] gap-1.5 items-end">
                  <input
                    placeholder="Item name"
                    value={item.name}
                    onChange={(e) => {
                      const u = [...lineItems]; u[idx] = { ...u[idx], name: e.target.value }; setLineItems(u)
                    }}
                    className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                  />
                  <input
                    type="number" min="1" placeholder="Qty"
                    value={item.quantity_ordered}
                    onChange={(e) => {
                      const u = [...lineItems]; u[idx] = { ...u[idx], quantity_ordered: Number(e.target.value) }; setLineItems(u)
                    }}
                    className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Cost"
                    value={item.unit_cost}
                    onChange={(e) => {
                      const u = [...lineItems]; u[idx] = { ...u[idx], unit_cost: Number(e.target.value) }; setLineItems(u)
                    }}
                    className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                  />
                  {lineItems.length > 1 && (
                    <button
                      onClick={() => setLineItems((l) => l.filter((_, i) => i !== idx))}
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
            <span className="font-semibold text-gray-900">{formatCurrency(poTotal)}</span>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} value={poNotes} onChange={(e) => setPoNotes(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <Button className="w-full" onClick={createPO} loading={submitting} disabled={!supplierId || !lineItems.some((i) => i.name.trim())}>
            Create Purchase Order
          </Button>
        </div>
      </InlineFormSheet>
    </div>
  )
}
