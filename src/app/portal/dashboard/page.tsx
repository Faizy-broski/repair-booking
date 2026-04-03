'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, FileText, LogOut, Clock, CheckCircle2, Package, AlertCircle, XCircle, Loader2 } from 'lucide-react'

interface Customer { id: string; first_name: string; last_name: string | null; email: string; phone: string | null }
interface Business { name: string; currency: string }
interface Repair {
  id: string; job_number: string; status: string
  device_brand: string | null; device_model: string | null; device_type: string | null
  issue: string; estimated_cost: number | null; actual_cost: number | null
  deposit_paid: number | null; created_at: string; collected_at: string | null
  branches: { name: string } | null
}
interface Invoice {
  id: string; invoice_number: string; status: string
  total: number; amount_paid: number; balance_due: number
  due_date: string | null; created_at: string
  branches: { name: string } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  received:      { label: 'Received',             color: 'text-blue-700 bg-blue-50',   icon: <Package className="h-3.5 w-3.5" /> },
  in_progress:   { label: 'In Progress',          color: 'text-yellow-700 bg-yellow-50',icon: <Wrench className="h-3.5 w-3.5" /> },
  waiting_parts: { label: 'Waiting for Parts',    color: 'text-orange-700 bg-orange-50',icon: <Clock className="h-3.5 w-3.5" /> },
  repaired:      { label: 'Ready for Collection', color: 'text-green-700 bg-green-50',  icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  collected:     { label: 'Collected',            color: 'text-gray-600 bg-gray-100',   icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  unrepairable:  { label: 'Unrepairable',         color: 'text-red-700 bg-red-50',      icon: <XCircle className="h-3.5 w-3.5" /> },
}

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  unpaid:   { label: 'Unpaid',   color: 'text-red-700 bg-red-50' },
  partial:  { label: 'Partial',  color: 'text-yellow-700 bg-yellow-50' },
  paid:     { label: 'Paid',     color: 'text-green-700 bg-green-50' },
  refunded: { label: 'Refunded', color: 'text-gray-600 bg-gray-100' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatCurrency(n: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n)
}

export default function PortalDashboard() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [activeTab, setActiveTab] = useState<'repairs' | 'invoices'>('repairs')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = sessionStorage.getItem('portal_token')
    if (!t) { router.replace('/portal/login'); return }
    setToken(t)
  }, [router])

  const fetchAll = useCallback(async (t: string) => {
    setLoading(true)
    const [meRes, ticketsRes, invoicesRes] = await Promise.all([
      fetch(`/api/portal/me?token=${t}`),
      fetch(`/api/portal/tickets?token=${t}`),
      fetch(`/api/portal/invoices?token=${t}`),
    ])

    if (meRes.status === 401) { sessionStorage.clear(); router.replace('/portal/login'); return }

    const [meJson, ticketsJson, invoicesJson] = await Promise.all([
      meRes.json(), ticketsRes.json(), invoicesRes.json(),
    ])
    setCustomer(meJson.data?.customer ?? null)
    setBusiness(meJson.data?.business ?? null)
    setRepairs(ticketsJson.data ?? [])
    setInvoices(invoicesJson.data ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { if (token) fetchAll(token) }, [token, fetchAll])

  function logout() {
    sessionStorage.removeItem('portal_token')
    sessionStorage.removeItem('portal_subdomain')
    router.replace('/portal/login')
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{business?.name}</p>
              <p className="text-xs text-gray-500">Hi, {customer?.first_name}</p>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex rounded-xl border border-gray-200 bg-white p-1 mb-5 shadow-sm">
          {(['repairs', 'invoices'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'repairs' ? <Wrench className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {tab === 'repairs' ? `Repairs (${repairs.length})` : `Invoices (${invoices.length})`}
            </button>
          ))}
        </div>

        {/* Repairs tab */}
        {activeTab === 'repairs' && (
          <div className="space-y-3">
            {repairs.length === 0 ? (
              <div className="rounded-xl bg-white border border-gray-100 p-8 text-center text-gray-400 shadow-sm">
                No repairs found
              </div>
            ) : (
              repairs.map((r) => {
                const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.received
                const device = [r.device_brand, r.device_model].filter(Boolean).join(' ') || r.device_type || 'Device'
                return (
                  <div key={r.id} className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{r.job_number}</p>
                        <p className="text-xs text-gray-500">{device}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </div>
                    <div className="px-4 py-3 text-sm space-y-1">
                      <p className="text-gray-600">{r.issue}</p>
                      <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                        <span>Received {formatDate(r.created_at)}</span>
                        {r.actual_cost != null && (
                          <span className="font-medium text-gray-700">{formatCurrency(r.actual_cost, business?.currency)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Invoices tab */}
        {activeTab === 'invoices' && (
          <div className="space-y-3">
            {invoices.length === 0 ? (
              <div className="rounded-xl bg-white border border-gray-100 p-8 text-center text-gray-400 shadow-sm">
                No invoices found
              </div>
            ) : (
              invoices.map((inv) => {
                const cfg = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.unpaid
                return (
                  <div key={inv.id} className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{inv.invoice_number}</p>
                        <p className="text-xs text-gray-500">{formatDate(inv.created_at)}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="px-4 py-3 text-sm grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-gray-400">Total</p>
                        <p className="font-semibold text-gray-900">{formatCurrency(inv.total, business?.currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Paid</p>
                        <p className="font-semibold text-green-700">{formatCurrency(inv.amount_paid, business?.currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Balance</p>
                        <p className={`font-semibold ${inv.balance_due > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatCurrency(inv.balance_due, business?.currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
