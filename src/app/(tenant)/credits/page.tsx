'use client'
import { useState } from 'react'
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function customerName(c: CreditSale['customers']) {
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

// ── Component ────────────────────────────────────────────────────────────────

export default function CreditsPage() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()

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
      const params = new URLSearchParams({
        branch_id: activeBranch.id,
        payment_method: 'on_account',
        limit: '200',
      })
      if (!showAll) params.set('outstanding_only', 'true')
      const res = await fetch(`/api/pos/sales?${params}`)
      if (!res.ok) return []
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!activeBranch?.id,
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
        <span className="font-medium text-gray-900">{customerName(row.original.customers)}</span>
      ),
    },
    {
      header: 'Sale #',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-500">#{row.original.sale_number ?? row.original.id.slice(-8).toUpperCase()}</span>
      ),
    },
    {
      header: 'Date',
      cell: ({ row }) => <span className="text-sm text-gray-600">{formatDate(row.original.created_at)}</span>,
    },
    {
      header: 'Total',
      cell: ({ row }) => <span className="font-semibold">{formatCurrency(Number(row.original.total))}</span>,
    },
    {
      header: 'Paid',
      cell: ({ row }) => (
        <span className={row.original.amount_paid > 0 ? 'font-medium text-green-700' : 'text-gray-400'}>
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
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-700'}`}>
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
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer Credit</h1>
          <p className="text-sm text-gray-500">On-account sales and outstanding balances</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <Users className="h-5 w-5 text-purple-600" />
            </span>
            <div>
              <p className="text-xs font-medium text-gray-500">Customers on Credit</p>
              <p className="text-2xl font-bold text-gray-900">{uniqueCustomers}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </span>
            <div>
              <p className="text-xs font-medium text-gray-500">Total Outstanding</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </span>
            <div>
              <p className="text-xs font-medium text-gray-500">Fully Cleared</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalCollected)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter toggle */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm">
          <button
            onClick={() => setShowAll(false)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${!showAll ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Outstanding
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${showAll ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            All Credit Sales
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16">
          <CreditCard className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">
            {showAll ? 'No credit sales found' : 'No outstanding credit balances'}
          </p>
          <p className="mt-1 text-xs text-gray-400">Credit sales will appear here after checkout</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <DataTable columns={columns} data={sales} />
        </div>
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

              {/* Payment method */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Received via</label>
                <div className="flex gap-2">
                  {(['cash', 'card'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${paymentMethod === m ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* New outstanding after this payment */}
              {parseFloat(paymentAmount) > 0 && (
                <div className="flex justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                  <span className="text-gray-600">Remaining after this payment</span>
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
