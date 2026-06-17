'use client'
import { Store, GitBranch, Users, Sliders, Layers, Palette } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

const SETTINGS_TABS = [
  { id: 'general',        label: 'Business',      href: '/settings/general',        icon: Store,     color: 'bg-teal-500   hover:bg-teal-600',   soft: 'hover:bg-teal-50   hover:text-teal-700'   },
  { id: 'branches',       label: 'Branches',      href: '/settings/branches',       icon: GitBranch, color: 'bg-blue-500   hover:bg-blue-600',   soft: 'hover:bg-blue-50   hover:text-blue-700',   ownerOnly: true },
  { id: 'users',          label: 'Users',         href: '/settings/users',          icon: Users,     color: 'bg-violet-500 hover:bg-violet-600', soft: 'hover:bg-violet-50 hover:text-violet-700', ownerOnly: true },
  { id: 'custom-fields',  label: 'Custom Fields', href: '/settings/custom-fields',  icon: Sliders,   color: 'bg-orange-500 hover:bg-orange-600', soft: 'hover:bg-orange-50 hover:text-orange-700' },
  { id: 'invoice-design', label: 'Invoice Design',href: '/settings/invoice-design', icon: Layers,    color: 'bg-indigo-500 hover:bg-indigo-600', soft: 'hover:bg-indigo-50 hover:text-indigo-700' },
  { id: 'branding',       label: 'Branding',      href: '/settings/branding',       icon: Palette,   color: 'bg-pink-500   hover:bg-pink-600',   soft: 'hover:bg-pink-50   hover:text-pink-700',   ownerOnly: true },
]

// These prefixes render their own page headers — suppress the settings tab bar for them
const STANDALONE_PREFIXES = ['/settings/notifications', '/settings/modules', '/settings/widgets']

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isOwner } = useAuthStore()

  const tabs = SETTINGS_TABS.filter(t => !t.ownerOnly || isOwner())
  const showTabs = !STANDALONE_PREFIXES.some(p => pathname.startsWith(p))

  return (
    <div className="space-y-6">
      {showTabs && (
        <>
          <div>
            <h1 className="text-xl font-bold text-on-surface">Settings</h1>
            <p className="text-sm text-on-surface-variant">Manage your business configuration</p>
          </div>

          <div className="flex gap-1.5 flex-wrap">
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
                      ? `${tab.color} text-white shadow-sm`
                      : `text-on-surface-variant bg-surface-container-low ${tab.soft}`
                  )}
                >
                  <TabIcon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </>
      )}

      <div>
        {children}
      </div>
    </div>
  )
}
