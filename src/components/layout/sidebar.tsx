'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ShoppingCart, Wrench, Package, Users, Calendar,
  DollarSign, BarChart2, MessageSquare, FileText, Gift, Star,
  Phone, Settings, UserCheck, LogOut, Receipt, X, UploadCloud,
  CreditCard, AlertCircle, Smartphone, BookOpen, TrendingUp, PieChart,
  ChevronDown, Bell, Server, Clock, Activity, Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BranchSwitcher } from './branch-switcher'
import type { Role } from '@/backend/config/constants'
import type { ModuleName } from '@/types/module-config'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  requiredRole: Role
  module?: ModuleName
  badge?: string
  subItem?: boolean
}

interface NavGroup {
  parent: NavItem
  children: NavItem[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      href: '/dashboard',      icon: LayoutDashboard, requiredRole: 'cashier' },
  { label: 'POS',            href: '/pos',             icon: ShoppingCart,    requiredRole: 'cashier',        module: 'pos' },
  { label: 'Sales',          href: '/sales',           icon: Receipt,         requiredRole: 'cashier',        module: 'pos' },
  { label: 'Repairs',        href: '/repairs',         icon: Wrench,          requiredRole: 'staff',          module: 'repairs' },
  { label: 'Service Catalogue', href: '/repairs/service-catalogue', icon: BookOpen, requiredRole: 'branch_manager', module: 'repairs', subItem: true },
  { label: 'Inventory',      href: '/inventory',       icon: Package,         requiredRole: 'staff',          module: 'inventory' },
  { label: 'Bulk Upload',    href: '/inventory/bulk-upload', icon: UploadCloud, requiredRole: 'branch_manager', module: 'inventory', subItem: true },
  { label: 'Catalogue',      href: '/inventory/catalogue',   icon: Smartphone,  requiredRole: 'branch_manager', module: 'inventory', subItem: true },
  { label: 'Customers',      href: '/customers',       icon: Users,           requiredRole: 'staff',          module: 'customers' },
  { label: 'Appointments',   href: '/appointments',    icon: Calendar,        requiredRole: 'staff',          module: 'appointments' },
  { label: 'Invoices',       href: '/invoices',        icon: FileText,        requiredRole: 'staff',          module: 'invoices' },
  { label: 'Gift Cards',     href: '/gift-cards',      icon: Gift,            requiredRole: 'staff',          module: 'gift_cards' },
  { label: 'Expenses',       href: '/expenses',        icon: DollarSign,      requiredRole: 'branch_manager', module: 'expenses' },
  { label: 'Employees',      href: '/employees',       icon: UserCheck,       requiredRole: 'branch_manager', module: 'employees' },
  { label: 'Reports',        href: '/reports',                       icon: BarChart2,  requiredRole: 'branch_manager', module: 'reports' },
  { label: 'Sales',          href: '/reports/sales',                icon: Receipt,    requiredRole: 'branch_manager', module: 'reports', subItem: true },
  { label: 'P&L',            href: '/reports/profit-loss',          icon: TrendingUp, requiredRole: 'branch_manager', module: 'reports', subItem: true },
  { label: 'Repairs',        href: '/reports/repairs',              icon: Wrench,     requiredRole: 'branch_manager', module: 'reports', subItem: true },
  { label: 'Tax',            href: '/reports/tax',                  icon: FileText,   requiredRole: 'branch_manager', module: 'reports', subItem: true },
  { label: 'Payments',       href: '/reports/payments',             icon: CreditCard, requiredRole: 'branch_manager', module: 'reports', subItem: true },
  { label: 'Employees',      href: '/reports/employees',            icon: UserCheck,  requiredRole: 'branch_manager', module: 'reports', subItem: true },
  { label: 'Inventory',      href: '/reports/inventory',            icon: Package,    requiredRole: 'branch_manager', module: 'reports', subItem: true },
  { label: 'Z-Report',       href: '/reports/z-report',             icon: PieChart,   requiredRole: 'branch_manager', module: 'reports', subItem: true },
  { label: 'Messages',         href: '/messages',                                icon: MessageSquare, requiredRole: 'cashier',        module: 'messages' },
  { label: 'Phone',            href: '/phone',                                   icon: Phone,         requiredRole: 'cashier',        module: 'phone' },
  { label: 'Google Reviews',   href: '/google-reviews',                          icon: Star,          requiredRole: 'branch_manager', module: 'google_reviews' },
  { label: 'Notifications',    href: '/settings/notifications',                  icon: Bell,          requiredRole: 'branch_manager', module: 'notifications' },
  { label: 'Templates',        href: '/settings/notifications',                  icon: Mail,          requiredRole: 'branch_manager', module: 'notifications', subItem: true },
  { label: 'Email (SMTP)',     href: '/settings/notifications/email',            icon: Server,        requiredRole: 'branch_manager', module: 'notifications', subItem: true },
  { label: 'SMS Gateway',      href: '/settings/notifications/sms',              icon: MessageSquare, requiredRole: 'branch_manager', module: 'notifications', subItem: true },
  { label: 'Invoice Reminders',href: '/settings/notifications/reminders',        icon: Clock,         requiredRole: 'branch_manager', module: 'notifications', subItem: true },
  { label: 'Delivery Logs',    href: '/settings/notifications/delivery-logs',    icon: Activity,      requiredRole: 'branch_manager', module: 'notifications', subItem: true },
  { label: 'Settings',         href: '/settings',                                icon: Settings,      requiredRole: 'branch_manager' },
  { label: 'Account',          href: '/account',                                 icon: CreditCard,    requiredRole: 'cashier' },
]

const ROLE_HIERARCHY: Role[] = ['cashier', 'staff', 'branch_manager', 'business_owner', 'super_admin']

function hasAccess(userRole: string, required: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole as Role) >= ROLE_HIERARCHY.indexOf(required)
}

/** Build ordered list of {parent, children[]} groups from a flat visible-item list */
function buildGroups(items: NavItem[]): NavGroup[] {
  const groups: NavGroup[] = []
  let current: NavGroup | null = null
  for (const item of items) {
    if (!item.subItem) {
      if (current) groups.push(current)
      current = { parent: item, children: [] }
    } else if (current) {
      current.children.push(item)
    }
  }
  if (current) groups.push(current)
  return groups
}

export function Sidebar({ collapsed = false, onClose }: { collapsed?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, activeBranch, clear, subscriptionStatus } = useAuthStore()
  const { isModuleEnabled, configs, isLoading, invalidate: invalidateConfigs } = useModuleConfigStore()
  const hasSubscriptionAccess = subscriptionStatus === null || subscriptionStatus.hasAccess

  // Set of parent hrefs whose children are visible
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    clear()
    // Do NOT invalidateConfigs() here — clearing the persisted config cache causes
    // sidebar skeletons on the very next login. Instead, keep the stale cache in
    // localStorage; the next session's fetchConfigs() will detect the TTL has
    // expired (or branchId changed) and silently refresh without showing skeletons.
    window.location.replace('/login')
  }

  function toggleSection(href: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(href) ? next.delete(href) : next.add(href)
      return next
    })
  }

  // configsReady = we have data to show (may be slightly stale — that's fine,
  // the store revalidates in background). Only false on the very first ever load
  // when localStorage has no data at all (isLoading=true AND configs=null).
  const configsReady = configs !== null

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!hasAccess(profile?.role ?? 'cashier', item.requiredRole)) return false
    if (item.module == null) return true
    if (!configsReady) return false
    return isModuleEnabled(item.module)
  })

  const groups = buildGroups(visibleItems)

  // Auto-expand any group that contains the currently active path
  useEffect(() => {
    if (!configsReady) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const { parent, children } of groups) {
        if (children.length === 0) continue
        const childActive = children.some(
          (c) => pathname === c.href || pathname?.startsWith(c.href + '/')
        )
        if (childActive) next.add(parent.href)
      }
      return next
    })
  }, [pathname, configsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-sidebar-bg text-white transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-[248px]'
      )}
    >
      {/* Brand */}
      <div className={cn(
        'flex h-16 shrink-0 items-center gap-3 border-b border-white/10',
        collapsed ? 'justify-center px-0' : 'px-5'
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal shadow-lg shadow-brand-teal/30">
          <Wrench className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight text-white">RepairBooking</p>
            <p className="text-[10px] text-white/40 tracking-wide uppercase">POS Platform</p>
          </div>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Branch switcher */}
      <BranchSwitcher collapsed={collapsed} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Loading skeletons — only shown on the very first load when there is
            no cached data in localStorage. On subsequent page loads the persisted
            store supplies configs instantly and this block never renders. */}
        {!configsReady && isLoading && (
          <div className="space-y-1 px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-10 rounded-lg bg-white/5 animate-pulse',
                  collapsed ? 'w-10 mx-auto' : 'w-full'
                )}
              />
            ))}
          </div>
        )}

        {configsReady && groups.map(({ parent, children }) => {
          const hasChildren    = children.length > 0
          const isOpen         = expanded.has(parent.href)
          const isDisabled     = !hasSubscriptionAccess && parent.href !== '/account'
          const childIsActive  = hasChildren && children.some(
            (c) => pathname === c.href || pathname?.startsWith(c.href + '/')
          )
          const isParentActive = pathname === parent.href

          return (
            <div key={parent.href}>
              {/* ── Parent row ── */}
              {isDisabled ? (
                <div
                  title={collapsed ? parent.label : undefined}
                  className={cn(
                    'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium mb-0.5',
                    'opacity-30 cursor-not-allowed select-none text-white/50',
                    collapsed && 'justify-center'
                  )}
                >
                  <parent.icon className="h-[18px] w-[18px] shrink-0 text-white/40" />
                  {!collapsed && <span className="truncate flex-1">{parent.label}</span>}
                </div>
              ) : (
                <div
                  className={cn(
                    'group relative flex items-center rounded-lg mb-0.5 transition-all duration-150',
                    isParentActive
                      ? 'bg-brand-teal/20'
                      : childIsActive
                        ? 'bg-white/5'
                        : 'hover:bg-white/8',
                    collapsed && 'justify-center'
                  )}
                >
                  {/* Active indicator */}
                  {isParentActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-brand-teal" />
                  )}

                  {/* Link part */}
                  <Link
                    href={parent.href}
                    title={collapsed ? parent.label : undefined}
                    className={cn(
                      'flex flex-1 items-center gap-3 px-3 py-2.5 text-sm font-medium',
                      collapsed && 'justify-center',
                      isParentActive
                        ? 'text-brand-teal'
                        : childIsActive
                          ? 'text-white'
                          : 'text-white/80 group-hover:text-white'
                    )}
                  >
                    <parent.icon className={cn(
                      'h-[18px] w-[18px] shrink-0 transition-colors',
                      isParentActive ? 'text-brand-teal' : childIsActive ? 'text-white/90' : 'text-white/60 group-hover:text-white'
                    )} />
                    {!collapsed && <span className="truncate flex-1">{parent.label}</span>}
                    {!collapsed && parent.badge && (
                      <span className="ml-auto rounded-full bg-brand-teal px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {parent.badge}
                      </span>
                    )}
                  </Link>

                  {/* Chevron toggle — only when expanded and not collapsed */}
                  {!collapsed && hasChildren && (
                    <button
                      onClick={(e) => toggleSection(parent.href, e)}
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md mr-1 transition-colors',
                        'text-white/40 hover:text-white hover:bg-white/10'
                      )}
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      <ChevronDown className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        isOpen && 'rotate-180'
                      )} />
                    </button>
                  )}
                </div>
              )}

              {/* ── Children (collapsible, hidden when sidebar collapsed) ── */}
              {!collapsed && hasChildren && isOpen && (
                <div className="ml-3 mb-1 border-l border-white/10 pl-1 space-y-0.5">
                  {children.map((child) => {
                    const isChildActive = pathname === child.href || pathname?.startsWith(child.href + '/')
                    const isChildDisabled = !hasSubscriptionAccess && child.href !== '/account'

                    if (isChildDisabled) {
                      return (
                        <div
                          key={child.href}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium opacity-30 cursor-not-allowed select-none text-white/50"
                        >
                          <child.icon className="h-4 w-4 shrink-0 text-white/40" />
                          <span className="truncate">{child.label}</span>
                        </div>
                      )
                    }

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                          isChildActive
                            ? 'bg-brand-teal/20 text-brand-teal'
                            : 'text-white/65 hover:bg-white/8 hover:text-white'
                        )}
                      >
                        {isChildActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-brand-teal" />
                        )}
                        <child.icon className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isChildActive ? 'text-brand-teal' : 'text-white/50 group-hover:text-white'
                        )} />
                        <span className="truncate flex-1">{child.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Expired subscription banner */}
      {!hasSubscriptionAccess && subscriptionStatus !== null && (
        <div className="shrink-0 mx-2 mb-2">
          <Link
            href="/account"
            className={cn(
              'flex items-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2.5 text-red-400 hover:bg-red-500/20 transition-colors',
              collapsed ? 'justify-center' : ''
            )}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">Subscription expired</p>
                <p className="text-[11px] text-red-400/70 truncate">Manage billing →</p>
              </div>
            )}
          </Link>
        </div>
      )}

      {/* User footer */}
      <div className="shrink-0 border-t border-white/10 p-3">
        {!collapsed && profile && (
          <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-white shadow">
              {(profile.full_name ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white/90">{profile.full_name}</p>
              <p className="text-[11px] text-white/40 capitalize">{profile.role?.replace(/_/g, ' ')}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-red-400',
            collapsed ? 'justify-center' : ''
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
