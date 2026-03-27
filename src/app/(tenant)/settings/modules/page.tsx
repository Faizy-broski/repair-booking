'use client'
import { useState } from 'react'
import { useModuleConfigStore } from '@/store/module-config.store'
import { useAuthStore } from '@/store/auth.store'
import { MODULES } from '@/backend/config/constants'
import {
  LayoutDashboard, ShoppingCart, Wrench, Package, Users, Calendar,
  DollarSign, BarChart2, MessageSquare, FileText, Gift, Star,
  Phone, UserCheck, Settings2, Check, X, ChevronRight, Layers,
} from 'lucide-react'
import Link from 'next/link'
import type { ModuleName } from '@/types/module-config'

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
  google_reviews:{ label: 'Google Reviews',   icon: Star,         description: 'Monitor and respond to Google reviews' },
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
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Module Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure which modules are active for your business and customise their behaviour.
          Module availability is controlled by your subscription plan.
        </p>
      </div>

      {configs === null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {MODULES.map((m) => (
            <div key={m} className="h-24 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
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
                className={`flex items-start gap-4 rounded-xl border p-4 transition-colors ${
                  enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                }`}
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  enabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{meta.label}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      enabled
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 truncate">{meta.description}</p>
                  {templateName && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                      <Layers className="h-3 w-3" />
                      {templateName}
                      {hasOverride && <span className="text-gray-400">(customised)</span>}
                    </p>
                  )}
                </div>

                {enabled && (
                  <Link
                    href={`/settings/modules/${mod}`}
                    className="mt-1 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">
        To enable or disable modules beyond your plan limits, contact your account manager.
        Business owners can customise module settings by clicking the arrow on any active module.
      </p>
    </div>
  )
}
