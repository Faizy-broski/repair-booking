'use client'
import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, User, Wrench, ShoppingBag, FileText, Phone, Mail, MapPin, Cpu, CreditCard, Star, Plus, Pencil, Trash2, Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, REPAIR_STATUS_VARIANTS } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDateTime } from '@/lib/utils'

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
  }[]
  sales: {
    id: string
    total: number
    payment_method: string
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

const emptyAssetForm = { name: '', brand: '', model: '', serial_number: '', imei: '', color: '' }

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')

  // Assets
  const [assets,      setAssets]      = useState<Asset[]>([])
  const [assetModal,  setAssetModal]  = useState<{ open: boolean; editing: Asset | null }>({ open: false, editing: null })
  const [assetForm,   setAssetForm]   = useState(emptyAssetForm)
  const [savingAsset, setSavingAsset] = useState(false)

  // Store Credits
  const [creditBalance, setCreditBalance] = useState(0)
  const [creditTxns,    setCreditTxns]    = useState<CreditTxn[]>([])
  const [addCreditModal, setAddCreditModal] = useState(false)
  const [creditAmount,   setCreditAmount]  = useState('')
  const [creditNote,     setCreditNote]    = useState('')

  // Loyalty
  const [loyaltyBalance, setLoyaltyBalance] = useState(0)
  const [loyaltyTxns,    setLoyaltyTxns]    = useState<LoyaltyTxn[]>([])

  const fetchCustomer = useCallback(() => {
    setLoading(true)
    return fetch(`/api/customers/${id}?detail=true`)
      .then((r) => r.json())
      .then((json) => { setCustomer(json.data); setLoading(false) })
  }, [id])

  const fetchAssets = useCallback(() =>
    fetch(`/api/customers/${id}/assets`)
      .then((r) => r.json())
      .then((j) => setAssets(j.data ?? []))
  , [id])

  const fetchCredits = useCallback(() =>
    fetch(`/api/customers/${id}/store-credits`)
      .then((r) => r.json())
      .then((j) => { if (j.data) { setCreditBalance(j.data.balance); setCreditTxns(j.data.transactions ?? []) } })
  , [id])

  const fetchLoyalty = useCallback(() =>
    fetch(`/api/customers/${id}/loyalty`)
      .then((r) => r.json())
      .then((j) => { if (j.data) { setLoyaltyBalance(j.data.balance); setLoyaltyTxns(j.data.transactions ?? []) } })
  , [id])

  useEffect(() => {
    fetchCustomer()
    fetchAssets()
    fetchCredits()
    fetchLoyalty()
  }, [fetchCustomer, fetchAssets, fetchCredits, fetchLoyalty])

  async function saveAsset() {
    setSavingAsset(true)
    const { editing } = assetModal
    const url    = editing ? `/api/customers/assets/${editing.id}` : `/api/customers/${id}/assets`
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assetForm) })
    setAssetModal({ open: false, editing: null })
    fetchAssets()
    setSavingAsset(false)
  }

  async function deleteAsset(assetId: string) {
    if (!confirm('Delete this device?')) return
    await fetch(`/api/customers/assets/${assetId}`, { method: 'DELETE' })
    fetchAssets()
  }

  async function addCredit() {
    const amount = parseFloat(creditAmount)
    if (!amount || amount <= 0) return
    await fetch(`/api/customers/${id}/store-credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, note: creditNote || undefined }),
    })
    setAddCreditModal(false)
    setCreditAmount('')
    setCreditNote('')
    fetchCredits()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />)}
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
    { id: 'repairs',   label: 'Repairs',  count: customer.stats.repair_count },
    { id: 'sales',     label: 'Sales',    count: customer.stats.sale_count },
    { id: 'invoices',  label: 'Invoices', count: customer.stats.invoice_count },
    { id: 'assets',    label: 'Devices',  count: assets.length },
    { id: 'credits',   label: 'Credits & Points' },
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
                <Stat label="Repairs" value={customer.stats.repair_count} icon={<Wrench className="h-4 w-4" />} />
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
                    {r.actual_cost ? formatCurrency(r.actual_cost) : r.estimated_cost ? `~${formatCurrency(r.estimated_cost)}` : '—'}
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
                    <Button size="sm" variant="ghost" onClick={() => deleteAsset(a.id)}>
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
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Store Credits */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-700">Store Credits</h3>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAddCreditModal(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(creditBalance)}</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {creditTxns.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-gray-500">
                    <span className={t.amount >= 0 ? 'text-green-600' : 'text-red-500'}>
                      {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                    </span>
                    <span className="truncate max-w-[8rem] mx-2">{t.note ?? t.type}</span>
                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
                {creditTxns.length === 0 && <p className="text-xs text-gray-400 italic">No transactions yet</p>}
              </div>
            </CardContent>
          </Card>

          {/* Loyalty Points */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <h3 className="text-sm font-semibold text-gray-700">Loyalty Points</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900">{loyaltyBalance.toLocaleString()} pts</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {loyaltyTxns.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-gray-500">
                    <span className={t.points >= 0 ? 'text-green-600' : 'text-red-500'}>
                      {t.points >= 0 ? '+' : ''}{t.points} pts
                    </span>
                    <span>{t.type}</span>
                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
                {loyaltyTxns.length === 0 && <p className="text-xs text-gray-400 italic">No transactions yet</p>}
              </div>
            </CardContent>
          </Card>
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
