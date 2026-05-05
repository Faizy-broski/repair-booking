'use client'
import { Store, GitBranch, Users, Sliders, Layers } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

const SETTINGS_TABS = [
  { id: 'general',        label: 'Business',       href: '/settings/general',        icon: Store },
  { id: 'branches',       label: 'Branches',        href: '/settings/branches',       icon: GitBranch, ownerOnly: true },
  { id: 'users',          label: 'Users',           href: '/settings/users',          icon: Users,     ownerOnly: true },
  { id: 'custom-fields',  label: 'Custom Fields',   href: '/settings/custom-fields',  icon: Sliders },
  { id: 'invoice-design', label: 'Invoice Design',  href: '/settings/invoice-design', icon: Layers },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isOwner } = useAuthStore()

  const tabs = SETTINGS_TABS.filter(t => !t.ownerOnly || isOwner())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-on-surface">Settings</h1>
        <p className="text-sm text-on-surface-variant">Manage your business configuration</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl bg-surface-container-low p-1.5 flex-wrap">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href)
          const TabIcon = tab.icon
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              )}
            >
              <TabIcon className={cn('h-4 w-4 shrink-0', isActive ? 'text-on-primary' : 'text-on-surface-variant')} />
              {tab.label}
            </Link>
          )
        })}
      </div>

      <div>
        {children}
      </div>
    </div>
  )
}
