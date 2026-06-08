'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, X, Download, Printer, Loader2, Trash2, RotateCcw, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
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
  refund_records?: { id: string; is_refund: boolean; sale_items: { name: string; quantity: number }[] }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', gift_card: 'Gift Card', split: 'Split', voucher: 'Voucher',
}
const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  refunded: 'bg-red-100 text-red-800',
  partial: 'bg-orange-100 text-orange-700',
}

function customerName(c: SaleRow['customers']) {
  if (!c) return '—'
  return `${c.first_name} ${c.last_name ?? ''}`.trim()
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { activeBranch, profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Refund
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundQtys, setRefundQtys] = useState<Record<string, number>>({})
  const [refundReason, setRefundReason] = useState('')
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<'cash' | 'card' | 'store_credit'>('cash')

  // Download states
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadingDetail, setDownloadingDetail] = useState(false)

  const canDelete = ['business_owner', 'branch_manager', 'super_admin'].includes(profile?.role ?? '')

  const deleteMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const res = await fetch(`/api/pos/sales/${saleId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete sale')
    },
    onSuccess: () => {
      toast.success('Sale deleted and inventory restored')
      setDeleteConfirmId(null)
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!detail) return
      const items = (detail.sale_items ?? [])
        .filter(i => (refundQtys[i.id] ?? 0) > 0)
        .map(i => {
          const effectiveUnitPrice = Number(i.total) / i.quantity
          return {
            product_id: (i as any).product_id ?? null,
            variant_id: (i as any).variant_id ?? null,
            name: i.name,
            quantity: refundQtys[i.id],
            unit_price: effectiveUnitPrice,
            total: effectiveUnitPrice * refundQtys[i.id],
            is_service: false,
          }
        })
      if (!items.length) throw new Error('Select at least one item to refund')
      const subtotal = items.reduce((s, i) => s + i.total, 0)
      const res = await fetch('/api/pos/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_sale_id: detail.id,
          branch_id: detail.branch_id,
          cashier_id: profile?.id,
          customer_id: detail.customer_id ?? null,
          subtotal,
          tax: 0,
          total: subtotal,
          payment_method: refundPaymentMethod,
          refund_reason: refundReason || null,
          items,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to process refund')
    },
    onSuccess: () => {
      toast.success('Refund processed successfully')
      setRefundOpen(false)
      setRefundQtys({})
      setRefundReason('')
      setRefundPaymentMethod('cash')
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      queryClient.invalidateQueries({ queryKey: ['sale-detail', detail?.id] })
    },
    onError: (err: Error) => { toast.error(err.message) },
  })

  function getAlreadyRefunded(item: SaleItem): number {
    if (!detail?.refund_records) return 0
    return detail.refund_records
      .filter(r => r.is_refund)
      .flatMap(r => r.sale_items)
      .filter(s => s.name === item.name)
      .reduce((sum, s) => sum + s.quantity, 0)
  }

  function openRefund() {
    if (!detail) return
    const initial: Record<string, number> = {}
    detail.sale_items?.forEach(i => {
      const remaining = i.quantity - getAlreadyRefunded(i)
      initial[i.id] = remaining
    })
    setRefundQtys(initial)
    setRefundReason('')
    setRefundPaymentMethod('cash')
    setRefundOpen(true)
  }

  const { data: salesData, isLoading: loading, isFetching } = useQuery({
    queryKey: ['sales', activeBranch?.id, page, pageSize, dateFrom, dateTo, statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        branch_id: activeBranch!.id,
        page: String(page + 1),
        limit: String(pageSize),
      })
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/pos/sales?${params}`)
      const json = await res.json()
      return { rows: (json.data ?? []) as SaleRow[], total: json.meta?.total ?? 0 }
    },
    enabled: !!activeBranch,
    placeholderData: (prev) => prev,
    refetchOnMount: true,
  })

  const { data: statsData } = useQuery({
    queryKey: ['sales-stats', activeBranch?.id, dateFrom, dateTo, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id })
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/pos/sales/stats?${params}`)
      const json = await res.json()
      return json.data as { sales_count: number; revenue: number; refund_count: number; refund_amount: number }
    },
    enabled: !!activeBranch,
    placeholderData: (prev) => prev,
    refetchOnMount: true,
  })

  function refreshSales() {
    queryClient.invalidateQueries({ queryKey: ['sales'] })
    queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
  }

  const { data: detail = null, isLoading: detailLoading } = useQuery<SaleDetail | null>({
    queryKey: ['sale-detail', detailId],
    queryFn: async () => {
      if (!detailId) return null
      const res = await fetch(`/api/pos/sales/${detailId}`)
      if (!res.ok) return null
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!detailId && detailOpen
  })

  const sales = salesData?.rows ?? []
  const total = salesData?.total ?? 0
  const summary = {
    totalSales: statsData?.sales_count ?? 0,
    totalRevenue: statsData?.revenue ?? 0,
    totalRefunds: statsData?.refund_amount ?? 0,
    refundCount: statsData?.refund_count ?? 0,
  }

  function viewDetail(id: string) {
    setDetailId(id)
    setDetailOpen(true)
  }

  // Hover over the download button starts server-side PDF generation in the background.
  // Uses redirect:'manual' so only the 302 response is received — the PDF body is NOT
  // downloaded, which means no wasted bandwidth. By click time the cache is usually warm.
  function prefetchPdf(url: string) {
    fetch(url, { redirect: 'manual' } as RequestInit).catch(() => {})
  }

  async function triggerReceiptDownload(saleId: string, setLoading: (v: boolean) => void) {
    setLoading(true)
    const slowTimer = setTimeout(() => toast.info('Generating receipt, please wait…'), 400)
    try {
      const res = await fetch(`/api/pos/sales/${saleId}/pdf`)
      if (!res.ok) { toast.error('Failed to generate receipt'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipt-${saleId.slice(-8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download receipt')
    } finally {
      clearTimeout(slowTimer)
      setLoading(false)
    }
  }

  function downloadReceipt(sale: SaleDetail, fromDetail = false) {
    triggerReceiptDownload(sale.id, fromDetail ? setDownloadingDetail : () => {})
  }

  function fetchAndDownloadReceipt(id: string) {
    triggerReceiptDownload(id, (v) => { if (!v) setDownloadingId(null); else setDownloadingId(id) })
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
            {isRefund ? '-' : ''}{formatCurrency(Math.abs(Number(row.original.total)))}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchAndDownloadReceipt(row.original.id)}
            onMouseEnter={() => prefetchPdf(`/api/pos/sales/${row.original.id}/pdf`)}
            onFocus={() => prefetchPdf(`/api/pos/sales/${row.original.id}/pdf`)}
            disabled={downloadingId === row.original.id}
            title="Download receipt"
          >
            {downloadingId === row.original.id
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
          </Button>
          {canDelete && !row.original.is_refund && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:bg-red-50 hover:text-red-700"
              onClick={() => setDeleteConfirmId(row.original.id)}
              title="Delete sale"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
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
        <Button variant="outline" size="sm" onClick={refreshSales} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Total Sales" value={String(summary.totalSales)} />
        <SummaryCard label="Revenue" value={formatCurrency(summary.totalRevenue)} className="text-green-600" />
        <SummaryCard label="Refunds" value={String(summary.refundCount)} />
        <SummaryCard label="Refund Amount" value={formatCurrency(summary.totalRefunds)} className="text-red-600" />
      </div>

      {/* Quick date range */}
      <div className="flex gap-1 rounded-full border p-1 w-fit">
        {([
          { label: 'This Month', days: 0 },
          { label: '3 Months', days: 90 },
          { label: '6 Months', days: 180 },
          { label: 'This Year', days: -1 },
        ] as const).map(({ label, days }) => {
          const getRange = () => {
            const now = new Date()
            if (days === -1) return { from: `${now.getFullYear()}-01-01`, to: '' }
            if (days === 0) return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: '' }
            const from = new Date(now); from.setDate(from.getDate() - days)
            return { from: from.toISOString().slice(0, 10), to: '' }
          }
          const range = getRange()
          const active = dateFrom === range.from && dateTo === range.to
          return (
            <button
              key={label}
              onClick={() => { setDateFrom(range.from); setDateTo(range.to); setPage(0) }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-teal-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Invoice # or customer name…"
              className="w-full rounded-md border px-3 py-1.5 text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => { setSearchInput(''); setSearch('') }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
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
        {(dateFrom || dateTo || statusFilter || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter(''); setSearchInput(''); setSearch(''); setPage(0) }}>
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
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No sales found"
      />

      {/* Detail Modal */}
      <Modal open={detailOpen} onClose={() => { setDetailOpen(false) }} title="Sale Details" size="lg">
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

            {/* Partial refund notice */}
            {!detail.is_refund && detail.payment_status === 'partial' && (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
                Some items have been refunded. Remaining items can still be refunded below.
              </div>
            )}

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

            {/* Refund info + navigate to original sale */}
            {detail.is_refund && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm space-y-2">
                <p className="font-medium text-red-700">Refund Record</p>
                {detail.refund_reason && <p className="text-red-600">{detail.refund_reason}</p>}
                {detail.original_sale_id && (
                  <button
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
                    onClick={() => {
                      setDetailId(detail.original_sale_id!)
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    View original sale to process more refunds →
                  </button>
                )}
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
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{detail.is_refund ? '-' : ''}{formatCurrency(Math.abs(Number(detail.subtotal)))}</span></div>
              {Number(detail.discount) > 0 && (
                <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(Math.abs(Number(detail.discount)))}</span></div>
              )}
              {Number(detail.tax) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{formatCurrency(Math.abs(Number(detail.tax)))}</span></div>
              )}
              <div className="mt-1 flex justify-between border-t pt-1 font-bold">
                <span>Total</span>
                <span className={detail.is_refund ? 'text-red-600' : ''}>{detail.is_refund ? '-' : ''}{formatCurrency(Math.abs(Number(detail.total)))}</span>
              </div>
            </div>

            {detail.notes && (
              <div className="text-sm">
                <span className="text-gray-500">Notes:</span>{' '}
                {detail.is_refund
                  ? detail.notes.replace(
                      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
                      (uuid) => `#${uuid.slice(-8).toUpperCase()}`
                    )
                  : detail.notes}
              </div>
            )}

            {canDelete && !detail.is_refund && detail.payment_status !== 'refunded' && (
              <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={openRefund}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Process Refund
              </Button>
            )}
            <Button className="w-full bg-teal-700 hover:bg-teal-800 text-white" onClick={() => downloadReceipt(detail, true)} disabled={downloadingDetail}>
              {downloadingDetail
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Printer className="mr-2 h-4 w-4" />}
              {downloadingDetail ? 'Generating PDF…' : 'Download Receipt'}
            </Button>
          </div>
        ) : (
          <p className="py-8 text-center text-gray-400">Sale not found</p>
        )}
      </Modal>

      {/* Refund modal */}
      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="Process Refund" size="md">
        {detail && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Select items and quantities to refund.</p>

            {/* Item qty selectors */}
            <div className="divide-y rounded-md border">
              {(detail.sale_items ?? []).map(item => {
                const alreadyRefunded = getAlreadyRefunded(item)
                const remaining = item.quantity - alreadyRefunded
                if (remaining <= 0) return (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 opacity-40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate line-through">{item.name}</p>
                      <p className="text-xs text-red-500">Already refunded</p>
                    </div>
                  </div>
                )
                return (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(Number(item.total) / item.quantity)} × {item.quantity}
                        {Number(item.discount) > 0 && <span className="ml-1 text-green-600">(-{formatCurrency(Number(item.discount))} disc)</span>}
                        {alreadyRefunded > 0 && <span className="ml-1 text-orange-500">({alreadyRefunded} already refunded)</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded border text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                        onClick={() => setRefundQtys(q => ({ ...q, [item.id]: Math.max(0, (q[item.id] ?? 0) - 1) }))}
                        disabled={(refundQtys[item.id] ?? 0) <= 0}
                      >−</button>
                      <span className="w-6 text-center text-sm font-medium">{refundQtys[item.id] ?? 0}</span>
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded border text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                        onClick={() => setRefundQtys(q => ({ ...q, [item.id]: Math.min(remaining, (q[item.id] ?? 0) + 1) }))}
                        disabled={(refundQtys[item.id] ?? 0) >= remaining}
                      >+</button>
                    </div>
                    <div className="w-16 text-right text-sm font-medium ml-3">
                      {formatCurrency((Number(item.total) / item.quantity) * (refundQtys[item.id] ?? 0))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Refund total */}
            <div className="flex justify-between rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold">
              <span>Refund Total</span>
              <span className="text-orange-700">
                {formatCurrency(
                  (detail.sale_items ?? []).reduce((s, i) => s + (Number(i.total) / i.quantity) * (refundQtys[i.id] ?? 0), 0)
                )}
              </span>
            </div>

            {/* Reason */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Reason (optional)</label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Customer changed mind, defective item…"
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
              />
            </div>

            {/* Return payment method */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Return Via</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={refundPaymentMethod}
                onChange={e => setRefundPaymentMethod(e.target.value as 'cash' | 'card' | 'store_credit')}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="store_credit">Store Credit</option>
              </select>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setRefundOpen(false)} disabled={refundMutation.isPending}>
                Cancel
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => refundMutation.mutate()}
                disabled={refundMutation.isPending || Object.values(refundQtys).every(v => v === 0)}
              >
                {refundMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <RotateCcw className="mr-2 h-4 w-4" />}
                {refundMutation.isPending ? 'Processing…' : 'Confirm Refund'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} title="Delete Sale" size="sm">
        <div className="space-y-4">
          {(() => {
            const row = sales.find(s => s.id === deleteConfirmId)
            return row?.payment_status === 'partial' ? (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                <p className="font-semibold mb-1">This sale has partial refunds.</p>
                <p>Deleting it will also delete all associated refund records. Only the unrefunded inventory will be restored. This cannot be undone.</p>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                This will permanently delete the sale and restore inventory quantities. This action cannot be undone.
              </p>
            )
          })()}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteConfirmId!)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Trash2 className="mr-2 h-4 w-4" />}
              {deleteMutation.isPending ? 'Deleting…' : 'Delete Sale'}
            </Button>
          </div>
        </div>
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
