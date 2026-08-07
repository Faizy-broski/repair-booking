'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

// Shared sub-navigation tab bar for every Inventory section (Products, Purchase
// Orders, Suppliers, Bin, Damage Returns, and — for simple-catalogue verticals —
// Categories/Attributes). Rendered as the first element on each page so the tabs
// are always visible and consistent, regardless of which page you land on.
export function InventoryNav() {
  const pathname = usePathname()
  const { verticalTemplateSlug } = useAuthStore()
  const isRetail = verticalTemplateSlug === 'retail-store'
  const isTyreShop = verticalTemplateSlug === 'mobile-tyre-fitting'
  const useSimpleCatalog = isRetail || isTyreShop

  const items = [
    { label: 'Products',        href: '/inventory' },
    { label: 'Purchase Orders', href: '/inventory/purchase-orders' },
    { label: 'Suppliers',       href: '/inventory/suppliers' },
    { label: 'Bin',             href: '/inventory/bin' },
    { label: 'Damage Returns',  href: '/inventory/damage-returns' },
    ...(useSimpleCatalog ? [
      { label: 'Categories', href: '/inventory/categories' },
      { label: 'Attributes', href: '/inventory/attributes' },
    ] : []),
  ]

  return (
    <div className="flex overflow-x-auto gap-1 border-b border-gray-200 pb-3 no-scrollbar">
      {items.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            (href === '/inventory' ? pathname === '/inventory' : pathname.startsWith(href))
              ? 'bg-brand-teal text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
