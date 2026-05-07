'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  User, CreditCard, Receipt, CheckCircle2, AlertTriangle,
  Clock, Download, ExternalLink, Loader2, RefreshCw, Zap, PlayCircle, XCircle,
  Camera, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { useTour } from '@/hooks/use-tour'

// ── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string
  name: string
  price_monthly: number
  plan_type: 'free' | 'paid' | 'enterprise'
  features: string[] | null
  max_branches: number | null
  max_users: number | null
}

interface Subscription {
  status: string
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  billing_cycle: string | null
  plan: Plan | null
}

interface AccountData {
  user: { id: string; email: string; full_name: string }
  business: { name: string; stripe_customer_id: string | null }
  subscription: Subscription | null
}

interface Invoice {
  id: string
  date: number
  amount: number
  currency: string
  status: string | null
  period_start: number
  period_end: number
  invoice_pdf: string | null
  hosted_invoice_url: string | null
  description: string | null
}

type Tab = 'account' | 'billing' | 'transactions'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatUnix(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

function daysLeft(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000))
}

/** Safely parse features — handles JSON string, array, or null */
function parseFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : [] }
    catch { return [] }
  }
  return []
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active:    { label: 'Active',    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    trialing:  { label: 'Trial',     className: 'bg-amber-500/15  text-amber-400  border-amber-500/30'  },
    past_due:  { label: 'Past due',  className: 'bg-red-500/15    text-red-400    border-red-500/30'    },
    canceled:  { label: 'Canceled',  className: 'bg-zinc-500/15   text-zinc-400   border-zinc-500/30'   },
    suspended: { label: 'Suspended', className: 'bg-red-500/15    text-red-400    border-red-500/30'    },
    paid:      { label: 'Completed', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  }
  const cfg = map[status] ?? { label: status, className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' }
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', cfg.className)}>
      {cfg.label}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { profile, subscriptionStatus, isOwner, setProfile } = useAuthStore()
  const router = useRouter()
  const { restart: restartTour } = useTour(profile?.id ?? null)
  const hasAccess = subscriptionStatus === null || subscriptionStatus.hasAccess

  const [tab, setTab] = useState<Tab>(hasAccess ? 'account' : 'billing')
  const [accountData, setAccountData] = useState<AccountData | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [openingPortal, setOpeningPortal] = useState(false)

  // Avatar state
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarRemoving, setAvatarRemoving] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  async function handleAvatarUpload(file: File) {
    setAvatarError(null)
    setAvatarUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/account/avatar', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setAvatarError(json.error ?? 'Upload failed')
      } else if (profile) {
        setProfile({ ...profile, avatar_url: json.url })
      }
    } catch {
      setAvatarError('Network error — please try again')
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleAvatarRemove() {
    setAvatarError(null)
    setAvatarRemoving(true)
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setAvatarError(json.error ?? 'Remove failed')
      } else if (profile) {
        setProfile({ ...profile, avatar_url: null })
      }
    } catch {
      setAvatarError('Network error — please try again')
    } finally {
      setAvatarRemoving(false)
    }
  }

  // Fetch account + subscription details
  useEffect(() => {
    fetch('/api/account/subscription')
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setAccountData(json.data)
        else if (json.error) console.error('[account] subscription fetch:', json.error)
      })
      .catch((err) => console.error('[account] subscription fetch:', err))
      .finally(() => setLoadingAccount(false))
  }, [])

  // Fetch invoices when tab switches to transactions
  const fetchInvoices = useCallback(() => {
    setLoadingInvoices(true)
    fetch('/api/account/invoices')
      .then((r) => r.json())
      .then(({ data }) => { if (data) setInvoices(data) })
      .finally(() => setLoadingInvoices(false))
  }, [])

  useEffect(() => {
    if (tab === 'transactions') fetchInvoices()
  }, [tab, fetchInvoices])

  // Fetch plans when billing tab is open
  useEffect(() => {
    if (tab === 'billing') {
      fetch('/api/plans')
        .then((r) => r.json())
        .then(({ data }) => {
          const paid = (data ?? []).filter((p: Plan & { plan_type?: string }) => p.plan_type === 'paid')
          setPlans(paid)
        })
    }
  }, [tab])

  async function handleResubscribe(planId: string) {
    setUpgrading(planId)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/stripe/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const json = await res.json()
      if (!res.ok) setErrorMsg(json.error?.message ?? json.error ?? 'Something went wrong')
      else router.push(json.data.url)
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setUpgrading(null)
    }
  }

  async function handleUpdatePaymentMethod() {
    setOpeningPortal(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) setErrorMsg(json.error ?? 'Something went wrong')
      else window.location.href = json.data.url
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setOpeningPortal(false)
    }
  }

  const sub = accountData?.subscription
  const plan = sub?.plan ?? null
  const isExpired = !hasAccess

  // ── Derived subscription state ─────────────────────────────────────────
  const trialDays = sub?.trial_ends_at ? daysLeft(sub.trial_ends_at) : 0
  const isTrialing = sub?.status === 'trialing' && trialDays > 0
  const isActive = sub?.status === 'active'
  const isPastDue = sub?.status === 'past_due'
  // Truly ended — no point updating payment method, need full resubscribe
  const isCanceled = ['canceled', 'suspended'].includes(sub?.status ?? '')

  // Plans eligible for the upgrade/resubscribe section:
  // - past_due: don't show plans — owner needs to fix payment, not create a new sub
  // - active: only plans more expensive (genuine upgrade)
  // - expired/canceled/no sub: all paid plans (resubscribe)
  const currentPrice = plan?.price_monthly ?? 0
  const upgradablePlans = isPastDue
    ? []
    : isActive
      ? plans.filter((p) => p.price_monthly > currentPrice)
      : plans

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'account',      label: 'Account',                icon: User       },
    ...(isOwner() ? [
      { id: 'billing',      label: 'Subscriptions & Billing', icon: CreditCard as React.ElementType },
      { id: 'transactions', label: 'Transactions',            icon: Receipt as React.ElementType    },
    ] : []),
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-on-surface">Account settings</h1>

      {/* Past-due payment failure banner */}
      {isPastDue && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Payment failed — action required</p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                Your last payment could not be collected. Update your payment method to keep your access.
              </p>
            </div>
          </div>
          <Button
            onClick={handleUpdatePaymentMethod}
            disabled={openingPortal}
            className="shrink-0 bg-amber-500 text-white hover:bg-amber-600 text-xs px-3 py-1.5 h-auto"
          >
            {openingPortal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Update card'}
          </Button>
        </div>
      )}

      {/* Fully expired / canceled banner */}
      {isExpired && !isPastDue && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-red-300">Your subscription has expired</p>
            <p className="text-xs text-red-400/80 mt-0.5">
              All features are locked. Resubscribe below to restore full access.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-outline-variant">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.id
                ? 'border-brand-teal text-brand-teal'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Account Tab ──────────────────────────────────────────────────── */}
      {tab === 'account' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 space-y-5">
            <h2 className="text-base font-semibold text-on-surface">Profile information</h2>
            {loadingAccount ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
              </div>
            ) : (
              <>
                {/* ── Avatar section ─────────────────────────────────── */}
                <div className="flex items-center gap-5">
                  {/* Avatar circle */}
                  <div className="relative shrink-0">
                    <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-outline-variant bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center">
                      {profile?.avatar_url ? (
                        <Image
                          src={profile.avatar_url}
                          alt={profile.full_name ?? 'Avatar'}
                          width={80}
                          height={80}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="text-2xl font-bold text-on-primary">
                          {(profile?.full_name ?? accountData?.user.full_name ?? 'U').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {/* Camera overlay button */}
                    {(avatarUploading || avatarRemoving) && (
                      <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </div>

                  {/* Upload / remove actions */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs"
                        onClick={() => avatarFileRef.current?.click()}
                        disabled={avatarUploading || avatarRemoving}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {profile?.avatar_url ? 'Change photo' : 'Upload photo'}
                      </Button>
                      {profile?.avatar_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-xs text-error hover:text-error hover:bg-error/10"
                          onClick={handleAvatarRemove}
                          disabled={avatarUploading || avatarRemoving}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant">JPG, PNG or WebP · max 2 MB</p>
                    {avatarError && (
                      <p className="text-xs text-error">{avatarError}</p>
                    )}
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleAvatarUpload(file)
                      e.target.value = ''
                    }}
                  />
                </div>

                <div className="h-px bg-outline-variant" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow label="Full name"   value={accountData?.user.full_name ?? profile?.full_name ?? '—'} />
                  <InfoRow label="Email"       value={accountData?.user.email ?? '—'} />
                  <InfoRow label="Role"        value={profile?.role?.replace(/_/g, ' ') ?? '—'} capitalize />
                  <InfoRow label="Business"    value={accountData?.business.name ?? '—'} />
                </div>
              </>
            )}
          </div>

          {/* ── Replay tour ─────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-on-surface">Onboarding tour</h2>
              <p className="mt-0.5 text-sm text-on-surface-variant">
                Revisit the step-by-step walkthrough of every feature on your plan.
              </p>
            </div>
            <Button variant="outline" onClick={restartTour} className="shrink-0 gap-2">
              <PlayCircle className="h-4 w-4" />
              Replay tour
            </Button>
          </div>
        </div>
      )}

      {/* ── Subscriptions & Billing Tab ──────────────────────────────────── */}
      {tab === 'billing' && (
        <div className="space-y-5">
          {loadingAccount ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
            </div>
          ) : (
            <>
              {/* Current plan card */}
              <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <h2 className="text-base font-semibold text-on-surface">Current plan</h2>
                  {sub && <StatusBadge status={isExpired ? 'canceled' : sub.status} />}
                </div>

                {sub ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6 text-sm">
                    <InfoRow label="Plan"       value={plan?.name ?? subscriptionStatus?.planName ?? 'Standard'} />
                    <InfoRow label="Billing"    value={
                      (plan?.plan_type ?? subscriptionStatus?.planType) === 'free'
                        ? 'Free trial'
                        : plan?.price_monthly
                          ? `£${plan.price_monthly}/month`
                          : '—'
                    } />
                    {isTrialing && <InfoRow label="Trial ends"  value={formatDate(sub.trial_ends_at)} />}
                    {isActive && (
                      <InfoRow
                        label="Renews on"
                        value={sub.current_period_end ? formatDate(sub.current_period_end) : 'Manual / no expiry'}
                      />
                    )}
                    {isPastDue && sub.current_period_end && (
                      <InfoRow label="Next retry by" value={formatDate(sub.current_period_end)} />
                    )}
                    {isCanceled && sub.current_period_end && (
                      <InfoRow label="Expired on" value={formatDate(sub.current_period_end)} />
                    )}
                    {plan?.max_branches != null && <InfoRow label="Branches"  value={String(plan.max_branches)} />}
                    {plan?.max_users    != null && <InfoRow label="Staff"     value={String(plan.max_users)}    />}
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant">No active subscription found.</p>
                )}

                {/* Trial warning */}
                {isTrialing && trialDays <= 3 && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                    <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-400">
                      {trialDays === 0 ? 'Your trial expires today.' : `${trialDays} day${trialDays === 1 ? '' : 's'} left in your trial.`}
                    </p>
                  </div>
                )}
              </div>

              {/* Payment method update card — only for past_due */}
              {isPastDue && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-5 w-5 text-amber-400" />
                    <h3 className="text-base font-semibold text-on-surface">Update your payment method</h3>
                  </div>
                  <p className="text-sm text-on-surface-variant mb-5">
                    Your last payment failed. Stripe will retry automatically — update your card now to
                    avoid losing access when retries are exhausted.
                  </p>

                  {errorMsg && (
                    <p className="mb-4 text-sm text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                      {errorMsg}
                    </p>
                  )}

                  <Button
                    onClick={handleUpdatePaymentMethod}
                    disabled={openingPortal}
                    className="bg-amber-500 text-white hover:bg-amber-600 font-semibold gap-2"
                  >
                    {openingPortal
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening billing portal…</>
                      : <><CreditCard className="h-4 w-4" /> Update payment method</>
                    }
                  </Button>

                  <p className="mt-3 text-xs text-on-surface-variant">
                    You'll be redirected to the Stripe billing portal. Your subscription and data are preserved.
                  </p>
                </div>
              )}

              {/* Resubscribe / upgrade section — only when there are relevant plans */}
              {upgradablePlans.length > 0 && (
                <div className="rounded-2xl border border-brand-teal/30 bg-brand-teal/5 p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-5 w-5 text-brand-teal" />
                    <h3 className="text-base font-semibold text-on-surface">
                      {isExpired ? 'Resubscribe to continue' : 'Upgrade your plan'}
                    </h3>
                  </div>
                  <p className="text-sm text-on-surface-variant mb-5">
                    {isExpired
                      ? 'Your subscription has ended. Choose a plan below to restore full access to all features.'
                      : 'Unlock more features and capacity by moving to a higher plan.'}
                  </p>

                  {errorMsg && (
                    <p className="mb-4 text-sm text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                      {errorMsg}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {upgradablePlans.map((p, i) => {
                      const highlighted = upgradablePlans.length >= 2 && i === Math.floor(upgradablePlans.length / 2)
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            'relative flex flex-col rounded-xl border p-5 transition-all',
                            highlighted
                              ? 'border-brand-teal bg-brand-teal/10'
                              : 'border-outline-variant bg-surface-container-low'
                          )}
                        >
                          {highlighted && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-teal px-2.5 py-0.5 text-[10px] font-bold text-white">
                              Most popular
                            </span>
                          )}
                          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{p.name}</p>
                          <div className="flex items-end gap-1 mb-3">
                            <span className="text-3xl font-black text-on-surface">£{p.price_monthly}</span>
                            <span className="text-sm text-on-surface-variant mb-0.5">/mo</span>
                          </div>
                          <ul className="flex-1 space-y-1.5 mb-4">
                            {parseFeatures(p.features).map((f) => (
                              <li key={f} className="flex items-center gap-2 text-xs text-on-surface-variant">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                                <span className="capitalize">{f.replace(/_/g, ' ')}</span>
                              </li>
                            ))}
                          </ul>
                          <Button
                            onClick={() => handleResubscribe(p.id)}
                            disabled={upgrading === p.id}
                            className={cn(
                              'w-full font-semibold',
                              highlighted
                                ? 'bg-brand-teal text-white hover:bg-brand-teal/90'
                                : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'
                            )}
                          >
                            {upgrading === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                            ) : isExpired ? (
                              'Resubscribe'
                            ) : (
                              'Upgrade now'
                            )}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Features list if active */}
              {isActive && plan?.features && parseFeatures(plan.features).length > 0 && (
                <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
                  <h3 className="text-sm font-semibold text-on-surface mb-3">Included features</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {parseFeatures(plan.features).map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-on-surface-variant">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-teal" />
                        <span className="capitalize">{f.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Transactions Tab ─────────────────────────────────────────────── */}
      {tab === 'transactions' && (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
            <h2 className="text-base font-semibold text-on-surface">Transactions</h2>
            <button
              onClick={fetchInvoices}
              disabled={loadingInvoices}
              className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loadingInvoices && 'animate-spin')} />
              Refresh
            </button>
          </div>

          {loadingInvoices ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-8 w-8 text-on-surface-variant/40 mb-2" />
              <p className="text-sm text-on-surface-variant">No transactions found</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">
                Payment history will appear here once you have an active subscription.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-outline-variant text-xs text-on-surface-variant uppercase tracking-wider">
                    <th className="px-6 py-3 text-left font-medium">Date</th>
                    <th className="px-6 py-3 text-left font-medium">Description</th>
                    <th className="px-6 py-3 text-left font-medium">Amount</th>
                    <th className="px-6 py-3 text-left font-medium">Period</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-right font-medium">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-6 py-4 text-on-surface whitespace-nowrap">{formatUnix(inv.date)}</td>
                      <td className="px-6 py-4 text-on-surface-variant max-w-xs truncate">
                        {inv.description ?? 'Subscription payment'}
                      </td>
                      <td className="px-6 py-4 font-medium text-on-surface whitespace-nowrap">
                        {formatMoney(inv.amount, inv.currency)}
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant whitespace-nowrap text-xs">
                        {formatUnix(inv.period_start)} – {formatUnix(inv.period_end)}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={inv.status ?? 'paid'} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {inv.invoice_pdf && (
                            <a
                              href={inv.invoice_pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          )}
                          {inv.hosted_invoice_url && (
                            <a
                              href={inv.hosted_invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                              title="View invoice"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Reusable info row ─────────────────────────────────────────────────────────

function InfoRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-on-surface-variant mb-0.5">{label}</p>
      <p className={cn('text-sm font-semibold text-on-surface', capitalize && 'capitalize')}>{value}</p>
    </div>
  )
}
