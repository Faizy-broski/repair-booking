'use client'
import { useState } from 'react'
import { useModuleConfigStore } from '@/store/module-config.store'
import { useAuthStore } from '@/store/auth.store'
import { MODULES } from '@/backend/config/constants'
import {
  LayoutDashboard, ShoppingCart, Wrench, Package, Users, Calendar,
  DollarSign, BarChart2, MessageSquare, FileText, Gift, Star,
  Phone, UserCheck, Settings2, Check, X, ChevronRight, Layers, Bell,
} from 'lucide-react'
import Link from 'next/link'
import type { ModuleName } from '@/types/module-config'
import { PageHeader } from '@/components/shared/page-header'

const MODULE_META: Record<ModuleName, { label: string; icon: React.ElementType; description: string }> = {
  pos:           { label: 'Point of Sale',     icon: ShoppingCart, description: 'Process sales, payments, and receipts' },
  repairs:       { label: 'Repairs',           icon: Wrench,       description: 'Manage repair jobs and device tracking' },
  inventory:     { label: 'Inventory',         icon: Package,      description: 'Stock management and low-stock alerts' },
  customers:     { label: 'Customers',         icon: Users,        description: 'CRM, loyalty programs, and customer history' },
  appointments:  { label: 'Appointments',      icon: Calendar,     description: 'Booking calendar and scheduling' },
  invoices:      { label: 'Invoices',          icon: FileText,     description: 'Invoice generation and payment tracking' },
  gift_cards:    { label: 'Gift Cards',        icon: Gift,         description: 'Issue and redeem gift cards' },
  expenses:      { label: 'Expenses',          icon: DollarSign,   description: 'Expense tracking and categories' },
  employees:     { label: 'Employees',         icon: UserCheck,    description: 'Staff management and time tracking' },
  reports:       { label: 'Reports',           icon: BarChart2,    description: 'Revenue, sales, and operational reports' },
  messages:      { label: 'Messages',          icon: MessageSquare,description: 'Internal team messaging' },
  phone:         { label: 'Phone',             icon: Phone,        description: 'WebRTC calling and voicemail' },
  google_reviews: { label: 'Google Reviews',   icon: Star,         description: 'Monitor and respond to Google reviews' },
  notifications:  { label: 'Notifications',    icon: Bell,         description: 'Email and SMS notifications for customers' },
}

export default function ModuleSettingsPage() {
  const { configs, isModuleEnabled } = useModuleConfigStore()
  const { profile, isOwner } = useAuthStore()
  const [saving, setSaving] = useState<ModuleName | null>(null)
  const [feedback, setFeedback] = useState<{ module: ModuleName; ok: boolean } | null>(null)

  const canToggle = isOwner()

  async function handleToggle(module: ModuleName, currentlyEnabled: boolean) {
    if (!canToggle) return
    setSaving(module)
    try {
      const res = await fetch(`/api/settings/modules/${module}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings_override: {} }),
      })
      if (!res.ok) throw new Error('Failed')
      setFeedback({ module, ok: true })
    } catch {
      setFeedback({ module, ok: false })
    } finally {
      setSaving(null)
      setTimeout(() => setFeedback(null), 2000)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Module Settings"
        description="Configure which modules are active for your business and customise their behaviour. Module availability is controlled by your subscription plan."
      />

      {configs === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {MODULES.map((m) => (
            <div key={m} className="h-24 rounded-2xl border border-outline-variant bg-surface-container-low animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {MODULES.map((mod) => {
            const meta = MODULE_META[mod]
            const resolved = configs[mod]
            const enabled = resolved?._meta?.is_enabled ?? false
            const templateName = resolved?._meta?.template_name ?? null
            const hasOverride = resolved?._meta?.has_override ?? false
            const Icon = meta.icon
            const isSaving = saving === mod

            return (
              <div
                key={mod}
                className={`flex items-start gap-4 rounded-2xl border border-outline-variant p-5 transition-colors ${
                  enabled ? 'bg-surface-container-lowest' : 'bg-surface-container-low opacity-60'
                }`}
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  enabled ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'
                }`}>
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-on-surface">{meta.label}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      enabled
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}>
                      {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-on-surface-variant truncate">{meta.description}</p>
                  {templateName && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                      <Layers className="h-3 w-3" />
                      {templateName}
                      {hasOverride && <span className="text-on-surface-variant">(customised)</span>}
                    </p>
                  )}
                </div>

                {enabled && (
                  <Link
                    href={`/settings/modules/${mod}`}
                    className="mt-1 shrink-0 rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-on-surface-variant">
        To enable or disable modules beyond your plan limits, contact your account manager.
        Business owners can customise module settings by clicking the arrow on any active module.
      </p>
    </div>
  )
}
