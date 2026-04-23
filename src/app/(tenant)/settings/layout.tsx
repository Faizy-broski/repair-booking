'use client'
import { Store, GitBranch, Users, Sliders, Layers, ChevronDown } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

const SETTINGS_MENU = [
  { id: 'general', label: 'Business Information', href: '/settings/general', icon: Store },
  { id: 'branches', label: 'Branches', href: '/settings/branches', icon: GitBranch, ownerOnly: true },
  { id: 'users', label: 'Users', href: '/settings/users', icon: Users, ownerOnly: true },
  { id: 'custom-fields', label: 'Custom Fields', href: '/settings/custom-fields', icon: Sliders },
  { id: 'invoice-design', label: 'Invoice Design', href: '/settings/invoice-design', icon: Layers },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isOwner } = useAuthStore()

  const currentItem = SETTINGS_MENU.find(m => pathname.startsWith(m.href)) || SETTINGS_MENU[0]
  const Icon = currentItem.icon

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your business configuration</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center justify-between gap-2 min-w-[220px] rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-brand-teal" />
                <span>{currentItem.label}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[220px] overflow-hidden rounded-xl border border-gray-100 bg-white p-1 shadow-xl animate-in fade-in zoom-in duration-200"
              sideOffset={5}
              align="start"
            >
              {SETTINGS_MENU.map((item) => {
                if (item.ownerOnly && !isOwner()) return null
                const ItemIcon = item.icon
                return (
                  <DropdownMenu.Item
                    key={item.id}
                    onSelect={() => router.push(item.href)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 outline-none hover:bg-gray-50 data-[highlighted]:bg-gray-50 data-[highlighted]:text-brand-teal"
                  >
                    <ItemIcon className="h-4 w-4" /> {item.label}
                  </DropdownMenu.Item>
                )
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="mt-4">
        {children}
      </div>
    </div>
  )
}
