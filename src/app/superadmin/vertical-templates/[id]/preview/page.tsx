'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, LayoutDashboard, ShoppingCart, Wrench, Package, Users,
  Calendar, DollarSign, BarChart2, MessageSquare, FileText, Gift,
  Star, Phone, Settings, UserCheck, LogOut, Receipt, CreditCard,
  TrendingUp, PieChart, Bell, Server, Clock, Activity, Mail,
  Store, ShoppingBag, Scissors, Coffee, Monitor, ChevronRight,
  Eye, BarChart3, Wallet, CheckCircle2, XCircle, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BusinessVerticalTemplate, ModuleName } from '@/types/module-config'

// ── Nav items mirror the real sidebar (minus sub-items for clarity) ───────────

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  module?: ModuleName
  subItem?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',       href: '/dashboard',    icon: LayoutDashboard },
  { label: 'POS',             href: '/pos',          icon: ShoppingCart,   module: 'pos' },
  { label: 'Sales',           href: '/sales',        icon: Receipt,        module: 'pos' },
  { label: 'Repairs',         href: '/repairs',      icon: Wrench,         module: 'repairs' },
  { label: 'Inventory',       href: '/inventory',    icon: Package,        module: 'inventory' },
  { label: 'Customers',       href: '/customers',    icon: Users,          module: 'customers' },
  { label: 'Appointments',    href: '/appointments', icon: Calendar,       module: 'appointments' },
  { label: 'Invoices',        href: '/invoices',     icon: FileText,       module: 'invoices' },
  { label: 'Gift Cards',      href: '/gift-cards',   icon: Gift,           module: 'gift_cards' },
  { label: 'Expenses',        href: '/expenses',     icon: DollarSign,     module: 'expenses' },
  { label: 'Employees',       href: '/employees',    icon: UserCheck,      module: 'employees' },
  { label: 'Reports',         href: '/reports',      icon: BarChart2,      module: 'reports' },
  { label: 'Messages',        href: '/messages',     icon: MessageSquare,  module: 'messages' },
  { label: 'Phone',           href: '/phone',        icon: Phone,          module: 'phone' },
  { label: 'Google Reviews',  href: '/google-reviews', icon: Star,         module: 'google_reviews' },
  { label: 'Notifications',   href: '/settings/notifications', icon: Bell, module: 'notifications' },
  { label: 'Settings',        href: '/settings',     icon: Settings },
]

const ICON_MAP: Record<string, React.ElementType> = {
  store: Store, wrench: Wrench, 'shopping-bag': ShoppingBag,
  scissors: Scissors, coffee: Coffee, monitor: Monitor, package: Package,
}

const MODULE_META: Record<string, { icon: React.ElementType; description: string; color: string }> = {
  pos:            { icon: ShoppingCart,   color: 'bg-blue-100 text-blue-700',     description: 'Process sales, apply discounts, accept payments' },
  inventory:      { icon: Package,        color: 'bg-indigo-100 text-indigo-700', description: 'Manage stock levels, purchase orders and suppliers' },
  repairs:        { icon: Wrench,         color: 'bg-orange-100 text-orange-700', description: 'Track repair jobs, assign technicians, send updates' },
  customers:      { icon: Users,          color: 'bg-violet-100 text-violet-700', description: 'Customer profiles, history and loyalty points' },
  appointments:   { icon: Calendar,       color: 'bg-teal-100 text-teal-700',     description: 'Book and manage customer appointments' },
  expenses:       { icon: Wallet,         color: 'bg-red-100 text-red-700',       description: 'Track business expenses and categories' },
  employees:      { icon: UserCheck,      color: 'bg-pink-100 text-pink-700',     description: 'Staff management, roles and time tracking' },
  reports:        { icon: BarChart3,      color: 'bg-cyan-100 text-cyan-700',     description: 'Sales analytics, profit margins and insights' },
  messages:       { icon: MessageSquare,  color: 'bg-green-100 text-green-700',   description: 'Inter-branch messaging and notifications' },
  invoices:       { icon: FileText,       color: 'bg-amber-100 text-amber-700',   description: 'Generate and send professional invoices' },
  gift_cards:     { icon: Gift,           color: 'bg-rose-100 text-rose-700',     description: 'Issue and redeem gift cards at POS' },
  google_reviews: { icon: Star,           color: 'bg-yellow-100 text-yellow-700', description: 'Auto-request Google reviews after service' },
  phone:          { icon: Phone,          color: 'bg-slate-100 text-slate-700',   description: 'VoIP calling integrated into the dashboard' },
  notifications:  { icon: Bell,           color: 'bg-purple-100 text-purple-700', description: 'Automated SMS/email notifications to customers' },
}

const MODULE_LABELS: Record<string, string> = {
  pos: 'POS', inventory: 'Inventory', repairs: 'Repairs', customers: 'Customers',
  appointments: 'Appointments', expenses: 'Expenses', employees: 'Employees',
  reports: 'Reports', messages: 'Messages', invoices: 'Invoices',
  gift_cards: 'Gift Cards', google_reviews: 'Google Reviews', phone: 'Phone',
  notifications: 'Notifications',
}

// ── Simulated sidebar ─────────────────────────────────────────────────────────

function PreviewSidebar({
  template,
  activeHref,
  onNavClick,
}: {
  template: BusinessVerticalTemplate
  activeHref: string
  onNavClick: (href: string) => void
}) {
  const IconComp = ICON_MAP[template.icon] ?? Store
  const enabledSet = new Set(template.modules_enabled ?? [])

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.module == null || enabledSet.has(item.module as ModuleName)
  )

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col bg-[#111827] text-white">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500 shadow-lg shadow-teal-500/30">
          <IconComp className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-tight text-white">{template.name}</p>
          <p className="text-[10px] text-white/40 tracking-wide uppercase">POS Platform</p>
        </div>
      </div>

      {/* Fake branch switcher */}
      <div className="mx-3 my-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
        <div className="h-2 w-2 rounded-full bg-teal-400" />
        <span className="text-xs font-medium text-white/70">Main Branch</span>
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-white/30" />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-1 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleItems.map((item) => {
          const isActive = activeHref === item.href
          return (
            <button
              key={item.href}
              onClick={() => onNavClick(item.href)}
              className={cn(
                'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium mb-0.5 transition-all duration-150',
                isActive
                  ? 'bg-teal-500/20 text-teal-400'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-teal-400" />
              )}
              <item.icon className={cn(
                'h-[18px] w-[18px] shrink-0',
                isActive ? 'text-teal-400' : 'text-white/50 group-hover:text-white'
              )} />
              <span className="truncate flex-1 text-left">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white shadow">
            B
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white/90">Business Owner</p>
            <p className="text-[11px] text-white/40 capitalize">business owner</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/40">
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span>Sign out</span>
        </div>
      </div>
    </aside>
  )
}

// ── Simulated topbar ──────────────────────────────────────────────────────────

function PreviewTopbar({ title }: { title: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400">
          <Bell className="h-4 w-4" />
        </div>
        <div className="h-8 w-8 rounded-full bg-teal-500 text-sm font-bold text-white flex items-center justify-center shadow">
          B
        </div>
      </div>
    </header>
  )
}

// ── Module content placeholders ───────────────────────────────────────────────

function DashboardContent({ template }: { template: BusinessVerticalTemplate }) {
  const enabledSet = new Set(template.modules_enabled ?? [])
  const enabledModules = (template.modules_enabled ?? []) as ModuleName[]

  const statCards = [
    enabledSet.has('repairs')   && { label: 'Open Repairs',    value: '24',    change: '+3 today',    color: 'bg-orange-50 text-orange-600',  icon: Wrench },
    enabledSet.has('pos')       && { label: 'Sales Today',     value: '£1,240', change: '+12%',        color: 'bg-blue-50 text-blue-600',      icon: ShoppingCart },
    enabledSet.has('customers') && { label: 'Total Customers', value: '542',   change: '+8 this week', color: 'bg-violet-50 text-violet-600',  icon: Users },
    enabledSet.has('inventory') && { label: 'Low Stock Items', value: '7',     change: 'Needs attention', color: 'bg-red-50 text-red-600',    icon: Package },
    enabledSet.has('appointments') && { label: 'Appointments Today', value: '9', change: '2 upcoming', color: 'bg-teal-50 text-teal-600',    icon: Calendar },
    enabledSet.has('employees') && { label: 'Staff On Duty',   value: '5',     change: 'of 8 total',   color: 'bg-pink-50 text-pink-600',     icon: UserCheck },
  ].filter(Boolean) as { label: string; value: string; change: string; color: string; icon: React.ElementType }[]

  return (
    <div className="space-y-6">
      {/* Stats */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {statCards.slice(0, 6).map((card) => (
            <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{card.change}</p>
                </div>
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', card.color)}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active modules overview */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Enabled modules</h3>
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
            {enabledModules.length} active
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {enabledModules.map((mod) => {
            const meta = MODULE_META[mod]
            const ModIcon = meta?.icon ?? Package
            return (
              <div key={mod} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta?.color ?? 'bg-gray-100 text-gray-500')}>
                  <ModIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{MODULE_LABELS[mod] ?? mod}</p>
                  <p className="text-[11px] text-gray-400 leading-tight line-clamp-1">{meta?.description ?? ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Fake recent activity */}
      {(enabledSet.has('repairs') || enabledSet.has('pos')) && (
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-800">Recent activity</h3>
          <div className="space-y-3">
            {[
              enabledSet.has('repairs') && { label: 'iPhone 14 – Screen replacement', meta: 'Assigned to John · In progress', color: 'bg-orange-400' },
              enabledSet.has('pos')     && { label: 'Sale #1042 – £89.00',            meta: 'Main Branch · 10 mins ago',      color: 'bg-blue-400' },
              enabledSet.has('repairs') && { label: 'Samsung S23 – Battery repair',   meta: 'Ready for pickup',               color: 'bg-teal-400' },
              enabledSet.has('customers') && { label: 'New customer: James Walker',   meta: 'Registered online',              color: 'bg-violet-400' },
            ].filter(Boolean).map((row, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-gray-50">
                <div className={cn('h-2.5 w-2.5 shrink-0 rounded-full', (row as any).color)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{(row as any).label}</p>
                  <p className="text-xs text-gray-400">{(row as any).meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ModulePlaceholder({ module }: { module: string }) {
  const meta = MODULE_META[module]
  const ModIcon = meta?.icon ?? Package
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className={cn('flex h-16 w-16 items-center justify-center rounded-2xl', meta?.color ?? 'bg-gray-100 text-gray-400')}>
        <ModIcon className="h-8 w-8" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-800">{MODULE_LABELS[module] ?? module}</h2>
        <p className="mt-1 text-sm text-gray-500 max-w-xs">{meta?.description ?? 'This module is enabled for this template.'}</p>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
      <div className="mt-4 w-full max-w-lg space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-xl bg-gray-100" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const HREF_TO_MODULE: Record<string, string> = {
  '/pos': 'pos', '/sales': 'pos', '/repairs': 'repairs',
  '/inventory': 'inventory', '/customers': 'customers',
  '/appointments': 'appointments', '/invoices': 'invoices',
  '/gift-cards': 'gift_cards', '/expenses': 'expenses',
  '/employees': 'employees', '/reports': 'reports',
  '/messages': 'messages', '/phone': 'phone',
  '/google-reviews': 'google_reviews', '/settings/notifications': 'notifications',
}

export default function TemplatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [template, setTemplate] = useState<BusinessVerticalTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeHref, setActiveHref] = useState('/dashboard')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/admin/vertical-templates/${id}`)
      const json = await res.json()
      setTemplate(json.data ?? null)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Template not found.</p>
        <button onClick={() => router.back()} className="text-sm text-teal-600 hover:underline">← Go back</button>
      </div>
    )
  }

  const enabledSet = new Set(template.modules_enabled ?? [])
  const activeModule = HREF_TO_MODULE[activeHref]
  const isModuleEnabled = !activeModule || enabledSet.has(activeModule as ModuleName)

  const pageTitle = activeHref === '/dashboard'
    ? 'Dashboard'
    : NAV_ITEMS.find((n) => n.href === activeHref)?.label ?? 'Page'

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* ── Preview banner ── */}
      <div className="flex h-10 shrink-0 items-center justify-between bg-gray-900 px-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to templates
          </button>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-teal-400" />
            <span className="text-xs font-medium text-white/80">
              Previewing: <span className="text-white font-semibold">{template.name}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70">
            <Layers className="h-3 w-3" />
            {(template.modules_enabled ?? []).length} modules enabled
          </span>
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            template.is_active ? 'bg-teal-500/20 text-teal-300' : 'bg-red-500/20 text-red-300'
          )}>
            {template.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* ── Simulated tenant shell ── */}
      <div className="flex flex-1 overflow-hidden">
        <PreviewSidebar
          template={template}
          activeHref={activeHref}
          onNavClick={setActiveHref}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <PreviewTopbar title={pageTitle} />

          <main className="flex-1 overflow-y-auto p-6">
            {activeHref === '/dashboard' ? (
              <DashboardContent template={template} />
            ) : !isModuleEnabled ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <XCircle className="h-12 w-12 text-gray-300" />
                <p className="font-medium text-gray-500">This module is not enabled for this template</p>
                <button
                  onClick={() => setActiveHref('/dashboard')}
                  className="text-sm text-teal-600 hover:underline"
                >
                  ← Back to dashboard
                </button>
              </div>
            ) : (
              <ModulePlaceholder module={activeModule!} />
            )}
          </main>
        </div>
      </div>

      {/* ── Module legend strip ── */}
      <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-t border-gray-200 bg-white px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-[11px] font-medium text-gray-400 uppercase tracking-wider mr-1">Modules:</span>
        {(Object.keys(MODULE_META) as ModuleName[]).map((mod) => {
          const enabled = enabledSet.has(mod)
          return (
            <span
              key={mod}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                enabled
                  ? 'bg-teal-50 text-teal-700'
                  : 'bg-gray-100 text-gray-400 line-through'
              )}
            >
              {enabled
                ? <CheckCircle2 className="h-2.5 w-2.5" />
                : <XCircle className="h-2.5 w-2.5" />
              }
              {MODULE_LABELS[mod] ?? mod}
            </span>
          )
        })}
      </div>
    </div>
  )
}
