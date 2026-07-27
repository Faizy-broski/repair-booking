'use client'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { Plus, Eye, X, CheckCircle, Copy, Banknote, Loader2, Pencil, Trash2, ArrowLeft, MoreVertical } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { ProductVariantPicker } from '@/components/inventory/product-variant-picker'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { confirmToast } from '@/lib/confirm-toast'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'

interface Supplier { id: string; name: string }
interface PORow {
  id: string; po_number: string; status: string; total: number
  amount_paid: number; payment_status: string
  created_at: string; expected_delivery_date: string | null
  suppliers?: { name: string } | null
}
interface POItem {
  id: string; name: string; sku: string | null; quantity_ordered: number; unit_cost: number
  product_id?: string | null; variant_id?: string | null
  products?: { name: string; sku: string | null } | null
  product_variants?: { name: string } | null
}
interface DraftItem {
  product_id?: string; variant_id?: string; variant_name?: string
  name: string; sku: string; quantity_ordered: number; unit_cost: number
}

const PAYMENT_STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  unpaid: 'destructive',
  partial: 'warning',
  paid: 'success',
}

// "received" is deliberately excluded from manual selection — it must only
// ever be reached by actually receiving stock (Receive Stock → process_grn),
// which is the only path that updates inventory/cost/payment. Picking it
// here would silently skip all of that. Still shown as the current value
// when a PO is already received, so staff can manually move it back off
// that status (e.g. to fix a PO that reached "received" via this dropdown
// before this restriction existed) without being able to set it again.
const MANUAL_STATUSES = ['draft', 'pending', 'in_progress', 'cancelled']

export default function PurchaseOrdersPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()

  const queryClient = useQueryClient()
  const [page,      setPage]      = useState(0)
  const [pageSize,  setPageSize]  = useState(20)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  // Create form state
  const [supplierId,      setSupplierId]      = useState('')
  const [deliveryDate,    setDeliveryDate]    = useState('')
  const [poNotes,         setPoNotes]         = useState('')
  const [lineItems,       setLineItems]       = useState<DraftItem[]>([])
  const [submitting,      setSubmitting]      = useState(false)
  const [pickerOpen,      setPickerOpen]      = useState(false)
  const [depositAmount,   setDepositAmount]   = useState('')
  const [depositMethod,   setDepositMethod]   = useState<'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other'>('cash')

  // Edit sheet state
  const [editOpen,   setEditOpen]   = useState(false)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editSupplier, setEditSupplier] = useState('')
  const [editDate,     setEditDate]     = useState('')
  const [editNotes,    setEditNotes]    = useState('')
  const [editItems,    setEditItems]    = useState<DraftItem[]>([])
  const [editSaving,   setEditSaving]   = useState(false)
  const [editPickerOpen, setEditPickerOpen] = useState(false)

  useEffect(() => {
    const prefillSupplierId = searchParams.get('supplier_id')
    if (searchParams.get('new') === '1' && prefillSupplierId) {
      setSupplierId(prefillSupplierId)
      setSheetOpen(true)
      router.replace('/inventory/purchase-orders')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openEditRow(id: string) {
    setEditId(id)
    setEditOpen(true)
    setEditLoading(true)
    const res = await fetch(`/api/purchase-orders/${id}`)
    const json = await res.json()
    const po = json.data
    setEditSupplier(po.supplier_id)
    setEditDate(po.expected_delivery_date ?? '')
    setEditNotes(po.notes ?? '')
    setEditItems((po.purchase_order_items as POItem[]).map((i) => ({
      product_id: i.product_id ?? undefined,
      variant_id: i.variant_id ?? undefined,
      variant_name: i.product_variants?.name,
      name: i.name,
      sku: i.sku ?? '',
      quantity_ordered: i.quantity_ordered,
      unit_cost: i.unit_cost,
    })))
    setEditLoading(false)
  }

  async function saveEdit() {
    if (!editId) return
    const items = editItems.filter((i) => i.name.trim())
    if (items.length === 0) return
    setEditSaving(true)
    const res = await fetch(`/api/purchase-orders/${editId}`, {
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
      toast.success('Purchase order updated')
      setEditOpen(false)
      setEditId(null)
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    } else {
      const json = await res.json().catch(() => null)
      toast.error(json?.error?.message ?? 'Failed to update purchase order')
    }
    setEditSaving(false)
  }

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update status')
    },
    onSuccess: () => {
      toast.success('Status updated')
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: () => toast.error('Failed to update status'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/purchase-orders/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete purchase order')
    },
    onSuccess: () => {
      toast.success('Purchase order deleted')
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      queryClient.invalidateQueries({ queryKey: ['pos-variants'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  async function handleDelete(po: PORow) {
    const receivedSomething = po.status === 'received' || po.status === 'in_progress'
    const message = receivedSomething
      ? `Delete ${po.po_number}? This has already received stock — deleting will subtract that stock back out, remove its cost batches, and delete any recorded supplier payment. This cannot be undone.`
      : `Delete purchase order ${po.po_number}?`
    if (!await confirmToast(message, 'Delete')) return
    deleteMutation.mutate(po.id)
  }

  // Record Payment modal state
  const [paymentPO, setPaymentPO] = useState<PORow | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other'>('bank_transfer')

  const { data: poData, isLoading: loading } = useQuery({
    queryKey: ['purchase-orders', activeBranch?.id, page, pageSize, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id, page: String(page + 1), limit: String(pageSize) })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/purchase-orders?${params}`)
      const json = await res.json()
      return { orders: (json.data ?? []) as PORow[], total: (json.meta?.total ?? 0) as number }
    },
    enabled: !!activeBranch,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  })
  const orders = poData?.orders ?? []
  const total  = poData?.total  ?? 0

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-list', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch('/api/suppliers')
      return (await res.json()).data ?? []
    },
    enabled: !!activeBranch,
    staleTime: 5 * 60_000,
  })

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
        deposit: parseFloat(depositAmount) > 0 ? { amount: parseFloat(depositAmount), method: depositMethod } : undefined,
        items,
      }),
    })
    if (res.ok) {
      setSheetOpen(false)
      setSupplierId('')
      setDeliveryDate('')
      setPoNotes('')
      setLineItems([])
      setDepositAmount('')
      setDepositMethod('cash')
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', activeBranch?.id] })
    }
    setSubmitting(false)
  }

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentPO) return
      const amount = parseFloat(paymentAmount)
      if (!amount || amount <= 0) throw new Error('Enter a valid amount')
      const outstanding = Number(paymentPO.total) - Number(paymentPO.amount_paid)
      if (amount > outstanding + 0.01) throw new Error(`Cannot exceed outstanding balance of ${formatCurrency(outstanding)}`)
      const res = await fetch(`/api/purchase-orders/${paymentPO.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: paymentMethod }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to record payment')
    },
    onSuccess: () => {
      toast.success('Payment recorded successfully')
      setPaymentPO(null)
      setPaymentAmount('')
      setPaymentMethod('bank_transfer')
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-credits'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const columns: ColumnDef<PORow>[] = [
    {
      accessorKey: 'po_number',
      header: 'PO Number',
      cell: ({ getValue, row }) => (
        <Link
          href={`/inventory/purchase-orders/${row.original.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono font-semibold text-blue-600 hover:underline"
        >
          {getValue() as string}
        </Link>
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
      cell: ({ getValue, row }) => {
        const s = getValue() as string
        return (
          <select
            value={s}
            title="Manual override — does not replay GRN (won't touch inventory, cost layers, or payment status). Received is set automatically when stock is receipted via Receive Stock, and can't be picked here."
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => statusMutation.mutate({ id: row.original.id, status: e.target.value })}
            disabled={statusMutation.isPending}
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs font-medium capitalize disabled:opacity-50"
          >
            {(s === 'received' ? ['received', ...MANUAL_STATUSES] : MANUAL_STATUSES).map((o) => (
              <option key={o} value={o}>{o.replace('_', ' ')}</option>
            ))}
          </select>
        )
      },
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        if (row.original.status !== 'received') {
          return row.original.amount_paid > 0
            ? <Badge variant={PAYMENT_STATUS_VARIANT[row.original.payment_status] ?? 'default'}>{row.original.payment_status === 'paid' ? 'Deposit: paid in full' : 'Deposit: partial'}</Badge>
            : <span className="text-xs text-gray-400">On credit</span>
        }
        const s = row.original.payment_status
        return <Badge variant={PAYMENT_STATUS_VARIANT[s] ?? 'default'}>{s}</Badge>
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
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex justify-start" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none">
                <MoreVertical className="h-4 w-4 stroke-[2.5]" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <DropdownMenu.Item asChild>
                  <Link
                    href={`/inventory/purchase-orders/${row.original.id}`}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                  >
                    <Eye className="h-4 w-4 text-gray-400" /> View
                  </Link>
                </DropdownMenu.Item>
                {row.original.status === 'draft' && (
                  <DropdownMenu.Item
                    onSelect={() => openEditRow(row.original.id)}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4 text-gray-400" /> Edit
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  onSelect={async () => {
                    if (!activeBranch) return
                    const res = await fetch(`/api/purchase-orders/${row.original.id}/clone?branch_id=${activeBranch.id}`, { method: 'POST' })
                    if (res.ok) queryClient.invalidateQueries({ queryKey: ['purchase-orders', activeBranch?.id] })
                  }}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                >
                  <Copy className="h-4 w-4 text-gray-400" /> Clone
                </DropdownMenu.Item>
                {row.original.status !== 'cancelled' && row.original.payment_status !== 'paid' && (
                  <DropdownMenu.Item
                    onSelect={() => { setPaymentPO(row.original); setPaymentAmount(''); setPaymentMethod('bank_transfer') }}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-purple-600 outline-none hover:bg-purple-50"
                  >
                    <Banknote className="h-4 w-4" /> Record Payment
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 border-t border-gray-100" />
                <DropdownMenu.Item
                  onSelect={() => handleDelete(row.original)}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      ),
    },
  ]

  const poTotal = lineItems.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Purchase Orders</h1>
            <p className="text-sm text-gray-500">{total} orders</p>
          </div>
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
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No purchase orders yet."
        onRowClick={(po) => router.push(`/inventory/purchase-orders/${po.id}`)}
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
            <label className="mb-1 block text-sm font-medium text-gray-700">Deposit Paid Now (optional)</label>
            <div className="flex gap-2">
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="h-9 w-32 rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none"
              />
              <select
                value={depositMethod}
                onChange={(e) => setDepositMethod(e.target.value as typeof depositMethod)}
                disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                className="h-9 flex-1 rounded-lg border border-gray-300 px-3 text-sm capitalize disabled:opacity-50"
              >
                {(['cash', 'card', 'bank_transfer', 'cheque', 'other'] as const).map(m => (
                  <option key={m} value={m}>{m.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Recorded immediately as an upfront payment to the supplier — leave at 0 to buy fully on credit. Any remaining balance is settled later via Record Payment.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Line Items</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPickerOpen(true)} className="text-xs font-medium text-brand-teal hover:underline">
                  + Add product
                </button>
                <button
                  type="button"
                  onClick={() => setLineItems((l) => [...l, { name: '', sku: '', quantity_ordered: 1, unit_cost: 0 }])}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Add misc item
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    {idx === 0 && <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Item Name</label>}
                    {item.product_id ? (
                      <div className="flex h-8 items-center gap-1.5 rounded-md border border-brand-teal/30 bg-brand-teal-light/10 px-2 text-sm">
                        <span className="truncate">{item.name}</span>
                        <span className="shrink-0 rounded-full bg-brand-teal-light/40 px-1.5 py-0.5 text-[10px] font-medium text-brand-teal">Linked</span>
                      </div>
                    ) : (
                      <input
                        placeholder="e.g. iPhone 14 Screen (non-inventory item)"
                        value={item.name}
                        onChange={(e) => {
                          const u = [...lineItems]; u[idx] = { ...u[idx], name: e.target.value }; setLineItems(u)
                        }}
                        className="h-8 w-full rounded-md border border-gray-300 px-2 text-sm focus:border-blue-400 focus:outline-none"
                      />
                    )}
                  </div>
                  <div className="w-16">
                    {idx === 0 && <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Qty</label>}
                    <input
                      type="number" min="1"
                      value={item.quantity_ordered}
                      onChange={(e) => {
                        const u = [...lineItems]; u[idx] = { ...u[idx], quantity_ordered: Number(e.target.value) }; setLineItems(u)
                      }}
                      className="h-8 w-full rounded-md border border-gray-300 px-2 text-sm text-center focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div className="w-24">
                    {idx === 0 && <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">Unit Cost</label>}
                    <input
                      type="number" min="0" step="0.01"
                      value={item.unit_cost}
                      onChange={(e) => {
                        const u = [...lineItems]; u[idx] = { ...u[idx], unit_cost: Number(e.target.value) }; setLineItems(u)
                      }}
                      className="h-8 w-full rounded-md border border-gray-300 px-2 text-sm text-right focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex w-8 items-end justify-center pb-0.5">
                    <button
                      onClick={() => setLineItems((l) => l.filter((_, i) => i !== idx))}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {lineItems.length === 0 && (
                <p className="py-3 text-center text-xs text-gray-400">Add a product or a misc item to get started</p>
              )}
            </div>
          </div>

          <ProductVariantPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            branchId={activeBranch?.id}
            onSelect={(product, variant) => {
              setLineItems((l) => [...l, {
                product_id: product.id,
                variant_id: variant?.id,
                variant_name: variant?.name,
                name: variant ? `${product.name} – ${variant.name}` : product.name,
                sku: variant?.sku ?? '',
                quantity_ordered: 1,
                unit_cost: variant?.cost_price ?? product.cost_price ?? 0,
              }])
            }}
          />

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

      {/* Edit Sheet */}
      <InlineFormSheet
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditId(null) }}
        title="Edit Purchase Order"
        side="right"
      >
        {editLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
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
                <div className="flex gap-3">
                  <button type="button" onClick={() => setEditPickerOpen(true)} className="text-xs font-medium text-brand-teal hover:underline">
                    + Add product
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditItems((l) => [...l, { name: '', sku: '', quantity_ordered: 1, unit_cost: 0 }])}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + Add misc item
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {editItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      {idx === 0 && <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Item Name</label>}
                      {item.product_id ? (
                        <div className="flex h-8 items-center gap-1.5 rounded-md border border-brand-teal/30 bg-brand-teal-light/10 px-2 text-sm">
                          <span className="truncate">{item.name}</span>
                          <span className="shrink-0 rounded-full bg-brand-teal-light/40 px-1.5 py-0.5 text-[10px] font-medium text-brand-teal">Linked</span>
                        </div>
                      ) : (
                        <input
                          placeholder="e.g. iPhone 14 Screen (non-inventory item)"
                          value={item.name}
                          onChange={(e) => {
                            const u = [...editItems]; u[idx] = { ...u[idx], name: e.target.value }; setEditItems(u)
                          }}
                          className="h-8 w-full rounded-md border border-gray-300 px-2 text-sm focus:border-blue-400 focus:outline-none"
                        />
                      )}
                    </div>
                    <div className="w-16">
                      {idx === 0 && <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Qty</label>}
                      <input
                        type="number" min="1"
                        value={item.quantity_ordered}
                        onChange={(e) => {
                          const u = [...editItems]; u[idx] = { ...u[idx], quantity_ordered: Number(e.target.value) }; setEditItems(u)
                        }}
                        className="h-8 w-full rounded-md border border-gray-300 px-2 text-sm text-center focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <div className="w-24">
                      {idx === 0 && <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">Unit Cost</label>}
                      <input
                        type="number" min="0" step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => {
                          const u = [...editItems]; u[idx] = { ...u[idx], unit_cost: Number(e.target.value) }; setEditItems(u)
                        }}
                        className="h-8 w-full rounded-md border border-gray-300 px-2 text-sm text-right focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <div className="flex w-8 items-end justify-center pb-0.5">
                      <button
                        onClick={() => setEditItems((l) => l.filter((_, i) => i !== idx))}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {editItems.length === 0 && (
                  <p className="py-3 text-center text-xs text-gray-400">Add a product or a misc item to get started</p>
                )}
              </div>

              <ProductVariantPicker
                open={editPickerOpen}
                onClose={() => setEditPickerOpen(false)}
                branchId={activeBranch?.id}
                onSelect={(product, variant) => {
                  setEditItems((l) => [...l, {
                    product_id: product.id,
                    variant_id: variant?.id,
                    variant_name: variant?.name,
                    name: variant ? `${product.name} – ${variant.name}` : product.name,
                    sku: variant?.sku ?? '',
                    quantity_ordered: 1,
                    unit_cost: variant?.cost_price ?? product.cost_price ?? 0,
                  }])
                }}
              />
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

            <Button className="w-full" onClick={saveEdit} loading={editSaving} disabled={!editItems.some((i) => i.name.trim())}>
              Save Changes
            </Button>
          </div>
        )}
      </InlineFormSheet>

      {/* Record Payment Modal */}
      <Modal
        open={!!paymentPO}
        onClose={() => { if (!recordPaymentMutation.isPending) setPaymentPO(null) }}
        title="Record Payment"
        size="sm"
      >
        {paymentPO && (() => {
          const outstanding = Math.max(0, Number(paymentPO.total) - Number(paymentPO.amount_paid))
          return (
            <div className="space-y-4">
              <div className="rounded-lg bg-purple-50 px-4 py-3 text-sm">
                <p className="font-semibold text-purple-900">{paymentPO.suppliers?.name ?? '—'} · {paymentPO.po_number}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-purple-600">PO Total</p>
                    <p className="font-bold text-purple-900">{formatCurrency(Number(paymentPO.total))}</p>
                  </div>
                  <div>
                    <p className="text-purple-600">Already Paid</p>
                    <p className="font-bold text-green-700">{formatCurrency(Number(paymentPO.amount_paid))}</p>
                  </div>
                  <div>
                    <p className="text-purple-600">Outstanding</p>
                    <p className="font-bold text-red-600">{formatCurrency(outstanding)}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Amount to record <span className="font-normal text-gray-400">(max {formatCurrency(outstanding)})</span>
                </label>
                <input
                  type="number"
                  min={0.01}
                  max={outstanding}
                  step={0.01}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Paid via</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'card', 'bank_transfer', 'cheque', 'other'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${paymentMethod === m ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      {m.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setPaymentPO(null)} disabled={recordPaymentMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => recordPaymentMutation.mutate()}
                  disabled={recordPaymentMutation.isPending || !paymentAmount || parseFloat(paymentAmount) <= 0}
                >
                  {recordPaymentMutation.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Banknote className="mr-2 h-4 w-4" />}
                  {recordPaymentMutation.isPending ? 'Recording…' : 'Record Payment'}
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
