'use client'
import { useState, useEffect, useCallback } from 'react'
import { Eye, Receipt, X, Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { pdf } from '@react-pdf/renderer'
import { SaleReceiptPdf } from '@/components/pdf/sale-receipt-pdf'
import type { ColumnDef } from '@tanstack/react-table'

// ── Types ────────────────────────────────────────────────────────────────────

interface SaleRow {
  id: string
  branch_id: string
  customer_id: string | null
  cashier_id: string | null
  subtotal: number
  discount: number
  tax: number
  total: number
  payment_method: string
  payment_status: string
  payment_splits: { method: string; amount: number }[] | null
  is_refund: boolean
  refund_reason: string | null
  original_sale_id: string | null
  notes: string | null
  created_at: string
  customers?: { first_name: string; last_name: string | null } | null
  profiles?: { full_name: string | null } | null
}

interface SaleItem {
  id: string
  name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
}

interface SaleDetail extends SaleRow {
  sale_items: SaleItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', gift_card: 'Gift Card', split: 'Split', voucher: 'Voucher',
}
const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  refunded: 'bg-red-100 text-red-800',
  partial: 'bg-yellow-100 text-yellow-800',
}

function customerName(c: SaleRow['customers']) {
  if (!c) return '—'
  return `${c.first_name} ${c.last_name ?? ''}`.trim()
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { activeBranch } = useAuthStore()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Detail modal
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  // Summary
  const [summary, setSummary] = useState({ totalSales: 0, totalRevenue: 0, totalRefunds: 0, refundCount: 0 })

  const fetchSales = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const params = new URLSearchParams({
      branch_id: activeBranch.id,
      page: String(page + 1),
      limit: '20',
    })
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    const res = await fetch(`/api/pos/sales?${params}`)
    const json = await res.json()
    const rows: SaleRow[] = json.data ?? []
    // Client-side status filter (API doesn't support it)
    const filtered = statusFilter ? rows.filter(r => r.payment_status === statusFilter) : rows
    setSales(filtered)
    setTotal(json.meta?.total ?? 0)

    // Compute summary from full page (unfiltered for totals)
    const revenue = rows.filter(r => !r.is_refund).reduce((s, r) => s + Number(r.total), 0)
    const refunds = rows.filter(r => r.is_refund)
    setSummary({
      totalSales: rows.filter(r => !r.is_refund).length,
      totalRevenue: revenue,
      totalRefunds: refunds.reduce((s, r) => s + Number(r.total), 0),
      refundCount: refunds.length,
    })
    setLoading(false)
  }, [activeBranch, page, dateFrom, dateTo, statusFilter])

  useEffect(() => { fetchSales() }, [fetchSales])

  async function viewDetail(id: string) {
    setDetailOpen(true)
    setDetailLoading(true)
    const res = await fetch(`/api/pos/sales/${id}`)
    if (res.ok) {
      const json = await res.json()
      setDetail(json.data ?? null)
    }
    setDetailLoading(false)
  }

  async function downloadReceipt(sale: SaleDetail) {
    const blob = await pdf(
      <SaleReceiptPdf
        saleId={sale.id}
        date={formatDateTime(sale.created_at)}
        customerName={customerName(sale.customers)}
        cashierName={sale.profiles?.full_name ?? '—'}
        paymentMethod={sale.payment_method}
        paymentStatus={sale.payment_status}
        items={(sale.sale_items ?? []).map(i => ({
          name: i.name, quantity: i.quantity,
          unit_price: Number(i.unit_price), discount: Number(i.discount), total: Number(i.total),
        }))}
        subtotal={Number(sale.subtotal)}
        discount={Number(sale.discount)}
        tax={Number(sale.tax)}
        total={Number(sale.total)}
        isRefund={sale.is_refund}
        refundReason={sale.refund_reason}
        paymentSplits={sale.payment_splits}
        notes={sale.notes}
      />
    ).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-${sale.id.slice(-8)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function fetchAndDownloadReceipt(id: string) {
    const res = await fetch(`/api/pos/sales/${id}`)
    if (!res.ok) return
    const json = await res.json()
    if (json.data) await downloadReceipt(json.data)
  }

  // ── Columns ──────────────────────────────────────────────────────────────

  const columns: ColumnDef<SaleRow>[] = [
    {
      accessorKey: 'id',
      header: 'Sale #',
      cell: ({ getValue }) => {
        const id = getValue() as string
        return <span className="font-mono text-xs">{id.slice(-8).toUpperCase()}</span>
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ getValue }) => formatDateTime(getValue() as string),
    },
    {
      accessorKey: 'customers',
      header: 'Customer',
      cell: ({ getValue }) => customerName(getValue() as SaleRow['customers']),
    },
    {
      accessorKey: 'profiles',
      header: 'Cashier',
      cell: ({ getValue }) => (getValue() as SaleRow['profiles'])?.full_name ?? '—',
    },
    {
      accessorKey: 'payment_method',
      header: 'Payment',
      cell: ({ row }) => {
        const method = row.original.payment_method
        if (method === 'split' && row.original.payment_splits?.length) {
          return row.original.payment_splits.map(s => PAYMENT_LABELS[s.method] ?? s.method).join(' + ')
        }
        return PAYMENT_LABELS[method] ?? method
      },
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const isRefund = row.original.is_refund
        return (
          <span className={isRefund ? 'text-red-600' : ''}>
            {isRefund ? '-' : ''}{formatCurrency(Number(row.original.total))}
          </span>
        )
      },
    },
    {
      accessorKey: 'payment_status',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue() as string
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800'}`}>
            {status}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => viewDetail(row.original.id)} title="View details">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fetchAndDownloadReceipt(row.original.id)} title="Download receipt">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-sm text-gray-500">View all POS transactions</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Total Sales" value={String(summary.totalSales)} />
        <SummaryCard label="Revenue" value={formatCurrency(summary.totalRevenue)} className="text-green-600" />
        <SummaryCard label="Refunds" value={String(summary.refundCount)} />
        <SummaryCard label="Refund Amount" value={formatCurrency(summary.totalRefunds)} className="text-red-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input type="date" className="rounded-md border px-3 py-1.5 text-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input type="date" className="rounded-md border px-3 py-1.5 text-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select className="rounded-md border px-3 py-1.5 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        {(dateFrom || dateTo || statusFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter(''); setPage(0) }}>
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sales}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No sales found"
      />

      {/* Detail Modal */}
      <Modal open={detailOpen} onClose={() => { setDetailOpen(false); setDetail(null) }} title="Sale Details" size="lg">
        {detailLoading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
        ) : detail ? (
          <div className="space-y-4">
            {/* Sale info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Sale #</span><br /><span className="font-mono">{detail.id.slice(-8).toUpperCase()}</span></div>
              <div><span className="text-gray-500">Date</span><br />{formatDateTime(detail.created_at)}</div>
              <div><span className="text-gray-500">Customer</span><br />{customerName(detail.customers)}</div>
              <div><span className="text-gray-500">Cashier</span><br />{detail.profiles?.full_name ?? '—'}</div>
              <div><span className="text-gray-500">Payment</span><br />{PAYMENT_LABELS[detail.payment_method] ?? detail.payment_method}</div>
              <div>
                <span className="text-gray-500">Status</span><br />
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[detail.payment_status] ?? 'bg-gray-100 text-gray-800'}`}>
                  {detail.payment_status}
                </span>
              </div>
            </div>

            {/* Split payment details */}
            {detail.payment_method === 'split' && detail.payment_splits?.length ? (
              <div className="rounded-md bg-gray-50 p-3">
                <p className="mb-1 text-xs font-medium text-gray-500">Payment Split</p>
                {detail.payment_splits.map((s, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{PAYMENT_LABELS[s.method] ?? s.method}</span>
                    <span>{formatCurrency(s.amount)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Refund info */}
            {detail.is_refund && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                <p className="font-medium text-red-700">Refund</p>
                {detail.refund_reason && <p className="text-red-600">{detail.refund_reason}</p>}
              </div>
            )}

            {/* Items table */}
            <div>
              <p className="mb-2 text-sm font-medium">Items</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-1">Item</th>
                    <th className="pb-1 text-center">Qty</th>
                    <th className="pb-1 text-right">Price</th>
                    <th className="pb-1 text-right">Discount</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.sale_items ?? []).map(item => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-1.5">{item.name}</td>
                      <td className="py-1.5 text-center">{item.quantity}</td>
                      <td className="py-1.5 text-right">{formatCurrency(Number(item.unit_price))}</td>
                      <td className="py-1.5 text-right">{Number(item.discount) > 0 ? `-${formatCurrency(Number(item.discount))}` : '—'}</td>
                      <td className="py-1.5 text-right">{formatCurrency(Number(item.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="rounded-md bg-gray-50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(Number(detail.subtotal))}</span></div>
              {Number(detail.discount) > 0 && (
                <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(Number(detail.discount))}</span></div>
              )}
              {Number(detail.tax) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{formatCurrency(Number(detail.tax))}</span></div>
              )}
              <div className="mt-1 flex justify-between border-t pt-1 font-bold">
                <span>Total</span>
                <span>{formatCurrency(Number(detail.total))}</span>
              </div>
            </div>

            {detail.notes && (
              <div className="text-sm"><span className="text-gray-500">Notes:</span> {detail.notes}</div>
            )}

            <Button className="w-full" variant="outline" onClick={() => downloadReceipt(detail)}>
              <Printer className="mr-2 h-4 w-4" /> Download Receipt
            </Button>
          </div>
        ) : (
          <p className="py-8 text-center text-gray-400">Sale not found</p>
        )}
      </Modal>
    </div>
  )
}

function SummaryCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${className ?? ''}`}>{value}</p>
    </div>
  )
}
