'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus, Download, CreditCard, RotateCcw, Loader2, UserPlus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate, getCurrencySymbol } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { PhoneInput } from '@/components/ui/phone-input'

interface LineItem { description: string; quantity: number; unit_price: number }

interface InvoiceRow {
  id: string
  invoice_number: string
  status: string
  subtotal: number
  tax: number
  discount: number
  total: number
  amount_paid: number
  created_at: string
  customer_id: string | null
  notes: string | null
  items: LineItem[] | null
  customers?: { first_name: string; last_name: string | null } | null
}

interface CustomerOption { id: string; first_name: string; last_name: string | null }

interface StatusSummary {
  unpaid: number; unpaid_total: number
  partial: number; partial_total: number
  paid: number;   paid_total: number
  refunded: number
}

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  issued: 'warning', unpaid: 'destructive', partial: 'warning',
  paid: 'success', refunded: 'default',
}

const INVOICE_STATUSES = ['issued', 'unpaid', 'partial', 'paid', 'refunded'] as const

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().min(0),
})

const schema = z.object({
  customer_id: z.string().uuid().optional().or(z.literal('')),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  discount_value: z.coerce.number().min(0).default(0),
  discount_type: z.enum(['flat', 'percent']).default('flat'),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1, 'Add at least one item'),
})

type FormData = z.infer<typeof schema>

export default function InvoicesPage() {
  const router = useRouter()
  const { activeBranch, currency } = useAuthStore()
  const currSymbol = getCurrencySymbol(currency)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null)
  const [lineItems, setLineItems] = useState([{ description: '', quantity: 1, unit_price: 0 }])
  const [paymentModal, setPaymentModal] = useState<{ invoiceId: string; remaining: number } | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [newCustOpen, setNewCustOpen] = useState(false)
  const [newCustSaving, setNewCustSaving] = useState(false)
  const [newCust, setNewCust] = useState({ first_name: '', last_name: '', email: '', phone: '', address: '', business_name: '' })

  async function createCustomer() {
    if (!activeBranch || !newCust.first_name.trim()) { toast.error('First name is required'); return }
    setNewCustSaving(true)
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newCust, branch_id: activeBranch.id }),
    })
    const json = await res.json()
    if (res.ok && json.data?.id) {
      toast.success('Customer created')
      queryClient.invalidateQueries({ queryKey: ['invoices', activeBranch?.id] })
      setValue('customer_id', json.data.id)
      setNewCustOpen(false)
      setNewCust({ first_name: '', last_name: '', email: '', phone: '', address: '', business_name: '' })
    } else {
      toast.error(json.error ?? 'Failed to create customer')
    }
    setNewCustSaving(false)
  }

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tax_rate: 0, discount_value: 0, discount_type: 'flat', items: [{ description: '', quantity: 1, unit_price: 0 }] },
  })
  const discountValue = watch('discount_value') ?? 0
  const discountType  = watch('discount_type') ?? 'flat'

  const queryClient = useQueryClient()
  const invoiceQueryKey = ['invoices', activeBranch?.id, page, pageSize, statusFilter]

  const { data: invoiceData, isLoading: loading } = useQuery({
    queryKey: invoiceQueryKey,
    queryFn: async () => {
      const invParams = new URLSearchParams({ branch_id: activeBranch!.id, page: String(page + 1), limit: String(pageSize) })
      if (statusFilter) invParams.set('status', statusFilter)
      const [invRes, custRes, sumRes] = await Promise.all([
        fetch(`/api/invoices?${invParams}`),
        fetch(`/api/customers?branch_id=${activeBranch!.id}&limit=100`),
        fetch(`/api/invoices/summary?branch_id=${activeBranch!.id}`),
      ])
      const [invJson, custJson, sumJson] = await Promise.all([invRes.json(), custRes.json(), sumRes.json()])
      return {
        invoices: (invJson.data ?? []) as InvoiceRow[],
        total: invJson.meta?.total ?? 0,
        customers: (custJson.data ?? []) as CustomerOption[],
        summary: (sumJson.data ?? null) as StatusSummary | null,
      }
    },
    enabled: !!activeBranch,
  })

  const invoices = invoiceData?.invoices ?? []
  const total = invoiceData?.total ?? 0
  const customers = invoiceData?.customers ?? []
  const summary = invoiceData?.summary ?? null

  async function changeStatus(invoiceId: string, newStatus: string) {
    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      toast.success(`Invoice status updated to ${newStatus}`)
      queryClient.invalidateQueries({ queryKey: ['invoices', activeBranch?.id] })
    } else {
      const err = await res.json()
      toast.error(err?.error?.message ?? 'Failed to update status')
    }
  }

  function openEdit(inv: InvoiceRow) {
    const items = (inv.items ?? []).length > 0
      ? inv.items!
      : [{ description: '', quantity: 1, unit_price: 0 }]
    setLineItems(items)
    reset({
      customer_id: inv.customer_id ?? '',
      tax_rate: 0,
      discount_value: inv.discount ?? 0,
      discount_type: 'flat',
      notes: inv.notes ?? '',
      items,
    })
    setEditingInvoice(inv)
    setSheetOpen(true)
  }

  async function deleteInvoice(id: string) {
    setDeleting(true)
    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Invoice deleted')
      setDeleteConfirmId(null)
      queryClient.invalidateQueries({ queryKey: ['invoices', activeBranch?.id] })
    } else {
      const err = await res.json()
      toast.error(err?.error?.message ?? 'Failed to delete invoice')
    }
    setDeleting(false)
  }

  function addLineItem() {
    const updated = [...lineItems, { description: '', quantity: 1, unit_price: 0 }]
    setLineItems(updated)
    setValue('items', updated)
  }

  function removeLineItem(index: number) {
    const updated = lineItems.filter((_, i) => i !== index)
    setLineItems(updated)
    setValue('items', updated)
  }

  async function onCreate(data: FormData) {
    if (!activeBranch) return
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    const discountAmt = data.discount_type === 'percent'
      ? subtotal * (data.discount_value / 100)
      : (data.discount_value ?? 0)
    const discounted = Math.max(0, subtotal - discountAmt)
    const tax = editingInvoice
      ? (editingInvoice.tax ?? 0)
      : discounted * (data.tax_rate / 100)

    if (editingInvoice) {
      const res = await fetch(`/api/invoices/${editingInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: data.customer_id || null,
          items: data.items,
          subtotal,
          discount: discountAmt,
          tax,
          total: discounted + tax,
          notes: data.notes || null,
        }),
      })
      if (res.ok) {
        toast.success('Invoice updated')
        setEditingInvoice(null)
        reset({ tax_rate: 0, discount_value: 0, discount_type: 'flat', items: [{ description: '', quantity: 1, unit_price: 0 }] })
        setLineItems([{ description: '', quantity: 1, unit_price: 0 }])
        setSheetOpen(false)
        queryClient.invalidateQueries({ queryKey: ['invoices', activeBranch?.id] })
      } else {
        const err = await res.json()
        toast.error(err?.error?.message ?? 'Failed to update invoice')
      }
      return
    }

    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        branch_id: activeBranch.id,
        customer_id: data.customer_id || null,
        subtotal,
        discount: discountAmt,
        tax,
        total: discounted + tax,
        items: data.items,
      }),
    })
    if (res.ok) {
      reset({ tax_rate: 0, discount_value: 0, discount_type: 'flat', items: [{ description: '', quantity: 1, unit_price: 0 }] })
      setLineItems([{ description: '', quantity: 1, unit_price: 0 }])
      setSheetOpen(false)
      queryClient.invalidateQueries({ queryKey: ['invoices', activeBranch?.id] })
    }
  }

  async function recordPayment() {
    if (!paymentModal || !paymentAmount) return
    setRecordingPayment(true)
    const res = await fetch(`/api/invoices/${paymentModal.invoiceId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(paymentAmount) }),
    })
    if (res.ok) {
      toast.success('Payment recorded successfully')
      setPaymentModal(null)
      setPaymentAmount('')
      queryClient.invalidateQueries({ queryKey: ['invoices', activeBranch?.id] })
    } else {
      const err = await res.json()
      toast.error(err?.error?.message ?? 'Failed to record payment')
    }
    setRecordingPayment(false)
  }

  function prefetchPdf(url: string) {
    fetch(url, { redirect: 'manual' } as RequestInit).catch(() => {})
  }

  async function downloadPdf(invoiceId: string) {
    setDownloadingId(invoiceId)
    // Only show the toast if it takes longer than 400ms (i.e. cache miss / first generation).
    // Cache hits resolve in ~100–200ms so the toast never fires for them.
    const slowTimer = setTimeout(() => toast.info('Generating PDF, please wait…'), 400)
    try {
      // fetch() follows the 302 → Supabase Storage CDN redirect automatically.
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`)
      if (!res.ok) { toast.error('Failed to generate PDF'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${invoiceId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download PDF')
    } finally {
      clearTimeout(slowTimer)
      setDownloadingId(null)
    }
  }

  const columns: ColumnDef<InvoiceRow>[] = [
    {
      accessorKey: 'invoice_number',
      header: 'Invoice #',
      cell: ({ getValue, row }) => (
        <button
          type="button"
          onClick={() => downloadPdf(row.original.id)}
          className="cursor-pointer font-mono font-medium text-blue-600 hover:underline hover:text-blue-800 whitespace-nowrap transition-colors"
        >
          {getValue() as string}
        </button>
      ),
    },
    {
      accessorKey: 'customers',
      header: 'Customer',
      cell: ({ getValue }) => {
        const c = getValue() as InvoiceRow['customers']
        return c ? `${c.first_name} ${c.last_name ?? ''}` : '—'
      },
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ getValue }) => <span className="font-semibold">{formatCurrency(getValue() as number, currency)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const inv = row.original
        return (
          <select
            value={inv.status}
            onChange={e => changeStatus(inv.id, e.target.value)}
            className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium focus:ring-2 focus:ring-blue-400 ${
              inv.status === 'paid' ? 'bg-green-100 text-green-800' :
              inv.status === 'unpaid' || inv.status === 'void' ? 'bg-red-100 text-red-800' :
              inv.status === 'partial' || inv.status === 'issued' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}
          >
            {INVOICE_STATUSES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const inv = row.original
        const remaining = inv.total - (inv.amount_paid ?? 0)
        return (
          <div className="flex items-center gap-1.5">
            {(inv.status === 'unpaid' || inv.status === 'partial') && remaining > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setPaymentModal({ invoiceId: inv.id, remaining }); setPaymentAmount(String(remaining.toFixed(2))) }}
              >
                <CreditCard className="h-3.5 w-3.5 mr-1" />
                Pay
              </Button>
            )}
            {inv.status === 'paid' && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => router.push(`/pos/refund?sale_id=${inv.id}`)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Refund
              </Button>
            )}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none">
                  <MoreVertical className="h-4 w-4 stroke-[2.5]" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <DropdownMenu.Item
                    onSelect={() => downloadPdf(inv.id)}
                    onMouseEnter={() => prefetchPdf(`/api/invoices/${inv.id}/pdf`)}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                  >
                    {downloadingId === inv.id
                      ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      : <Download className="h-4 w-4 text-gray-400" />}
                    Download PDF
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => openEdit(inv)}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-blue-600 outline-none hover:bg-blue-50"
                  >
                    <Pencil className="h-4 w-4" /> Edit Invoice
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 border-t border-gray-100" />
                  <DropdownMenu.Item
                    onSelect={() => setDeleteConfirmId(inv.id)}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Invoice
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        )
      },
    },
  ]

  const lineItemSubtotal = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500">{total} invoices</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </div>

      {/* Status summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Unpaid',  count: summary.unpaid,   total: summary.unpaid_total,  color: 'border-red-200 bg-red-50',    text: 'text-red-700',    filter: 'unpaid' },
            { label: 'Partial', count: summary.partial,  total: summary.partial_total, color: 'border-yellow-200 bg-yellow-50', text: 'text-yellow-700', filter: 'partial' },
            { label: 'Paid',    count: summary.paid,     total: summary.paid_total,    color: 'border-green-200 bg-green-50', text: 'text-green-700',  filter: 'paid' },
            { label: 'Refunded',count: summary.refunded, total: null,                  color: 'border-gray-200 bg-gray-50',  text: 'text-gray-600',   filter: 'refunded' },
          ].map((card) => (
            <button
              key={card.filter}
              onClick={() => setStatusFilter(statusFilter === card.filter ? '' : card.filter)}
              className={`rounded-xl border p-3 text-left transition-all ${card.color} ${
                statusFilter === card.filter ? 'ring-2 ring-blue-500' : 'hover:opacity-80'
              }`}
            >
              <p className={`text-2xl font-bold ${card.text}`}>{card.count}</p>
              <p className="text-xs text-gray-500">{card.label}</p>
              {card.total !== null && (
                <p className={`text-xs font-medium ${card.text}`}>{formatCurrency(card.total, currency)}</p>
              )}
            </button>
          ))}
        </div>
      )}

      <DataTable
        data={invoices}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No invoices yet."
      />

      <InlineFormSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false)
          if (editingInvoice) {
            setEditingInvoice(null)
            reset({ tax_rate: 0, discount_value: 0, discount_type: 'flat', items: [{ description: '', quantity: 1, unit_price: 0 }] })
            setLineItems([{ description: '', quantity: 1, unit_price: 0 }])
          }
        }}
        title={editingInvoice ? `Edit Invoice ${editingInvoice.invoice_number}` : 'New Invoice'}
        side="right"
      >
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Customer (optional)</label>
              <button
                type="button"
                onClick={() => setNewCustOpen(true)}
                className="flex items-center gap-1 text-xs text-brand-teal hover:underline font-medium"
              >
                <UserPlus className="h-3 w-3" /> New Customer
              </button>
            </div>
            <select
              {...register('customer_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">No customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ''}</option>
              ))}
            </select>
          </div>

          {/* Line items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Line Items</label>
              <button type="button" onClick={addLineItem} className="text-xs text-blue-600 hover:underline">
                + Add row
              </button>
            </div>
            {/* Column headers */}
            <div className="flex gap-1.5 mb-1 pr-5">
              <span className="flex-1 text-xs font-medium text-gray-500">Description</span>
              <span style={{ width: '4rem' }} className="text-xs font-medium text-gray-500">Qty</span>
              <span style={{ width: '5rem' }} className="text-xs font-medium text-gray-500">Unit Price</span>
            </div>
            <div className="space-y-1.5">
              {lineItems.map((item, idx) => {
                const rowErrors = errors.items?.[idx]
                return (
                  <div key={idx}>
                    <div className="flex gap-1.5 items-center">
                      <input
                        placeholder="e.g. Screen replacement"
                        value={item.description}
                        onChange={(e) => {
                          const updated = [...lineItems]
                          updated[idx] = { ...updated[idx], description: e.target.value }
                          setLineItems(updated)
                          setValue('items', updated, { shouldValidate: true })
                        }}
                        className={`h-8 min-w-0 flex-1 rounded-md border px-2 text-sm ${rowErrors?.description ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      />
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const updated = [...lineItems]
                          updated[idx] = { ...updated[idx], quantity: Number(e.target.value) }
                          setLineItems(updated)
                          setValue('items', updated, { shouldValidate: true })
                        }}
                        style={{ width: '4rem' }}
                        className={`h-8 shrink-0 rounded-md border px-2 text-sm ${rowErrors?.quantity ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.unit_price}
                        onChange={(e) => {
                          const updated = [...lineItems]
                          updated[idx] = { ...updated[idx], unit_price: Number(e.target.value) }
                          setLineItems(updated)
                          setValue('items', updated, { shouldValidate: true })
                        }}
                        style={{ width: '5rem' }}
                        className={`h-8 shrink-0 rounded-md border px-2 text-sm ${rowErrors?.unit_price ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      />
                      {lineItems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="shrink-0 text-gray-300 hover:text-red-500 text-lg leading-none"
                        >
                          ×
                        </button>
                      ) : <span className="w-4 shrink-0" />}
                    </div>
                    {rowErrors && (
                      <div className="flex gap-1.5 mt-0.5 pr-5">
                        <span className="flex-1 text-xs text-red-500">{rowErrors.description?.message}</span>
                        <span style={{ width: '4rem' }} className="text-xs text-red-500">{rowErrors.quantity?.message}</span>
                        <span style={{ width: '5rem' }} className="text-xs text-red-500">{rowErrors.unit_price?.message}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {errors.items?.message && <p className="mt-1 text-xs text-red-500">{errors.items.message as string}</p>}
            {errors.items?.root?.message && <p className="mt-1 text-xs text-red-500">{errors.items.root.message}</p>}
          </div>

          {/* Discount */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Discount</label>
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-gray-200 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setValue('discount_type', 'flat')}
                  className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${discountType === 'flat' ? 'bg-brand-teal text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {currSymbol}
                </button>
                <button
                  type="button"
                  onClick={() => setValue('discount_type', 'percent')}
                  className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${discountType === 'percent' ? 'bg-brand-teal text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  %
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                {...register('discount_value')}
                className="h-9 flex-1 rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none"
              />
            </div>
          </div>

          {!editingInvoice && (
            <Input label="Tax Rate (%)" type="number" step="0.1" min="0" max="100" {...register('tax_rate')} />
          )}

          {/* Totals summary */}
          {(() => {
            const taxRate = watch('tax_rate') ?? 0
            const discountAmt = discountType === 'percent'
              ? lineItemSubtotal * (discountValue / 100)
              : discountValue
            const discounted = Math.max(0, lineItemSubtotal - discountAmt)
            const tax = editingInvoice ? (editingInvoice.tax ?? 0) : discounted * (taxRate / 100)
            return (
              <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatCurrency(lineItemSubtotal, currency)}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmt, currency)}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Tax{!editingInvoice && taxRate > 0 ? ` (${taxRate}%)` : ''}</span>
                    <span>{formatCurrency(tax, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                  <span>Total</span>
                  <span>{formatCurrency(discounted + tax, currency)}</span>
                </div>
              </div>
            )
          })()}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...register('notes')} />
          </div>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            {editingInvoice ? 'Save Changes' : 'Create Invoice'}
          </Button>
        </form>
      </InlineFormSheet>

      {/* Create Customer Modal */}
      <Modal open={newCustOpen} onClose={() => setNewCustOpen(false)} title="Add New Customer" size="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">First Name <span className="text-red-500">*</span></label>
              <input
                value={newCust.first_name}
                onChange={e => setNewCust(p => ({ ...p, first_name: e.target.value }))}
                placeholder="First name"
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Last Name</label>
              <input
                value={newCust.last_name}
                onChange={e => setNewCust(p => ({ ...p, last_name: e.target.value }))}
                placeholder="Last name"
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={newCust.email}
              onChange={e => setNewCust(p => ({ ...p, email: e.target.value }))}
              placeholder="email@example.com"
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Phone</label>
            <PhoneInput
              value={newCust.phone}
              onChange={v => setNewCust(p => ({ ...p, phone: v }))}
              placeholder="Phone number"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Business Name</label>
            <input
              value={newCust.business_name}
              onChange={e => setNewCust(p => ({ ...p, business_name: e.target.value }))}
              placeholder="Company / business name"
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Address</label>
            <textarea
              value={newCust.address}
              onChange={e => setNewCust(p => ({ ...p, address: e.target.value }))}
              placeholder="Full address"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setNewCustOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={newCustSaving} onClick={createCustomer}>Create Customer</Button>
          </div>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        open={!!paymentModal}
        onClose={() => { setPaymentModal(null); setPaymentAmount('') }}
        title="Record Payment"
        size="sm"
      >
        <div className="space-y-4">
          {paymentModal && (
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Remaining balance</span>
                <span className="font-semibold text-gray-900">{formatCurrency(paymentModal.remaining, currency)}</span>
              </div>
            </div>
          )}
          <Input
            label={`Amount received (${currSymbol})`}
            type="number"
            min="0"
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
          />
          <Button
            className="w-full"
            loading={recordingPayment}
            disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
            onClick={recordPayment}
          >
            Record Payment
          </Button>
        </div>
      </Modal>
      {/* Delete Confirm Modal */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Invoice"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete this invoice? This action cannot be undone.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              loading={deleting}
              onClick={() => deleteConfirmId && deleteInvoice(deleteConfirmId)}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
