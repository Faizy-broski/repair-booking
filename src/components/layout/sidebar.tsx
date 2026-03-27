'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Wrench, Package, Users, Calendar,
  DollarSign, BarChart2, MessageSquare, FileText, Gift, Star,
  Phone, Settings, UserCheck, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Role } from '@/backend/config/constants'
import type { ModuleName } from '@/types/module-config'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  requiredRole: Role
  module?: ModuleName
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      href: '/dashboard',      icon: LayoutDashboard, requiredRole: 'cashier' },
  { label: 'POS',            href: '/pos',             icon: ShoppingCart,    requiredRole: 'cashier',        module: 'pos' },
  { label: 'Repairs',        href: '/repairs',         icon: Wrench,          requiredRole: 'staff',          module: 'repairs' },
  { label: 'Inventory',      href: '/inventory',       icon: Package,         requiredRole: 'staff',          module: 'inventory' },
  { label: 'Customers',      href: '/customers',       icon: Users,           requiredRole: 'staff',          module: 'customers' },
  { label: 'Appointments',   href: '/appointments',    icon: Calendar,        requiredRole: 'staff',          module: 'appointments' },
  { label: 'Invoices',       href: '/invoices',        icon: FileText,        requiredRole: 'staff',          module: 'invoices' },
  { label: 'Gift Cards',     href: '/gift-cards',      icon: Gift,            requiredRole: 'staff',          module: 'gift_cards' },
  { label: 'Expenses',       href: '/expenses',        icon: DollarSign,      requiredRole: 'branch_manager', module: 'expenses' },
  { label: 'Employees',      href: '/employees',       icon: UserCheck,       requiredRole: 'branch_manager', module: 'employees' },
  { label: 'Reports',        href: '/reports',         icon: BarChart2,       requiredRole: 'branch_manager', module: 'reports' },
  { label: 'Messages',       href: '/messages',        icon: MessageSquare,   requiredRole: 'cashier',        module: 'messages' },
  { label: 'Phone',          href: '/phone',           icon: Phone,           requiredRole: 'cashier',        module: 'phone' },
  { label: 'Google Reviews', href: '/google-reviews',  icon: Star,            requiredRole: 'branch_manager', module: 'google_reviews' },
  { label: 'Settings',       href: '/settings',        icon: Settings,        requiredRole: 'branch_manager' },
]

const ROLE_HIERARCHY: Role[] = ['cashier', 'staff', 'branch_manager', 'business_owner', 'super_admin']

function hasAccess(userRole: string, required: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole as Role) >= ROLE_HIERARCHY.indexOf(required)
}

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, activeBranch, clear } = useAuthStore()
  const { isModuleEnabled, configs, isLoading, invalidate: invalidateConfigs } = useModuleConfigStore()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    clear()
    invalidateConfigs()
    router.push('/login')
    router.refresh()
  }

  const configsReady = configs !== null && !isLoading

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!hasAccess(profile?.role ?? 'cashier', item.requiredRole)) return false
    if (item.module == null) return true
    if (!configsReady) return false
    return isModuleEnabled(item.module)
  })

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-gray-950 text-white transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-[230px]'
      )}
    >
      {/* Brand */}
      <div className={cn(
        'flex h-16 shrink-0 items-center gap-3 border-b border-white/10',
        collapsed ? 'justify-center px-0' : 'px-5'
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/30">
          <Wrench className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-white">RepairBooking</p>
            <p className="text-[10px] text-white/40 tracking-wide uppercase">POS Platform</p>
          </div>
        )}
      </div>

      {/* Branch indicator */}
      {!collapsed && activeBranch && (
        <div className="mx-3 mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            <p className="truncate text-xs font-semibold text-white/90">{activeBranch.name}</p>
          </div>
          <p className="mt-0.5 text-[10px] text-white/40 capitalize pl-4">
            {profile?.role?.replace(/_/g, ' ')}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-none">
        {!configsReady && (
          <div className="space-y-1 px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-9 rounded-lg bg-white/5 animate-pulse',
                  collapsed ? 'w-9 mx-auto' : 'w-full'
                )}
              />
            ))}
          </div>
        )}

        {configsReady && visibleItems.map((item) => {
          const isActive = pathname?.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 mb-0.5',
                collapsed ? 'justify-center' : '',
                isActive
                  ? 'bg-blue-500/20 text-blue-300 shadow-sm'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/90'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-blue-400" />
              )}
              <item.icon className={cn(
                'h-4 w-4 shrink-0 transition-colors',
                isActive ? 'text-blue-400' : 'text-white/40 group-hover:text-white/70'
              )} />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
              {!collapsed && item.badge && (
                <span className="ml-auto rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-white/10 p-3">
        {!collapsed && profile && (
          <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-bold text-white shadow">
              {(profile.full_name ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white/90">{profile.full_name}</p>
              <p className="text-[10px] text-white/40 capitalize">{profile.role?.replace(/_/g, ' ')}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/40 transition-colors hover:bg-white/5 hover:text-red-400',
            collapsed ? 'justify-center' : ''
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
