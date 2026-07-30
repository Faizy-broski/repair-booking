'use client'
import { useState, use } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User, Wrench, ShoppingBag, FileText, Phone, Mail, MapPin, Cpu, CreditCard, Star, Plus, Pencil, Trash2, Banknote, Download, Receipt } from 'lucide-react'
import { BrandSpinner } from '@/components/ui/brand-spinner'
import { Button } from '@/components/ui/button'
import { Badge, REPAIR_STATUS_VARIANTS } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { useAuthStore } from '@/store/auth.store'

type Tab = 'overview' | 'repairs' | 'sales' | 'invoices' | 'assets' | 'credits'

interface CustomerDetail {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
  repairs: {
    id: string
    job_number: string
    status: string
    device_brand: string | null
    device_model: string | null
    created_at: string
    actual_cost: number | null
    estimated_cost: number | null
    discount_amount: number | null
  }[]
  sales: {
    id: string
    sale_number: string | null
    total: number
    payment_method: string
    payment_status: string | null
    amount_paid: number | null
    created_at: string
  }[]
  invoices: {
    id: string
    invoice_number: string
    total: number
    status: string
    created_at: string
  }[]
  stats: {
    repair_count: number
    sale_count: number
    invoice_count: number
    total_spend: number
  }
}

const INVOICE_STATUS_COLOR: Record<string, string> = {
  unpaid:   'bg-red-100 text-red-700',
  partial:  'bg-yellow-100 text-yellow-700',
  paid:     'bg-green-100 text-green-700',
  refunded: 'bg-gray-100 text-gray-600',
}

interface Asset {
  id: string; name: string; brand: string | null; model: string | null
  serial_number: string | null; imei: string | null; color: string | null; is_active: boolean
  repairs?: { id: string; job_number: string; status: string; created_at: string }[]
}
interface CreditTxn { id: string; amount: number; type: string; note: string | null; created_at: string }
interface LoyaltyTxn { id: string; points: number; type: string; created_at: string }
interface CreditPayment { id: string; amount: number; method: string; created_at: string; is_backfilled: boolean }
interface CreditPaymentSale {
  id: string; sale_number: string | null; total: number; amount_paid: number
  payment_status: string; created_at: string; payments: CreditPayment[]
}

const emptyAssetForm = { name: '', brand: '', model: '', serial_number: '', imei: '', color: '' }

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'overview'
  const [tab, setTab] = useState<Tab>(initialTab)
  const { verticalTemplateSlug } = useAuthStore()
  const isRetailStore = verticalTemplateSlug === 'retail-store'

  // Assets
  const [assetModal,  setAssetModal]  = useState<{ open: boolean; editing: Asset | null }>({ open: false, editing: null })
  const [assetForm,   setAssetForm]   = useState(emptyAssetForm)
  const [savingAsset, setSavingAsset] = useState(false)

  // Store Credits
  const [addCreditModal, setAddCreditModal] = useState(false)
  const [creditAmount,   setCreditAmount]  = useState('')
  const [creditNote,     setCreditNote]    = useState('')

  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<string | null>(null)
  const [isDeletingAsset, setIsDeletingAsset] = useState(false)

  // ── Parallel data fetches (all fire simultaneously) ──────────────────────
  const { data: customer = null, isLoading } = useQuery<CustomerDetail | null>({
    queryKey: ['customer-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${id}?detail=true`)
      return (await res.json()).data ?? null
    },
    staleTime: 5 * 60_000,
  })

  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ['customer-assets', id],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${id}/assets`)
      return (await res.json()).data ?? []
    },
    staleTime: 2 * 60_000,
  })

  const { data: creditsData } = useQuery({
    queryKey: ['customer-credits', id],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${id}/store-credits`)
      const j = await res.json()
      return j.data ? { balance: j.data.balance as number, transactions: (j.data.transactions ?? []) as CreditTxn[] } : null
    },
    staleTime: 2 * 60_000,
  })
  const creditBalance = creditsData?.balance ?? 0
  const creditTxns    = creditsData?.transactions ?? []

  const { data: loyaltyData } = useQuery({
    queryKey: ['customer-loyalty', id],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${id}/loyalty`)
      const j = await res.json()
      return j.data ? { balance: j.data.balance as number, transactions: (j.data.transactions ?? []) as LoyaltyTxn[] } : null
    },
    staleTime: 2 * 60_000,
  })
  const loyaltyBalance = loyaltyData?.balance ?? 0
  const loyaltyTxns    = loyaltyData?.transactions ?? []

  // Full per-payment history for on-account sales (date/amount/method per invoice)
  const { data: creditPaymentsData } = useQuery({
    queryKey: ['customer-credit-payments', id],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${id}/credit-payments`)
      const j = await res.json()
      return (j.data?.sales ?? []) as CreditPaymentSale[]
    },
    staleTime: 2 * 60_000,
  })
  const creditPaymentSales = creditPaymentsData ?? []

  const [statementFrom, setStatementFrom] = useState('')
  const [statementTo,   setStatementTo]   = useState('')
  const [creditSearch,  setCreditSearch]  = useState('')
  const [downloadingStatement, setDownloadingStatement] = useState(false)
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null)

  // Live-filtered view of on-account sales (search + date range)
  const filteredCreditSales = creditPaymentSales.filter((s) => {
    const ref = (s.sale_number ?? s.id.slice(-8)).toLowerCase()
    if (creditSearch && !ref.includes(creditSearch.toLowerCase())) return false
    if (statementFrom) {
      const saleDate = new Date(s.created_at)
      const from = new Date(statementFrom)
      from.setHours(0, 0, 0, 0)
      if (saleDate < from) return false
    }
    if (statementTo) {
      const saleDate = new Date(s.created_at)
      const to = new Date(statementTo)
      to.setHours(23, 59, 59, 999)
      if (saleDate > to) return false
    }
    return true
  })
  const hasActiveFilters = !!(creditSearch || statementFrom || statementTo)

  // Download the sale receipt PDF — reuses the same /api/pos/sales/[id]/pdf
  // endpoint that the POS uses, so formatting is always consistent.
  async function downloadPaymentReceipt(saleId: string, paymentId: string, saleRef: string) {
    if (downloadingReceiptId) return
    setDownloadingReceiptId(paymentId)
    try {
      const res = await fetch(`/api/pos/sales/${saleId}/pdf?paymentId=${paymentId}`)
      if (!res.ok) { toast.error('Failed to generate receipt'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipt-${saleRef}-payment-${paymentId.slice(-6)}.pdf`
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
      const res = await fetch(`/api/customers/${id}/statement?${params.toString()}`)
      if (!res.ok) { toast.error('Failed to generate statement'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `statement-${id.slice(-8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingStatement(false)
    }
  }

  // Customer Credit (on-account sales) — a separate system from the prepaid
  // Store Credits wallet above: this is accounts-receivable for unpaid/partially
  // paid sales, tracked on the `sales` table and managed on the /credits page.
  const onAccountSales = (customer?.sales ?? []).filter(
    (s) => s.payment_method === 'on_account' && s.payment_status !== 'paid'
  )
  const onAccountOutstanding = onAccountSales.reduce(
    (sum, s) => sum + (Number(s.total) - Number(s.amount_paid ?? 0)), 0
  )

  async function saveAsset() {
    setSavingAsset(true)
    const { editing } = assetModal
    const url    = editing ? `/api/customers/assets/${editing.id}` : `/api/customers/${id}/assets`
    const method = editing ? 'PUT' : 'POST'
    const prev = queryClient.getQueryData<Asset[]>(['customer-assets', id])
    if (editing) {
      queryClient.setQueryData<Asset[]>(['customer-assets', id], (old = []) =>
        old.map(a => a.id === editing.id ? { ...a, ...assetForm } : a)
      )
    } else {
      const optimistic = { id: `temp-${Date.now()}`, ...assetForm, is_active: true } as Asset
      queryClient.setQueryData<Asset[]>(['customer-assets', id], (old = []) => [...old, optimistic])
    }
    setAssetModal({ open: false, editing: null })
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assetForm) })
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['customer-assets', id] })
    } else {
      if (prev !== undefined) queryClient.setQueryData(['customer-assets', id], prev)
      setAssetModal({ open: true, editing })
      toast.error('Failed to save device.')
    }
    setSavingAsset(false)
  }

  async function handleConfirmDeleteAsset() {
    if (!confirmDeleteAsset) return
    const targetId = confirmDeleteAsset
    const prev = queryClient.getQueryData<Asset[]>(['customer-assets', id])
    setConfirmDeleteAsset(null)
    queryClient.setQueryData<Asset[]>(['customer-assets', id], (old = []) =>
      old.filter(a => a.id !== targetId)
    )
    setIsDeletingAsset(true)
    const res = await fetch(`/api/customers/assets/${targetId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Device deleted successfully.')
      queryClient.invalidateQueries({ queryKey: ['customer-assets', id] })
    } else {
      if (prev !== undefined) queryClient.setQueryData(['customer-assets', id], prev)
      toast.error('Failed to delete device.')
    }
    setIsDeletingAsset(false)
  }

  async function addCredit() {
    const amount = parseFloat(creditAmount)
    if (!amount || amount <= 0) return
    const capturedNote = creditNote
    const prevCredits = queryClient.getQueryData<{ balance: number; transactions: CreditTxn[] } | null>(['customer-credits', id])
    const optimisticTxn: CreditTxn = {
      id: `temp-${Date.now()}`,
      amount,
      type: 'manual',
      note: capturedNote || null,
      created_at: new Date().toISOString(),
    }
    queryClient.setQueryData<{ balance: number; transactions: CreditTxn[] } | null>(['customer-credits', id], (old) => {
      if (!old) return old
      return { balance: old.balance + amount, transactions: [optimisticTxn, ...old.transactions] }
    })
    setAddCreditModal(false)
    setCreditAmount('')
    setCreditNote('')
    const res = await fetch(`/api/customers/${id}/store-credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, note: capturedNote || undefined }),
    })
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['customer-credits', id] })
    } else {
      if (prevCredits !== undefined) queryClient.setQueryData(['customer-credits', id], prevCredits)
      toast.error('Failed to add store credit.')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <BrandSpinner size="lg" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p>Customer not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>Go back</Button>
      </div>
    )
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview',  label: 'Overview' },
    ...(!isRetailStore ? [{ id: 'repairs' as Tab, label: 'Repairs', count: customer.stats.repair_count }] : []),
    { id: 'sales',     label: 'Sales',    count: customer.stats.sale_count },
    { id: 'credits',   label: 'Credits & Points' },
    { id: 'invoices',  label: 'Invoices', count: customer.stats.invoice_count },
    ...(!isRetailStore ? [{ id: 'assets' as Tab, label: 'Devices', count: assets.length }] : []),
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
          <User className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            {customer.first_name} {customer.last_name ?? ''}
          </h1>
          <p className="text-sm text-gray-500">Customer since {new Date(customer.created_at).toLocaleDateString()}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Total spend</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(customer.stats.total_spend)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                tab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Contact</h3>
              {customer.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Phone className="h-4 w-4 text-gray-400" />
                  {customer.phone}
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Mail className="h-4 w-4 text-gray-400" />
                  {customer.email}
                </div>
              )}
              {customer.address && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {customer.address}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Activity</h3>
              <div className="grid grid-cols-2 gap-3">
                {!isRetailStore && <Stat label="Repairs" value={customer.stats.repair_count} icon={<Wrench className="h-4 w-4" />} />}
                <Stat label="Sales" value={customer.stats.sale_count} icon={<ShoppingBag className="h-4 w-4" />} />
                <Stat label="Invoices" value={customer.stats.invoice_count} icon={<FileText className="h-4 w-4" />} />
                <Stat label="Total Spend" value={formatCurrency(customer.stats.total_spend)} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Repairs tab */}
      {tab === 'repairs' && (
        <div className="space-y-2">
          {customer.repairs.length === 0 ? (
            <EmptyState message="No repairs yet" />
          ) : (
            customer.repairs.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/repairs/${r.id}`)}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-semibold text-blue-600">{r.job_number}</p>
                  <p className="truncate text-xs text-gray-500">
                    {[r.device_brand, r.device_model].filter(Boolean).join(' ') || '—'}
                  </p>
                </div>
                <Badge variant={REPAIR_STATUS_VARIANTS[r.status]} className="shrink-0 text-xs">
                  {r.status.replace('_', ' ')}
                </Badge>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-gray-900">
                    {r.actual_cost
                      ? formatCurrency(r.actual_cost)
                      : r.estimated_cost
                      ? `~${formatCurrency(Math.max(0, r.estimated_cost - (r.discount_amount ?? 0)))}`
                      : '—'}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Sales tab */}
      {tab === 'sales' && (
        <div className="space-y-2">
          {customer.sales.length === 0 ? (
            <EmptyState message="No sales yet" />
          ) : (
            customer.sales.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{formatCurrency(s.total)}</p>
                  <p className="text-xs text-gray-400">{s.payment_method.replace('_', ' ')}</p>
                </div>
                <p className="text-xs text-gray-400">{formatDateTime(s.created_at)}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Invoices tab */}
      {tab === 'invoices' && (
        <div className="space-y-2">
          {customer.invoices.length === 0 ? (
            <EmptyState message="No invoices yet" />
          ) : (
            customer.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-gray-700">{inv.invoice_number}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(inv.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLOR[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {inv.status}
                  </span>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(inv.total)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Assets (Devices) tab */}
      {tab === 'assets' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setAssetForm(emptyAssetForm); setAssetModal({ open: true, editing: null }) }}>
              <Plus className="h-4 w-4" /> Add Device
            </Button>
          </div>
          {assets.length === 0 ? (
            <EmptyState message="No devices registered" />
          ) : (
            <div className="divide-y rounded-xl border border-gray-200 bg-white">
              {assets.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                      <Cpu className="h-4 w-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{a.name}</p>
                      <p className="text-xs text-gray-400">
                        {[a.brand, a.model].filter(Boolean).join(' ')}
                        {a.serial_number ? ` · S/N: ${a.serial_number}` : ''}
                        {a.imei ? ` · IMEI: ${a.imei}` : ''}
                      </p>
                      {(a.repairs?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setTab('repairs')}
                          className="mt-0.5 text-xs font-medium text-blue-600 hover:underline"
                        >
                          {a.repairs!.length} repair{a.repairs!.length !== 1 ? 's' : ''}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAssetForm({ name: a.name, brand: a.brand ?? '', model: a.model ?? '', serial_number: a.serial_number ?? '', imei: a.imei ?? '', color: a.color ?? '' })
                        setAssetModal({ open: true, editing: a })
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteAsset(a.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Credits & Points tab */}
      {tab === 'credits' && (
        <div className="space-y-5">

          {/* ── Top row: Store Credits + Loyalty Points ────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">

            {/* Store Credits Card */}
            <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 shadow-sm">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.08),_transparent_60%)]" />
              <div className="relative p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 shadow-inner">
                      <CreditCard className="h-4.5 w-4.5 h-[18px] w-[18px] text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Store Credits</p>
                      <p className="text-2xl font-extrabold text-blue-700 leading-tight">{formatCurrency(creditBalance)}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setAddCreditModal(true)}
                    className="border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 text-xs font-semibold gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {creditTxns.length === 0
                    ? <p className="text-xs text-gray-400 italic py-2 text-center">No transactions yet</p>
                    : creditTxns.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/70 px-2.5 py-1.5 text-xs border border-blue-50">
                        <span className={`font-semibold ${t.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                        </span>
                        <span className="truncate max-w-[8rem] mx-2 text-gray-500">{t.note ?? t.type}</span>
                        <span className="text-gray-400 shrink-0">{new Date(t.created_at).toLocaleDateString()}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>

            {/* Loyalty Points Card */}
            <div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50 shadow-sm">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(251,191,36,0.1),_transparent_60%)]" />
              <div className="relative p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 shadow-inner">
                    <Star className="h-[18px] w-[18px] text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Loyalty Points</p>
                    <p className="text-2xl font-extrabold text-amber-700 leading-tight">{loyaltyBalance.toLocaleString()} <span className="text-base font-semibold">pts</span></p>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {loyaltyTxns.length === 0
                    ? <p className="text-xs text-gray-400 italic py-2 text-center">No transactions yet</p>
                    : loyaltyTxns.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/70 px-2.5 py-1.5 text-xs border border-amber-50">
                        <span className={`font-semibold ${t.points >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {t.points >= 0 ? '+' : ''}{t.points} pts
                        </span>
                        <span className="text-gray-500">{t.type}</span>
                        <span className="text-gray-400 shrink-0">{new Date(t.created_at).toLocaleDateString()}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>

          {/* ── Customer Credit — full-width tabular ──────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Section header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-violet-700 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <Banknote className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-purple-200">On-Account Sales</p>
                  <p className="text-lg font-extrabold text-white leading-tight">Customer Credit</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-purple-200 font-black uppercase tracking-wider">Total Outstanding</p>
                <p className={`text-2xl font-extrabold ${onAccountOutstanding > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                  {formatCurrency(onAccountOutstanding)}
                </p>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="border-b border-gray-200 bg-slate-800 px-5 py-3 space-y-2">
              {/* Row 1: Search + date range */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Sale # search */}
                <div className="relative flex items-center">
                  <svg className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    type="text"
                    placeholder="Search sale #..."
                    value={creditSearch}
                    onChange={(e) => setCreditSearch(e.target.value)}
                    className="h-8 w-44 rounded-lg border border-slate-600 bg-slate-700 pl-7 pr-2.5 text-xs text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {/* Date range */}
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

                {/* Clear filters */}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => { setCreditSearch(''); setStatementFrom(''); setStatementTo('') }}
                    className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-700 px-2.5 h-8 text-xs text-slate-300 hover:border-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    Clear
                  </button>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Actions */}
                <Button size="sm" variant="outline" loading={downloadingStatement} onClick={downloadStatement}
                  className="border-purple-400 text-purple-300 hover:bg-purple-900/40 text-xs font-semibold h-8 gap-1 bg-transparent">
                  <Download className="h-3.5 w-3.5" /> Statement
                </Button>
                <Link href="/credits" className="flex h-8 items-center text-xs font-semibold text-slate-300 hover:text-white hover:underline">
                  Manage →
                </Link>
              </div>

              {/* Active filter summary */}
              {hasActiveFilters && (
                <p className="text-[10px] text-purple-300 font-medium">
                  Showing {filteredCreditSales.length} of {creditPaymentSales.length} sales
                  {creditSearch ? ` · matching "${creditSearch}"` : ''}
                  {(statementFrom || statementTo) ? ` · ${statementFrom || '…'} → ${statementTo || '…'}` : ''}
                </p>
              )}
            </div>

            {/* Table */}
            {filteredCreditSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <Receipt className="h-10 w-10 mb-3 opacity-30" />
                {creditPaymentSales.length === 0
                  ? <><p className="text-sm font-medium">No on-account sales</p><p className="text-xs mt-1">Sales paid by &quot;On Account&quot; will appear here</p></>
                  : <><p className="text-sm font-medium">No results match your filters</p><p className="text-xs mt-1">Try adjusting the date range or sale # search</p></>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800" style={{ backgroundColor: '#1e293b' }}>
                    <tr>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-300" style={{ color: '#cbd5e1' }}>Sale #</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-300" style={{ color: '#cbd5e1' }}>Sale Date</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-300" style={{ color: '#cbd5e1' }}>Total</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-300" style={{ color: '#cbd5e1' }}>Paid</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-300" style={{ color: '#cbd5e1' }}>Outstanding</th>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-300" style={{ color: '#cbd5e1' }}>Payments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300">
                    {filteredCreditSales.map((s) => {
                      const outstanding = Number(s.total) - Number(s.amount_paid ?? 0)
                      const isPaid = outstanding <= 0.01
                      return (
                        <tr key={s.id} className="border-b border-gray-300 group hover:bg-purple-50/40 transition-colors">
                          {/* Sale # */}
                          <td className="px-5 py-3 align-top">
                            <span className="font-mono text-xs font-semibold text-gray-700">
                              #{s.sale_number ?? s.id.slice(-8).toUpperCase()}
                            </span>
                          </td>
                          {/* Date */}
                          <td className="px-4 py-3 align-top text-xs text-gray-500">
                            {new Date(s.created_at).toLocaleDateString()}
                          </td>
                          {/* Total */}
                          <td className="px-4 py-3 align-top text-right text-xs font-semibold text-gray-700">
                            {formatCurrency(Number(s.total))}
                          </td>
                          {/* Paid */}
                          <td className="px-4 py-3 align-top text-right text-xs font-semibold text-emerald-600">
                            {formatCurrency(Number(s.amount_paid ?? 0))}
                          </td>
                          {/* Outstanding badge */}
                          <td className="px-4 py-3 align-top text-right">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              isPaid
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {isPaid ? '✓ Cleared' : formatCurrency(outstanding)}
                            </span>
                          </td>
                          {/* Payment sub-rows */}
                          <td className="px-5 py-3 align-top">
                            {s.payments.length === 0 ? (
                              <span className="text-xs text-gray-300 italic">No payments yet</span>
                            ) : (
                              <div className="space-y-1.5">
                                {s.payments.map((p) => (
                                  <div key={p.id} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] text-gray-500">
                                      {new Date(p.created_at).toLocaleDateString()}
                                    </span>
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600">
                                      {p.method}
                                    </span>
                                    <span className="font-semibold text-[11px] text-emerald-600">
                                      +{formatCurrency(Number(p.amount))}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={downloadingReceiptId === p.id}
                                      title="Download receipt for this payment"
                                      onClick={() => downloadPaymentReceipt(s.id, p.id, s.sale_number ?? s.id.slice(-8).toUpperCase())}
                                      className="ml-auto flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-600 hover:bg-purple-100 hover:border-purple-300 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                    >
                                      {downloadingReceiptId === p.id
                                        ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
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
        </div>
      )}

      {/* Asset modal */}
      <Modal
        open={assetModal.open}
        onClose={() => setAssetModal({ open: false, editing: null })}
        title={assetModal.editing ? 'Edit Device' : 'Add Device'}
        size="sm"
      >
        <div className="space-y-3">
          <Input label="Name / Nickname *" value={assetForm.name} onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Brand"  value={assetForm.brand}  onChange={(e) => setAssetForm((f) => ({ ...f, brand: e.target.value }))} />
            <Input label="Model"  value={assetForm.model}  onChange={(e) => setAssetForm((f) => ({ ...f, model: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Serial No." value={assetForm.serial_number} onChange={(e) => setAssetForm((f) => ({ ...f, serial_number: e.target.value }))} />
            <Input label="IMEI"        value={assetForm.imei}          onChange={(e) => setAssetForm((f) => ({ ...f, imei: e.target.value }))} />
          </div>
          <Input label="Color" value={assetForm.color} onChange={(e) => setAssetForm((f) => ({ ...f, color: e.target.value }))} />
          <Button className="w-full" onClick={saveAsset} loading={savingAsset} disabled={!assetForm.name.trim()}>
            Save Device
          </Button>
        </div>
      </Modal>

      {/* Add credit modal */}
      <Modal
        open={addCreditModal}
        onClose={() => setAddCreditModal(false)}
        title="Add Store Credit"
        size="sm"
      >
        <div className="space-y-3">
          <Input
            label="Amount (£)"
            type="number"
            min="0.01"
            step="0.01"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
            <input
              value={creditNote}
              onChange={(e) => setCreditNote(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              placeholder="e.g. Refund, Goodwill gesture..."
            />
          </div>
          <Button
            className="w-full"
            onClick={addCredit}
            disabled={!creditAmount || parseFloat(creditAmount) <= 0}
          >
            Add {creditAmount ? formatCurrency(parseFloat(creditAmount) || 0) : ''} Credit
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDeleteAsset}
        onClose={() => setConfirmDeleteAsset(null)}
        onConfirm={handleConfirmDeleteAsset}
        title="Delete Device?"
        description="Are you sure you want to delete this device? This action cannot be undone."
        confirmLabel="Delete"
        loading={isDeletingAsset}
      />
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-gray-400">{icon}</span>}
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
      {message}
    </div>
  )
}
