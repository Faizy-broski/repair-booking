'use client'
import { Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types/database'

interface ProductGridProps {
  products: Product[]
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  onProductClick: (product: Product) => void
}

export function ProductGrid({
  products,
  loading,
  search,
  onSearchChange,
  onProductClick,
}: ProductGridProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search products or scan barcode..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Product cards */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
              ))
            : products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => onProductClick(product)}
                  className="flex flex-col items-start rounded-xl border border-gray-200 bg-white p-3 text-left transition-all hover:border-blue-400 hover:shadow-sm"
                >
                  <span className="line-clamp-2 text-sm font-medium text-gray-900">{product.name}</span>
                  {product.sku && <span className="text-xs text-gray-400">SKU: {product.sku}</span>}
                  <span className="mt-auto pt-2 text-base font-bold text-blue-600">
                    {formatCurrency(product.selling_price)}
                  </span>
                </button>
              ))}
          {!loading && products.length === 0 && (
            <div className="col-span-full flex h-32 items-center justify-center text-sm text-gray-400">
              No products found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
