'use client'
import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Search } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'

interface PickerProduct {
  id: string
  name: string
  selling_price?: number | null
  cost_price?: number | null
  next_batch_cost?: number | null
  has_variants?: boolean
}

interface PickerVariant {
  id: string
  name: string
  sku?: string | null
  selling_price?: number | null
  cost_price?: number | null
  stock?: number | null
}

interface ProductVariantPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (product: PickerProduct, variant: PickerVariant | null) => void
  branchId: string | undefined
  title?: string
}

// Reusable product+variant search picker — same search/variant-drill-down
// pattern already proven in sales/page.tsx's exchange-new-item flow, extracted
// so Purchase Order line items (and any future caller) can pick a real
// product/variant instead of typing a free-text name.
export function ProductVariantPicker({ open, onClose, onSelect, branchId, title = 'Select a product' }: ProductVariantPickerProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<PickerProduct[]>([])
  const [searching, setSearching] = useState(false)
  const [variantFor, setVariantFor] = useState<PickerProduct | null>(null)
  const [variants, setVariants] = useState<PickerVariant[]>([])
  const [variantsLoading, setVariantsLoading] = useState(false)

  useEffect(() => {
    if (!open) { setSearch(''); setResults([]); setVariantFor(null); setVariants([]) }
  }, [open])

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams({ search: search.trim(), limit: '12' })
        if (branchId) params.set('branch_id', branchId)
        const res = await fetch(`/api/products?${params}`)
        const json = await res.json()
        setResults(json.data ?? [])
      } finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [search, branchId])

  async function loadVariants(product: PickerProduct) {
    setVariantFor(product)
    setVariants([])
    setVariantsLoading(true)
    try {
      const params = new URLSearchParams()
      if (branchId) params.set('branch_id', branchId)
      const res = await fetch(`/api/products/${product.id}/variants?${params}`)
      const json = await res.json()
      setVariants(json.data ?? [])
    } finally { setVariantsLoading(false) }
  }

  function pick(product: PickerProduct, variant: PickerVariant | null) {
    onSelect(product, variant)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {variantFor ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setVariantFor(null)} className="text-gray-400 hover:text-gray-600">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold">{variantFor.name} — Select variant</p>
          </div>
          {variantsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-brand-teal" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {variants.map(v => (
                <button
                  key={v.id}
                  onClick={() => pick(variantFor, v)}
                  className="flex flex-col items-start rounded-lg border p-2.5 text-left text-sm hover:border-brand-teal hover:bg-brand-teal-light/20 transition-colors"
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="text-xs text-gray-500">Cost: {formatCurrency(v.cost_price ?? variantFor.next_batch_cost ?? variantFor.cost_price ?? 0)}</span>
                  {v.stock != null && <span className="text-[10px] text-gray-400">{v.stock} in stock</span>}
                </button>
              ))}
              {variants.length === 0 && <p className="col-span-2 py-4 text-center text-sm text-gray-400">No variants found</p>}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="w-full rounded-md border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              placeholder="Search products by name or SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {results.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => { if (p.has_variants) loadVariants(p); else pick(p, null) }}
                  className="flex flex-col items-start rounded-lg border p-2.5 text-left text-sm hover:border-brand-teal hover:bg-brand-teal-light/20 transition-colors"
                >
                  <span className="font-medium truncate w-full">{p.name}</span>
                  <span className="text-xs text-gray-500">Cost: {formatCurrency(p.next_batch_cost ?? p.cost_price ?? 0)}</span>
                  {p.has_variants && <span className="text-[10px] text-brand-teal">Select variant →</span>}
                </button>
              ))}
            </div>
          )}
          {!searching && search && results.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-400">No products found</p>
          )}
        </>
      )}
    </Modal>
  )
}
