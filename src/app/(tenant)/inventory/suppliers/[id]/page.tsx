'use client'
import { useState, use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Truck, Phone, Mail, MapPin, Banknote, FileText, Download, Receipt, Search, X, Loader2, RefreshCw, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { BrandSpinner } from '@/components/ui/brand-spinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

type Tab = 'overview' | 'purchase_orders' | 'payments'

interface SupplierDetail {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  payment_terms_days: number
  currency: string
  is_active: boolean
}

interface PurchaseOrderRow {
  id: string; po_number: string; status: string; total: number
  amount_paid: number; payment_status: string; created_at: string
}

interface Payment { id: string; amount: number; method: string; created_at: string }
interface PayablePO {
  id: string; po_number: string; total: number; amount_paid: number
  payment_status: string; status: string; created_at: string; payments: Payment[]
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-orange-100 text-orange-700',
  unpaid: 'bg-purple-100 text-purple-700',
}

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeBranch } = useAuthStore()
  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'overview'
  const [tab, setTab] = useState<Tab>(initialTab)

  const { data: supplier = null, isLoading } = useQuery<SupplierDetail | null>({
    queryKey: ['supplier-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/suppliers/${id}`)
      return (await res.json()).data ?? null
    },
    staleTime: 5 * 60_000,
  })

  const { data: purchaseOrders = [] } = useQuery<PurchaseOrderRow[]>({
    queryKey: ['supplier-purchase-orders', id, activeBranch?.id],
    queryFn: async () => {
      if (!activeBranch?.id) return []
      const params = new URLSearchParams({ supplier_id: id, branch_id: activeBranch.id, limit: '100' })
      const res = await fetch(`/api/purchase-orders?${params}`)
      return (await res.json()).data ?? []
    },
    enabled: !!activeBranch?.id,
    staleTime: 60_000,
  })

  const { data: payablePOs = [], refetch: refetchPayablePOs, isFetching: isRefreshingPayablePOs } = useQuery<PayablePO[]>({
    queryKey: ['supplier-payment-history', id],
    queryFn: async () => {
      const res = await fetch(`/api/suppliers/${id}/payments`)
      return (await res.json()).data?.purchaseOrders ?? []
    },
    staleTime: 60_000,
  })

  const [statementFrom, setStatementFrom] = useState('')
  const [statementTo,   setStatementTo]   = useState('')
  const [poSearch,      setPoSearch]      = useState('')
  const [downloadingStatement, setDownloadingStatement] = useState(false)
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null)

  // Live-filtered view of received POs (search + date range)
  const filteredPayablePOs = payablePOs.filter((po) => {
    const ref = po.po_number.toLowerCase()
    if (poSearch && !ref.includes(poSearch.toLowerCase())) return false
    if (statementFrom) {
      const poDate = new Date(po.created_at)
      const from = new Date(statementFrom)
      from.setHours(0, 0, 0, 0)
      if (poDate < from) return false
    }
    if (statementTo) {
      const poDate = new Date(po.created_at)
      const to = new Date(statementTo)
      to.setHours(23, 59, 59, 999)
      if (poDate > to) return false
    }
    return true
  })
  const hasActiveFilters = !!(poSearch || statementFrom || statementTo)

  async function downloadReceipt(poId: string, paymentId: string, poRef: string) {
    if (downloadingReceiptId) return
    setDownloadingReceiptId(paymentId)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/receipt?paymentId=${paymentId}`)
      if (!res.ok) { toast.error('Failed to generate receipt'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `po-receipt-${poRef}-payment-${paymentId.slice(-6)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download receipt')
    } finally {
      setDownloadingReceiptId(null)
    }
  }

  async function downloadStatement() {
    setDownloadingStatement(true)
    try {
      const params = new URLSearchParams()
      if (statementFrom) params.set('from', statementFrom)
      if (statementTo) params.set('to', statementTo)
      const res = await fetch(`/api/suppliers/${id}/statement?${params.toString()}`)
      if (!res.ok) { toast.error('Failed to generate statement'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `supplier-statement-${id.slice(-8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingStatement(false)
    }
  }

  const outstanding = payablePOs
    .filter((p) => p.payment_status !== 'paid')
    .reduce((sum, p) => sum + (Number(p.total) - Number(p.amount_paid)), 0)

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><BrandSpinner /></div>
  }

  if (!supplier) {
    return <div className="py-16 text-center text-sm text-gray-400">Supplier not found</div>
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'purchase_orders', label: 'Purchase Orders' },
    { id: 'payments', label: 'Payment History' },
  ]

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/inventory/suppliers')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Suppliers
      </button>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
            <Truck className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{supplier.name}</h1>
            <p className="text-sm text-gray-500">
              {[supplier.contact_person, supplier.city, supplier.country].filter(Boolean).join(' · ') || 'No contact details'}
            </p>
          </div>
        </div>
        <Button onClick={() => router.push(`/inventory/purchase-orders?new=1&supplier_id=${id}`)}>
          <Plus className="h-4 w-4" /> New Purchase Order
        </Button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-brand-teal text-brand-teal' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 pt-4 text-sm">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Contact</h3>
              <div className="flex items-center gap-2 text-gray-600"><Phone className="h-3.5 w-3.5 text-gray-400" /> {supplier.phone ?? '—'}</div>
              <div className="flex items-center gap-2 text-gray-600"><Mail className="h-3.5 w-3.5 text-gray-400" /> {supplier.email ?? '—'}</div>
              <div className="flex items-center gap-2 text-gray-600"><MapPin className="h-3.5 w-3.5 text-gray-400" /> {[supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ') || '—'}</div>
              <div className="mt-2 text-xs text-gray-400">Payment terms: Net {supplier.payment_terms_days} days · {supplier.currency}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-2">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Outstanding Balance</h3>
              <p className={`text-2xl font-bold ${outstanding > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(outstanding)}</p>
              <Link href="/inventory/suppliers?view=credit" className="inline-block text-xs font-medium text-purple-600 hover:underline">
                Manage in Supplier Credit →
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'purchase_orders' && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">PO #</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {purchaseOrders.map((po) => (
                <tr key={po.id}>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{po.po_number}</td>
                  <td className="px-4 py-2 text-gray-600">{formatDate(po.created_at)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[po.payment_status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {po.status === 'received' ? po.payment_status : po.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">{formatCurrency(Number(po.total))}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-600">
                    {formatCurrency(Math.max(0, Number(po.total) - Number(po.amount_paid)))}
                  </td>
                </tr>
              ))}
              {purchaseOrders.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-xs text-gray-400 italic">No purchase orders for this supplier</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {/* Section header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-violet-700 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                <Banknote className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-purple-200">Received Purchase Orders</p>
                <p className="text-lg font-extrabold text-white leading-tight">Supplier Credit</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-purple-200 font-black uppercase tracking-wider">Total Outstanding</p>
              <p className={`text-2xl font-extrabold ${outstanding > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {formatCurrency(outstanding)}
              </p>
            </div>
          </div>

          {/* Filter toolbar */}
          <div className="border-b border-gray-200 bg-slate-800 px-5 py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search PO #..."
                  value={poSearch}
                  onChange={(e) => setPoSearch(e.target.value)}
                  className="h-8 w-44 rounded-lg border border-slate-600 bg-slate-700 pl-7 pr-2.5 text-xs text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700 px-2.5 h-8">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">From</span>
                <input
                  type="date"
                  value={statementFrom}
                  onChange={(e) => setStatementFrom(e.target.value)}
                  className="w-[118px] border-0 bg-transparent text-xs text-white focus:outline-none [color-scheme:dark]"
                />
              </div>
              <span className="text-slate-500 text-xs font-bold">→</span>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700 px-2.5 h-8">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">To</span>
                <input
                  type="date"
                  value={statementTo}
                  onChange={(e) => setStatementTo(e.target.value)}
                  className="w-[118px] border-0 bg-transparent text-xs text-white focus:outline-none [color-scheme:dark]"
                />
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setPoSearch(''); setStatementFrom(''); setStatementTo('') }}
                  className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-700 px-2.5 h-8 text-xs text-slate-300 hover:border-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}

              <div className="flex-1" />

              <Button size="sm" variant="outline" onClick={() => refetchPayablePOs()}
                className="border-slate-500 text-slate-300 hover:bg-slate-700 text-xs font-semibold h-8 gap-1 bg-transparent">
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingPayablePOs ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button size="sm" variant="outline" loading={downloadingStatement} onClick={downloadStatement}
                className="border-purple-400 text-purple-300 hover:bg-purple-900/40 text-xs font-semibold h-8 gap-1 bg-transparent">
                <FileText className="h-3.5 w-3.5" /> Statement
              </Button>
              <Link href="/inventory/suppliers?view=credit" className="flex h-8 items-center text-xs font-semibold text-slate-300 hover:text-white hover:underline">
                Manage →
              </Link>
            </div>

            {hasActiveFilters && (
              <p className="text-[10px] text-purple-300 font-medium">
                Showing {filteredPayablePOs.length} of {payablePOs.length} purchase orders
                {poSearch ? ` · matching "${poSearch}"` : ''}
                {(statementFrom || statementTo) ? ` · ${statementFrom || '…'} → ${statementTo || '…'}` : ''}
              </p>
            )}
          </div>

          {/* Table */}
          {filteredPayablePOs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <Receipt className="h-10 w-10 mb-3 opacity-30" />
              {payablePOs.length === 0
                ? <><p className="text-sm font-medium">No received purchase orders</p><p className="text-xs mt-1">POs marked as received will appear here</p></>
                : <><p className="text-sm font-medium">No results match your filters</p><p className="text-xs mt-1">Try adjusting the date range or PO # search</p></>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: '#1e293b' }}>
                  <tr>
                    <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>PO #</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>PO Date</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Total</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Paid</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Outstanding</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Payments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {filteredPayablePOs.map((po) => {
                    const owed = Number(po.total) - Number(po.amount_paid)
                    const isPaid = owed <= 0.01
                    return (
                      <tr key={po.id} className="border-b border-gray-300 group hover:bg-purple-50/40 transition-colors">
                        <td className="px-5 py-3 align-top">
                          <span className="font-mono text-xs font-semibold text-gray-700">{po.po_number}</span>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-gray-500">{formatDate(po.created_at)}</td>
                        <td className="px-4 py-3 align-top text-right text-xs font-semibold text-gray-700">
                          {formatCurrency(Number(po.total))}
                        </td>
                        <td className="px-4 py-3 align-top text-right text-xs font-semibold text-emerald-600">
                          {formatCurrency(Number(po.amount_paid))}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {isPaid ? '✓ Cleared' : formatCurrency(owed)}
                          </span>
                        </td>
                        <td className="px-5 py-3 align-top">
                          {po.payments.length === 0 ? (
                            <span className="text-xs text-gray-300 italic">No payments yet</span>
                          ) : (
                            <div className="space-y-1.5">
                              {po.payments.map((p) => (
                                <div key={p.id} className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[11px] text-gray-500">{formatDate(p.created_at)}</span>
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600">
                                    {p.method.replace('_', ' ')}
                                  </span>
                                  <span className="font-semibold text-[11px] text-emerald-600">
                                    +{formatCurrency(Number(p.amount))}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={downloadingReceiptId === p.id}
                                    title="Download receipt for this payment"
                                    onClick={() => downloadReceipt(po.id, p.id, po.po_number)}
                                    className="ml-auto flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-600 hover:bg-purple-100 hover:border-purple-300 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                  >
                                    {downloadingReceiptId === p.id
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Download className="h-3 w-3" />}
                                    Receipt
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
