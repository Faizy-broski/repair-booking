'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, CreditCard, RefreshCw, Banknote, CheckCircle2, AlertCircle, Users, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/shared/data-table'

// ── Types ────────────────────────────────────────────────────────────────────

interface CreditSale {
  id: string
  sale_number: string
  created_at: string
  total: number
  amount_paid: number
  payment_status: string
  customer_id: string | null
  customers?: { first_name: string; last_name: string | null } | null
}

interface StoreCreditTxn {
  id: string
  customer_id: string
  amount: number
  type: string
  note: string | null
  created_at: string
  customers?: { first_name: string; last_name: string | null } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function customerName(c: { first_name: string; last_name: string | null } | null | undefined) {
  if (!c) return '—'
  return `${c.first_name} ${c.last_name ?? ''}`.trim()
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-orange-100 text-orange-700',
  on_account: 'bg-purple-100 text-purple-700',
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partial',
  on_account: 'Unpaid',
}

const TXN_TYPE_COLORS: Record<string, string> = {
  credit: 'bg-green-100 text-green-800',
  debit: 'bg-red-100 text-red-700',
  refund: 'bg-blue-100 text-blue-700',
  adjustment: 'bg-surface-container text-on-surface-variant',
}

const TXN_TYPE_LABELS: Record<string, string> = {
  credit: 'Credit',
  debit: 'Debit',
  refund: 'Refund',
  adjustment: 'Adjustment',
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CreditsPage() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()

  const [view, setView] = useState<'sales' | 'store_credit'>('sales')
  const [showAll, setShowAll] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function downloadReceipt(saleId: string) {
    setDownloadingId(saleId)
    const slowTimer = setTimeout(() => toast.info('Generating receipt…'), 400)
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
      setDownloadingId(null)
    }
  }

  // Record Payment modal state
  const [paymentSale, setPaymentSale] = useState<CreditSale | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash')

  // ── Data fetch ───────────────────────────────────────────────────────────

  const { data: sales = [], isLoading, isFetching, refetch } = useQuery<CreditSale[]>({
    queryKey: ['credits', activeBranch?.id, showAll],
    queryFn: async () => {
      if (!activeBranch?.id) return []
      // The API caps `limit` at 100, so walk every page rather than trusting a
      // single request — otherwise older balances silently fall off the list.
      const PAGE_SIZE = 100
      const all: CreditSale[] = []
      for (let page = 1; page <= 100; page++) {
        const params = new URLSearchParams({
          branch_id: activeBranch.id,
          payment_method: 'on_account',
          page: String(page),
          limit: String(PAGE_SIZE),
        })
        if (!showAll) params.set('outstanding_only', 'true')
        const res = await fetch(`/api/pos/sales?${params}`)
        if (!res.ok) {
          if (page === 1) return []
          throw new Error('Failed to load all credit sales')
        }
        const json = await res.json()
        const rows: CreditSale[] = json.data ?? []
        all.push(...rows)
        if (rows.length < PAGE_SIZE) break
      }
      return all
    },
    enabled: !!activeBranch?.id,
    staleTime: 30_000,
  })

  const {
    data: storeCreditTxns = [],
    isLoading: isLoadingStoreCredit,
    isFetching: isFetchingStoreCredit,
    refetch: refetchStoreCredit,
  } = useQuery<StoreCreditTxn[]>({
    queryKey: ['store-credit-activity'],
    queryFn: async () => {
      const res = await fetch('/api/store-credits')
      if (!res.ok) return []
      const json = await res.json()
      return json.data ?? []
    },
    staleTime: 30_000,
  })

  // ── Summary stats ────────────────────────────────────────────────────────

  const outstandingSales = sales.filter(s => s.payment_status !== 'paid')
  const uniqueCustomers = new Set(outstandingSales.map(s => s.customer_id).filter(Boolean)).size
  const totalOutstanding = outstandingSales.reduce((sum, s) => sum + (Number(s.total) - Number(s.amount_paid)), 0)
  const totalCollected = sales.filter(s => s.payment_status === 'paid').reduce((sum, s) => sum + Number(s.total), 0)

  // ── Record payment mutation ──────────────────────────────────────────────

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentSale) return
      const amount = parseFloat(paymentAmount)
      if (!amount || amount <= 0) throw new Error('Enter a valid amount')
      const outstanding = Number(paymentSale.total) - Number(paymentSale.amount_paid)
      if (amount > outstanding + 0.01) throw new Error(`Cannot exceed outstanding balance of ${formatCurrency(outstanding)}`)
      const res = await fetch(`/api/pos/sales/${paymentSale.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, payment_method: paymentMethod }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to record payment')
    },
    onSuccess: () => {
      toast.success('Payment recorded successfully')
      setPaymentSale(null)
      setPaymentAmount('')
      setPaymentMethod('cash')
      queryClient.invalidateQueries({ queryKey: ['credits'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Columns ──────────────────────────────────────────────────────────────

  const columns: ColumnDef<CreditSale>[] = [
    {
      header: 'Customer',
      cell: ({ row }) => (
        row.original.customer_id ? (
          <Link
            href={`/customers/${row.original.customer_id}?tab=credits`}
            className="font-medium text-purple-700 hover:underline"
          >
            {customerName(row.original.customers)}
          </Link>
        ) : (
          <span className="font-medium text-on-surface">{customerName(row.original.customers)}</span>
        )
      ),
    },
    {
      header: 'Sale #',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-on-surface-variant">#{row.original.sale_number ?? row.original.id.slice(-8).toUpperCase()}</span>
      ),
    },
    {
      header: 'Date',
      cell: ({ row }) => <span className="text-sm text-on-surface-variant">{formatDate(row.original.created_at)}</span>,
    },
    {
      header: 'Total',
      cell: ({ row }) => <span className="font-semibold">{formatCurrency(Number(row.original.total))}</span>,
    },
    {
      header: 'Paid',
      cell: ({ row }) => (
        <span className={row.original.amount_paid > 0 ? 'font-medium text-green-700' : 'text-outline'}>
          {formatCurrency(Number(row.original.amount_paid))}
        </span>
      ),
    },
    {
      header: 'Outstanding',
      cell: ({ row }) => {
        const owed = Number(row.original.total) - Number(row.original.amount_paid)
        return (
          <span className={owed > 0 ? 'font-bold text-red-600' : 'font-medium text-green-600'}>
            {formatCurrency(Math.max(0, owed))}
          </span>
        )
      },
    },
    {
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.payment_status
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s] ?? 'bg-surface-container text-on-surface-variant'}`}>
            {STATUS_LABELS[s] ?? s}
          </span>
        )
      },
    },
    {
      header: 'Actions',
      cell: ({ row }) => {
        const sale = row.original
        const isDownloading = downloadingId === sale.id
        return (
          <div className="flex items-center gap-2">
            {sale.payment_status !== 'paid' && (
              <button
                onClick={() => { setPaymentSale(sale); setPaymentAmount(''); setPaymentMethod('cash') }}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
              >
                <Banknote className="h-3.5 w-3.5" /> Record Payment
              </button>
            )}
            <button
              onClick={() => downloadReceipt(sale.id)}
              disabled={isDownloading}
              title="Download updated receipt"
              className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50 transition-colors"
            >
              {isDownloading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              {isDownloading ? 'Generating…' : 'Receipt'}
            </button>
          </div>
        )
      },
    },
  ]

  const storeCreditColumns: ColumnDef<StoreCreditTxn>[] = [
    {
      header: 'Customer',
      cell: ({ row }) => (
        <span className="font-medium text-on-surface">{customerName(row.original.customers)}</span>
      ),
    },
    {
      header: 'Type',
      cell: ({ row }) => {
        const t = row.original.type
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TXN_TYPE_COLORS[t] ?? 'bg-surface-container text-on-surface-variant'}`}>
            {TXN_TYPE_LABELS[t] ?? t}
          </span>
        )
      },
    },
    {
      header: 'Amount',
      cell: ({ row }) => {
        const amt = Number(row.original.amount)
        return (
          <span className={`font-semibold ${amt >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {amt >= 0 ? '+' : ''}{formatCurrency(amt)}
          </span>
        )
      },
    },
    {
      header: 'Note',
      cell: ({ row }) => (
        <span className="text-sm text-on-surface-variant">{row.original.note ?? '—'}</span>
      ),
    },
    {
      header: 'Date',
      cell: ({ row }) => <span className="text-sm text-on-surface-variant">{formatDate(row.original.created_at)}</span>,
    },
  ]

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer Credit</h1>
          <p className="text-sm text-on-surface-variant">On-account sales and outstanding balances</p>
        </div>
        <button
          onClick={() => (view === 'sales' ? refetch() : refetchStoreCredit())}
          disabled={view === 'sales' ? isFetching : isFetchingStoreCredit}
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-medium text-on-surface-variant shadow-sm hover:bg-surface-container-low disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${(view === 'sales' ? isFetching : isFetchingStoreCredit) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* View toggle — two unrelated data sources: on-account sales vs. the prepaid store-credit wallet ledger */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-outline-variant bg-surface-container-low p-0.5 text-sm">
          <button
            onClick={() => setView('sales')}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'sales' ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface-variant'}`}
          >
            On-Account Sales
          </button>
          <button
            onClick={() => setView('store_credit')}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'store_credit' ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface-variant'}`}
          >
            Store Credit Activity
          </button>
        </div>
      </div>

      {view === 'sales' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <Users className="h-5 w-5 text-purple-600" />
                </span>
                <div>
                  <p className="text-xs font-medium text-on-surface-variant">Customers on Credit</p>
                  <p className="text-2xl font-bold text-on-surface">{uniqueCustomers}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </span>
                <div>
                  <p className="text-xs font-medium text-on-surface-variant">Total Outstanding</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </span>
                <div>
                  <p className="text-xs font-medium text-on-surface-variant">Fully Cleared</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalCollected)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter toggle */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-outline-variant bg-surface-container-low p-0.5 text-sm">
              <button
                onClick={() => setShowAll(false)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${!showAll ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface-variant'}`}
              >
                Outstanding
              </button>
              <button
                onClick={() => setShowAll(true)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${showAll ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface-variant'}`}
              >
                All Credit Sales
              </button>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-outline" />
            </div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface py-16">
              <CreditCard className="mb-3 h-10 w-10 text-outline-variant" />
              <p className="text-sm font-medium text-on-surface-variant">
                {showAll ? 'No credit sales found' : 'No outstanding credit balances'}
              </p>
              <p className="mt-1 text-xs text-outline">Credit sales will appear here after checkout</p>
            </div>
          ) : (
            <div className="rounded-xl border border-outline-variant bg-surface shadow-sm overflow-hidden">
              <DataTable columns={columns} data={sales} />
            </div>
          )}
        </>
      )}

      {view === 'store_credit' && (
        <>
          {isLoadingStoreCredit ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-outline" />
            </div>
          ) : storeCreditTxns.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface py-16">
              <CreditCard className="mb-3 h-10 w-10 text-outline-variant" />
              <p className="text-sm font-medium text-on-surface-variant">No store credit activity found</p>
              <p className="mt-1 text-xs text-outline">
                Wallet top-ups, spends, refunds and adjustments will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-outline-variant bg-surface shadow-sm overflow-hidden">
              <DataTable columns={storeCreditColumns} data={storeCreditTxns} />
            </div>
          )}
        </>
      )}

      {/* Record Payment Modal */}
      <Modal
        open={!!paymentSale}
        onClose={() => { if (!recordPaymentMutation.isPending) setPaymentSale(null) }}
        title="Record Payment"
        size="sm"
      >
        {paymentSale && (() => {
          const outstanding = Math.max(0, Number(paymentSale.total) - Number(paymentSale.amount_paid))
          return (
            <div className="space-y-4">
              {/* Sale summary */}
              <div className="rounded-lg bg-purple-50 px-4 py-3 text-sm">
                <p className="font-semibold text-purple-900">{customerName(paymentSale.customers)}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-purple-600">Sale Total</p>
                    <p className="font-bold text-purple-900">{formatCurrency(Number(paymentSale.total))}</p>
                  </div>
                  <div>
                    <p className="text-purple-600">Already Paid</p>
                    <p className="font-bold text-green-700">{formatCurrency(Number(paymentSale.amount_paid))}</p>
                  </div>
                  <div>
                    <p className="text-purple-600">Outstanding</p>
                    <p className="font-bold text-red-600">{formatCurrency(outstanding)}</p>
                  </div>
                </div>
              </div>

              {/* Amount input */}
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                  Amount to record <span className="font-normal text-outline">(max {formatCurrency(outstanding)})</span>
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

              {/* Payment method */}
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-variant">Received via</label>
                <div className="flex gap-2">
                  {(['cash', 'card'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${paymentMethod === m ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* New outstanding after this payment */}
              {parseFloat(paymentAmount) > 0 && (
                <div className="flex justify-between rounded-md bg-surface-container-low px-3 py-2 text-sm">
                  <span className="text-on-surface-variant">Remaining after this payment</span>
                  <span className={`font-semibold ${outstanding - parseFloat(paymentAmount) <= 0.01 ? 'text-green-600' : 'text-amber-700'}`}>
                    {formatCurrency(Math.max(0, outstanding - (parseFloat(paymentAmount) || 0)))}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setPaymentSale(null)}
                  disabled={recordPaymentMutation.isPending}
                >
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
