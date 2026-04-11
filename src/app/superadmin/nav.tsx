'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, CreditCard, BarChart3, Layers, Store } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/superadmin/dashboard',           label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/superadmin/businesses',          label: 'Businesses',    icon: Building2 },
  { href: '/superadmin/plans',               label: 'Plans',         icon: CreditCard },
  { href: '/superadmin/templates',           label: 'Mod Templates', icon: Layers },
  { href: '/superadmin/vertical-templates',  label: 'Verticals',     icon: Store },
  { href: '/superadmin/analytics',           label: 'Analytics',     icon: BarChart3 },
]

export function SuperAdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-white/15 font-semibold text-white'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

