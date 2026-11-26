'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Package, ClipboardList, Truck, Trash2, PackageX, Layers, Tag } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

// Shared sub-navigation tab bar for every Inventory section (Products, Purchase
// Orders, Suppliers, Bin, Damage Returns, and — for simple-catalogue verticals —
// Categories/Attributes). Rendered on each page so the tabs are always visible
// and consistent, regardless of which page you land on.
export function InventoryNav() {
  const pathname = usePathname()
  const { verticalTemplateSlug } = useAuthStore()
  const isRetail = verticalTemplateSlug === 'retail-store'
  const isTyreShop = verticalTemplateSlug === 'mobile-tyre-fitting'
  const useSimpleCatalog = isRetail || isTyreShop

  const items = [
    { label: 'Products',        href: '/inventory',                 icon: Package },
    { label: 'Purchase Orders', href: '/inventory/purchase-orders', icon: ClipboardList },
    { label: 'Suppliers',       href: '/inventory/suppliers',       icon: Truck },
    { label: 'Bin',             href: '/inventory/bin',             icon: Trash2 },
    { label: 'Damage Returns',  href: '/inventory/damage-returns',  icon: PackageX },
    ...(useSimpleCatalog ? [
      { label: 'Categories', href: '/inventory/categories', icon: Layers },
      { label: 'Attributes', href: '/inventory/attributes', icon: Tag },
    ] : []),
  ]

  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-outline-variant">
      {items.map(({ label, href, icon: Icon }) => {
        const active = href === '/inventory' ? pathname === '/inventory' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              '-mb-px flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm transition-colors',
              active
                ? 'border-primary bg-primary/5 font-semibold text-primary'
                : 'border-transparent font-medium text-on-surface-variant hover:text-on-surface'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </div>
  )
}
