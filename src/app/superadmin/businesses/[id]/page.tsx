'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Building2, User, CreditCard, GitBranch, Package,
  Wrench, Users, DollarSign, ShieldAlert, ShieldCheck, KeyRound,
  Eye, EyeOff, Check, Globe, Phone, Mail, MapPin, Calendar, ExternalLink,
  CheckCircle2, XCircle, Loader2, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { formatDate, formatCurrency } from '@/lib/utils'
import { MODULES } from '@/backend/config/constants'

const MODULE_LABELS: Record<string, string> = {
  pos: 'POS', inventory: 'Inventory', repairs: 'Repairs',
  customers: 'Customers', appointments: 'Appointments', expenses: 'Expenses',
  employees: 'Employees', reports: 'Reports', messages: 'Messages',
  invoices: 'Invoices', gift_cards: 'Gift Cards', google_reviews: 'Google Reviews',
  phone: 'Phone',
}

interface OwnerProfile {
  id: string; full_name: string | null; email: string | null
  phone: string | null; avatar_url: string | null; created_at: string; role: string
}
interface Branch {
  id: string; name: string; is_main: boolean; is_active: boolean
  address: string | null; phone: string | null
  stats: { repairs: number; products: number; customers: number; staff: number; revenue: number }
}
interface Plan {
  id: string; name: string; plan_type: string; features: string[]
  price_monthly: number | null; price_yearly: number | null
}
interface Subscription {
  id: string; status: string; trial_ends_at: string | null
  current_period_end: string | null; plans: Plan | null
}
interface Business {
  id: string; name: string; subdomain: string; email: string | null
  phone: string | null; address: string | null; maps_url: string | null; logo_url: string | null
  currency: string | null; country: string | null; timezone: string | null
  is_active: boolean; is_suspended: boolean; created_at: string
  subscriptions: Subscription[]
}
interface Stats {
  repairs: number; products: number; customers: number
  employees: number; revenue: number
}
interface Details {
  business: Business; ownerProfile: OwnerProfile | null
  branches: Branch[]; stats: Stats
}
interface BusinessUser {
  id: string; full_name: string | null; email: string | null
  role: string; is_active: boolean
  branches: { id: string; name: string } | null
}

function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string | number; accent?: string
}) {
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-white px-5 py-4 flex items-center gap-4 shadow-sm">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${accent ?? 'bg-primary-container/50'}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-on-surface-variant font-medium">{label}</p>
        <p className="text-xl font-bold text-on-surface mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3 py-2.5 border-b border-outline-variant/30 last:border-0">
      <span className="w-auto sm:w-32 shrink-0 text-[10px] sm:text-xs font-semibold text-outline uppercase tracking-wide">{label}</span>
      <span className="text-sm text-on-surface flex-1">{value ?? <span className="text-outline-variant">—</span>}</span>
    </div>
  )
}

export default function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [details, setDetails] = useState<Details | null>(null)
  const [loading, setLoading] = useState(true)
  const [modules, setModules] = useState<Array<{ module: string; is_enabled: boolean }>>([])

  // Impersonation state
  const [impersonating, setImpersonating] = useState(false)

  // Reset password state
  const [resetModal, setResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [businessUsers, setBusinessUsers] = useState<BusinessUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  // Suspend/activate
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/admin/businesses/${id}/details`).then((r) => r.json()),
      fetch(`/api/admin/businesses/${id}/modules`).then((r) => r.json()),
    ]).then(([detailsJson, modulesJson]) => {
      setDetails(detailsJson.data ?? null)
      setModules(modulesJson.data ?? [])
    }).finally(() => setLoading(false))
  }, [id])

  async function openResetModal() {
    setResetModal(true)
    setResetSuccess(false)
    setNewPassword('')
    setConfirmPassword('')
    setResetError(null)
    setSelectedUserId('')
    setUsersLoading(true)
    try {
      const res = await fetch(`/api/admin/businesses/${id}/users`)
      const json = await res.json()
      setBusinessUsers(json.data ?? [])
    } finally {
      setUsersLoading(false)
    }
  }

  async function handleResetPassword() {
    setResetError(null)
    if (!selectedUserId) {
      setResetError('Please select a user')
      return
    }
    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match')
      return
    }
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/businesses/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, userId: selectedUserId }),
      })
      const json = await res.json()
      if (res.ok) {
        setResetSuccess(true)
      } else {
        setResetError(json.error ?? 'Failed to reset password')
      }
    } finally {
      setResetting(false)
    }
  }

  async function handleImpersonate() {
    setImpersonating(true)
    try {
      const res = await fetch(`/api/admin/businesses/${id}/impersonate`, { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.data?.url) {
        window.open(json.data.url, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setImpersonating(false)
    }
  }

  async function handleToggleSuspend() {
    if (!details) return
    setToggling(true)
    const suspending = details.business.is_active
    await fetch(`/api/businesses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !suspending, is_suspended: suspending }),
    })
    setDetails((d) => d ? {
      ...d,
      business: { ...d.business, is_active: !suspending, is_suspended: suspending },
    } : d)
    setToggling(false)
  }


  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!details) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
        <Building2 className="h-10 w-10 opacity-30" />
        <p className="text-sm">Business not found</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>Go back</Button>
      </div>
    )
  }

  const { business, ownerProfile, branches, stats } = details
  const sub = business.subscriptions?.[0] ?? null
  const plan = sub?.plans ?? null

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/superadmin/businesses')}
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-on-surface leading-tight">{business.name}</h1>
              <Badge variant={business.is_active ? 'success' : 'destructive'}>
                {business.is_active ? 'Active' : 'Suspended'}
              </Badge>
            </div>
            <a
              href={`https://${business.subdomain}.repairbooking.co.uk/login`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
            >
              {business.subdomain}.repairbooking.co.uk/login
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-10 sm:pl-0">
          <Button
            size="sm"
            onClick={handleImpersonate}
            loading={impersonating}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Access Dashboard
          </Button>
          <Button
            size="sm"
            onClick={openResetModal}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset Password
          </Button>
          <Button
            size="sm"
            variant={business.is_active ? 'destructive' : 'default'}
            onClick={handleToggleSuspend}
            loading={toggling}
          >
            {business.is_active ? (
              <><ShieldAlert className="h-3.5 w-3.5 mr-1" /> Suspend</>
            ) : (
              <><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Activate</>
            )}
          </Button>
        </div>
      </div>

      {/* ── Live data warning ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-sm font-medium text-amber-800">
          You are viewing <span className="font-bold">{business.name}</span> as superadmin —{' '}
          all actions (suspend, password reset, impersonate) affect live production data immediately.
        </p>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={<Wrench className="h-5 w-5 text-primary" />}       label="Repairs"   value={stats.repairs}              accent="bg-primary-container/50" />
        <StatCard icon={<Package className="h-5 w-5 text-tertiary" />}     label="Products"  value={stats.products}             accent="bg-tertiary-container/40" />
        <StatCard icon={<Users className="h-5 w-5 text-secondary" />}      label="Customers" value={stats.customers}            accent="bg-secondary-container/50" />
        <StatCard icon={<Users className="h-5 w-5 text-on-surface-variant" />} label="Staff" value={stats.employees}            accent="bg-surface-container" />
        <StatCard icon={<DollarSign className="h-5 w-5 text-green-600" />} label="Revenue"   value={formatCurrency(stats.revenue)} accent="bg-green-50" />
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:nth-child(4)]:col-span-2">

        {/* Business Info */}
        <div className="rounded-2xl border border-outline-variant/50 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/30">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-container/50">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-on-surface">Business Information</h2>
          </div>
          <InfoRow label="Name"     value={business.name} />
          <InfoRow label="Subdomain" value={<span className="font-mono text-xs">{business.subdomain}</span>} />
          <InfoRow label="Email"    value={business.email ? <a href={`mailto:${business.email}`} className="text-blue-500 hover:underline inline-flex items-center gap-1"><Mail className="h-3 w-3" />{business.email}</a> : null} />
          <InfoRow label="Phone"    value={business.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" />{business.phone}</span> : null} />
          <InfoRow label="Address"  value={business.address ? <span className="inline-flex items-start gap-1"><MapPin className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />{business.address}</span> : null} />
          <InfoRow label="Maps Link" value={business.maps_url ? <a href={business.maps_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Open in Google Maps</a> : null} />
          <InfoRow label="Country"  value={business.country} />
          <InfoRow label="Currency" value={business.currency} />
          <InfoRow label="Timezone" value={business.timezone} />
          <InfoRow label="Joined"   value={<span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3 text-gray-400" />{formatDate(business.created_at)}</span>} />
        </div>

        {/* Owner Profile */}
        <div className="rounded-2xl border border-outline-variant/50 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/30">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary-container/50">
              <User className="h-4 w-4 text-secondary" />
            </div>
            <h2 className="font-semibold text-on-surface">Business Owner</h2>
          </div>
          {ownerProfile ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {ownerProfile.full_name?.charAt(0).toUpperCase() ?? 'O'}
                </div>
                <div>
                  <p className="font-semibold text-on-surface">{ownerProfile.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-outline capitalize">{ownerProfile.role.replace('_', ' ')}</p>
                </div>
              </div>
              <InfoRow label="Email"    value={ownerProfile.email ? <a href={`mailto:${ownerProfile.email}`} className="text-blue-500 hover:underline inline-flex items-center gap-1"><Mail className="h-3 w-3" />{ownerProfile.email}</a> : null} />
              <InfoRow label="Phone"    value={ownerProfile.phone} />
              <InfoRow label="Auth ID"  value={<span className="font-mono text-[11px] text-gray-400 break-all">{ownerProfile.id}</span>} />
              <InfoRow label="Joined"   value={formatDate(ownerProfile.created_at)} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-outline-variant">
              <User className="h-8 w-8" />
              <p className="text-sm text-outline">No owner profile found</p>
            </div>
          )}
        </div>

        {/* Subscription & Plan */}
        <div className="rounded-2xl border border-outline-variant/50 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/30">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-tertiary-container/40">
              <CreditCard className="h-4 w-4 text-tertiary" />
            </div>
            <h2 className="font-semibold text-on-surface">Subscription & Plan</h2>
          </div>
          {sub ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{plan?.name ?? 'Unknown plan'}</p>
                  <p className="text-xs text-gray-400 capitalize">{plan?.plan_type ?? ''} plan</p>
                </div>
                <Badge variant={
                  sub.status === 'active' ? 'success' :
                  sub.status === 'trialing' ? 'warning' : 'destructive'
                } className="capitalize">
                  {sub.status}
                </Badge>
              </div>
              {plan?.price_monthly != null && (
                <InfoRow label="Monthly" value={`${formatCurrency(plan.price_monthly)} / mo`} />
              )}
              {sub.trial_ends_at && (
                <InfoRow label="Trial ends" value={formatDate(sub.trial_ends_at)} />
              )}
              {sub.current_period_end && (
                <InfoRow label="Renews" value={formatDate(sub.current_period_end)} />
              )}
              <InfoRow label="Sub ID" value={<span className="font-mono text-[11px] text-gray-400 break-all">{sub.id}</span>} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-outline-variant">
              <CreditCard className="h-8 w-8" />
              <p className="text-sm text-outline">No active subscription</p>
            </div>
          )}
        </div>

        {/* Branches */}
        <div className="rounded-2xl border border-outline-variant/50 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-outline-variant/30">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-container/50">
                <GitBranch className="h-4 w-4 text-primary" />
              </div>
              <h2 className="font-semibold text-on-surface">Branches</h2>
            </div>
            <span className="text-xs font-medium text-outline bg-surface-container px-2 py-0.5 rounded-full">{branches.length} total</span>
          </div>
          {branches.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-outline-variant">
              <GitBranch className="h-8 w-8" />
              <p className="text-sm text-outline">No branches configured</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className={`rounded-xl border p-4 ${
                    b.is_active
                      ? 'border-primary/20 bg-primary-container/10'
                      : 'border-outline-variant/40 bg-surface-container-low/50'
                  }`}
                >
                  {/* Branch header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 mt-0.5 ${
                        b.is_active ? 'bg-green-500' : 'bg-outline-variant'
                      }`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{b.name}</p>
                        {b.address && (
                          <p className="text-xs text-outline truncate mt-0.5">{b.address}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {b.is_main && (
                        <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded-full font-medium">Main</span>
                      )}
                      <Badge variant={b.is_active ? 'success' : 'secondary'} className="text-[10px]">
                        {b.is_active ? 'Active' : 'Off'}
                      </Badge>
                    </div>
                  </div>
                  {/* Branch stats */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { label: 'Repairs',   value: b.stats.repairs },
                      { label: 'Products',  value: b.stats.products },
                      { label: 'Customers', value: b.stats.customers },
                      { label: 'Staff',     value: b.stats.staff },
                      { label: 'Revenue',   value: formatCurrency(b.stats.revenue), span: true },
                    ].map(({ label, value, span }) => (
                      <div
                        key={label}
                        className={`rounded-lg bg-white/70 border border-outline-variant/20 px-2.5 py-1.5 ${
                          span ? 'col-span-2' : ''
                        }`}
                      >
                        <p className="text-[9px] font-semibold text-outline uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-bold text-on-surface mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Module Access ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/50 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-outline-variant/30">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-container/50">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-on-surface">Module Access</h2>
          <span className="text-xs font-medium text-outline bg-surface-container px-2 py-0.5 rounded-full ml-1">
            {modules.filter((m) => m.is_enabled).length}/{MODULES.length} enabled
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {[...MODULES].map((mod) => {
            const m = modules.find((r) => r.module === mod)
            const enabled = m?.is_enabled ?? false
            return (
              <div
                key={mod}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${
                  enabled
                    ? 'border-primary/20 bg-primary-container/15'
                    : 'border-outline-variant/30 bg-surface-container-low/50'
                }`}
              >
                {enabled
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-outline-variant shrink-0" />
                }
                <span className={`text-xs font-medium ${
                  enabled ? 'text-on-surface' : 'text-outline'
                }`}>
                  {MODULE_LABELS[mod] ?? mod}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Reset Password Modal ─────────────────────────────────────────────── */}
      <Modal
        open={resetModal}
        onClose={() => setResetModal(false)}
        title="Reset User Password"
        size="sm"
      >
        <div className="space-y-4">
          {!resetSuccess ? (
            <>
              {/* User picker */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Select User</label>
                {usersLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {businessUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSelectedUserId(u.id)}
                        className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          selectedUserId === u.id
                            ? 'border-primary bg-primary-container/20'
                            : 'border-gray-200 bg-gray-50 hover:border-primary/40 hover:bg-primary-container/10'
                        }`}
                      >
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
                          {u.full_name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">
                            {u.full_name ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] font-medium bg-surface-container text-outline px-1.5 py-0.5 rounded-full capitalize">
                            {u.role.replace('_', ' ')}
                          </span>
                          {u.branches && (
                            <span className="text-[10px] text-primary truncate max-w-[80px]">
                              {u.branches.name}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Password fields — only shown once a user is selected */}
              {selectedUserId && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 pr-10 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Confirm Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              {resetError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {resetError}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setResetModal(false)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleResetPassword} loading={resetting} disabled={!selectedUserId}>
                  <KeyRound className="h-3.5 w-3.5 mr-1" />
                  Set Password
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <p className="text-sm font-medium">Password updated successfully!</p>
              </div>
              <p className="text-sm text-on-surface-variant">
                The new password has been set for{' '}
                <strong>{businessUsers.find((u) => u.id === selectedUserId)?.email ?? 'the user'}</strong>.
              </p>
              <Button className="w-full" variant="outline" onClick={() => setResetModal(false)}>
                Done
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
