'use client'
import { useState, useEffect } from 'react'
import { Tag, ChevronRight, ArrowLeft, Loader2, Search } from 'lucide-react'

interface Category { id: string; name: string; slug: string }
interface Problem  { id: string; name: string; price: number; warranty_days: number; device: string | null; category: string | null }
interface BusinessInfo { name: string; currency: string }

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(price)
}

export default function PriceWidget() {
  const [subdomain, setSubdomain] = useState('')
  const [business, setBusiness] = useState<BusinessInfo | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [filtered, setFiltered] = useState<Problem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sub = params.get('subdomain') ?? ''
    setSubdomain(sub)
    if (sub) fetchPrices(sub)
  }, [])

  async function fetchPrices(sub: string, categoryId?: string) {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ subdomain: sub })
    if (categoryId) params.set('category_id', categoryId)
    const res = await fetch(`/api/public/service-prices?${params}`)
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to load prices'); setLoading(false); return }
    setBusiness(json.data.business)
    setCategories(json.data.categories)
    setProblems(json.data.problems)
    setFiltered(json.data.problems)
    setLoading(false)
  }

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      q
        ? problems.filter((p) => p.name.toLowerCase().includes(q) || p.device?.toLowerCase().includes(q))
        : selectedCategory
          ? problems.filter((p) => p.category === selectedCategory.name)
          : problems
    )
  }, [search, problems, selectedCategory])

  function selectCategory(cat: Category) {
    setSelectedCategory(cat)
    setSearch('')
    setFiltered(problems.filter((p) => p.category === cat.name))
  }

  function clearCategory() {
    setSelectedCategory(null)
    setSearch('')
    setFiltered(problems)
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-green-50">
      <Loader2 className="h-8 w-8 animate-spin text-green-600" />
    </div>
  )

  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-green-50 p-4">
      <div className="rounded-xl bg-white p-8 shadow text-center max-w-sm">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-teal to-brand-teal-dark px-6 py-5 text-white">
        <div className="flex items-center gap-2 mb-0.5">
          <Tag className="h-5 w-5" />
          <h1 className="text-lg font-bold">{business?.name ?? 'Repair Prices'}</h1>
        </div>
        <p className="text-green-100 text-sm">Transparent pricing — no hidden fees</p>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search repairs..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (e.target.value) setSelectedCategory(null) }}
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm shadow-sm focus:border-green-500 focus:outline-none"
          />
        </div>

        {/* Category breadcrumb */}
        {selectedCategory && (
          <button onClick={clearCategory} className="mb-3 flex items-center gap-1 text-sm text-green-700 hover:text-green-900">
            <ArrowLeft className="h-3.5 w-3.5" />
            All categories
          </button>
        )}

        {/* Category list (when no search + no category selected) */}
        {!search && !selectedCategory && categories.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Categories</p>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => selectCategory(cat)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm hover:border-green-400 hover:shadow-md transition-all"
              >
                <span className="font-medium text-gray-900">{cat.name}</span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        )}

        {/* Problems / prices list */}
        {(search || selectedCategory) && (
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="rounded-xl bg-white border border-gray-100 p-6 text-center text-sm text-gray-400">
                No services found
              </div>
            ) : (
              filtered.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                    {p.device && <p className="text-xs text-gray-400">{p.device}</p>}
                    {p.warranty_days > 0 && (
                      <p className="text-xs text-green-600">{p.warranty_days} day warranty</p>
                    )}
                  </div>
                  <span className="text-base font-bold text-green-700 shrink-0 ml-3">
                    {formatPrice(p.price, business?.currency ?? 'GBP')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Default: show all problems if no categories */}
        {!search && !selectedCategory && categories.length === 0 && (
          <div className="space-y-2">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                  {p.device && <p className="text-xs text-gray-400">{p.device}</p>}
                  {p.warranty_days > 0 && <p className="text-xs text-green-600">{p.warranty_days} day warranty</p>}
                </div>
                <span className="text-base font-bold text-green-700 shrink-0 ml-3">
                  {formatPrice(p.price, business?.currency ?? 'GBP')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
