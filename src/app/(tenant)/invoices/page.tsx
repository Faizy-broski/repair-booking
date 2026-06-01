'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus, Download, CreditCard, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'

interface InvoiceRow {
  id: string
  invoice_number: string
  status: string
  subtotal: number
  tax: number
  total: number
  amount_paid: number
  created_at: string
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
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1, 'Add at least one item'),
})

type FormData = z.infer<typeof schema>

export default function InvoicesPage() {
  const router = useRouter()
  const { activeBranch } = useAuthStore()
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [lineItems, setLineItems] = useState([{ description: '', quantity: 1, unit_price: 0 }])
  const [paymentModal, setPaymentModal] = useState<{ invoiceId: string; remaining: number } | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tax_rate: 0, items: [{ description: '', quantity: 1, unit_price: 0 }] },
  })

  const queryClient = useQueryClient()
  const invoiceQueryKey = ['invoices', activeBranch?.id, page, statusFilter]

  const { data: invoiceData, isLoading: loading } = useQuery({
    queryKey: invoiceQueryKey,
    queryFn: async () => {
      const invParams = new URLSearchParams({ branch_id: activeBranch!.id, page: String(page + 1) })
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
    const tax = subtotal * (data.tax_rate / 100)
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        branch_id: activeBranch.id,
        customer_id: data.customer_id || null,
        subtotal,
        tax,
        total: subtotal + tax,
        items: data.items,
      }),
    })
    if (res.ok) {
      reset()
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
      cell: ({ getValue }) => <span className="font-mono font-medium">{getValue() as string}</span>,
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
      cell: ({ getValue }) => <span className="font-semibold">{formatCurrency(getValue() as number)}</span>,
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
      header: '',
      cell: ({ row }) => {
        const inv = row.original
        const remaining = inv.total - (inv.amount_paid ?? 0)
        return (
          <div className="flex gap-1">
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadPdf(row.original.id)}
              onMouseEnter={() => prefetchPdf(`/api/invoices/${row.original.id}/pdf`)}
              onFocus={() => prefetchPdf(`/api/invoices/${row.original.id}/pdf`)}
              disabled={downloadingId === row.original.id}
              title="Download PDF"
            >
              {downloadingId === row.original.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
            </Button>
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
                <p className={`text-xs font-medium ${card.text}`}>{formatCurrency(card.total)}</p>
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
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No invoices yet."
      />

      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New Invoice" side="right">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Customer (optional)</label>
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

          <div className="rounded-lg bg-gray-50 p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatCurrency(lineItemSubtotal)}</span>
            </div>
          </div>

          <Input label="Tax Rate (%)" type="number" step="0.1" min="0" max="100" {...register('tax_rate')} />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...register('notes')} />
          </div>

          <Button type="submit" className="w-full" loading={isSubmitting}>Create Invoice</Button>
        </form>
      </InlineFormSheet>

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
                <span className="font-semibold text-gray-900">{formatCurrency(paymentModal.remaining)}</span>
              </div>
            </div>
          )}
          <Input
            label="Amount received (£)"
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
    </div>
  )
}
