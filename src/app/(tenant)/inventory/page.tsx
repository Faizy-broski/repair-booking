'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, AlertTriangle, Upload, Download, CheckCircle2, Package, Boxes, TrendingDown, ShoppingCart, Edit2, Trash2, Layers, X, ExternalLink, Filter, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/shared/data-table'
import { Select } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'

interface ProductRow {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  imei: string | null
  selling_price: number
  cost_price: number | null
  is_service: boolean | null
  is_serialized: boolean | null
  has_variants: boolean | null
  variant_count: number
  valuation_method: string | null
  on_hand: number
  low_stock_alert: number | null
  item_type?: string | null
  part_type?: string | null
  categories?: { name: string } | null
  brands?: { name: string } | null
  suppliers?: { name: string } | null
  service_devices?: { name: string } | null
}

interface ProductVariant {
  id: string; name: string; sku: string | null; selling_price: number
  cost_price: number | null; attributes: Record<string, string>
}

interface Category { id: string; name: string }
interface Brand { id: string; name: string }
interface Supplier { id: string; name: string }

interface ProductStats {
  stockRetailValue: number
  stockCostValue: number
  lowStockCount: number
  inPoCount: number
}

export default function InventoryPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ProductStats | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: number; error_details?: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'part'>('all')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [valuationFilter, setValuationFilter] = useState('')
  const [hideOutOfStock, setHideOutOfStock] = useState(false)

  // View Variants drawer
  const [variantDrawer, setVariantDrawer] = useState<ProductRow | null>(null)
  const [drawerVariants, setDrawerVariants] = useState<ProductVariant[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    if (!activeBranch) return
    const res = await fetch(`/api/products/stats?branch_id=${activeBranch.id}`)
    const json = await res.json()
    if (res.ok) setStats(json.data ?? json)
  }, [activeBranch])

  const fetchProducts = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const params = new URLSearchParams({ page: String(page + 1), limit: '30', branch_id: activeBranch.id })
    if (search) params.set('search', search)
    if (categoryFilter) params.set('category_id', categoryFilter)
    if (brandFilter) params.set('brand_id', brandFilter)
    if (supplierFilter) params.set('supplier_id', supplierFilter)
    if (valuationFilter) params.set('valuation', valuationFilter)
    if (hideOutOfStock) params.set('hide_out_of_stock', 'true')
    if (typeFilter === 'product') params.set('item_type', 'product')
    else if (typeFilter === 'part') params.set('item_type', 'part')
    const res = await fetch(`/api/products?${params}`)
    const json = await res.json()
    setProducts(json.data ?? [])
    setTotal(json.meta?.total ?? 0)
    setLoading(false)
  }, [page, search, activeBranch, typeFilter, categoryFilter, brandFilter, supplierFilter, valuationFilter, hideOutOfStock])

  useEffect(() => { fetchProducts() }, [fetchProducts])
  useEffect(() => { fetchStats() }, [fetchStats])

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(j => setCategories(j.data ?? [])).catch(() => {})
    fetch('/api/brands').then(r => r.json()).then(j => setBrands(j.data ?? [])).catch(() => {})
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? [])).catch(() => {})
  }, [])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/products/import', { method: 'POST', body: form })
    const json = await res.json()
    setImportResult(json.data ?? json)
    setImporting(false)
    if (res.ok) { fetchProducts(); fetchStats() }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function openVariantDrawer(product: ProductRow) {
    setVariantDrawer(product)
    setDrawerVariants([])
    setDrawerLoading(true)
    const res = await fetch(`/api/products/${product.id}/variants`)
    const json = await res.json()
    setDrawerVariants(json.data ?? [])
    setDrawerLoading(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await fetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    fetchProducts()
    fetchStats()
  }

  function clearFilters() {
    setSearch('')
    setCategoryFilter('')
    setBrandFilter('')
    setSupplierFilter('')
    setValuationFilter('')
    setHideOutOfStock(false)
    setTypeFilter('all')
    setPage(0)
  }

  const hasActiveFilters = search || categoryFilter || brandFilter || supplierFilter || valuationFilter || hideOutOfStock || typeFilter !== 'all'

  const displayProducts = products

  const columns: ColumnDef<ProductRow>[] = [
    {
      accessorKey: 'name',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <Link href={`/inventory/${row.original.id}`} className="font-medium text-gray-900 text-sm hover:text-blue-600 transition-colors">
            {row.original.name}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            {row.original.sku && <span className="text-xs text-gray-400">SKU: {row.original.sku}</span>}
            {row.original.barcode && <span className="text-xs text-gray-400">· {row.original.barcode}</span>}
            {row.original.imei && <span className="text-xs text-gray-400">· IMEI: {row.original.imei}</span>}
          </div>
        </div>
      ),
    },
    {
      id: 'category',
      header: 'Device Type',
      cell: ({ row }) => row.original.categories?.name
        ? <Badge variant="secondary">{row.original.categories.name}</Badge>
        : <span className="text-gray-300">—</span>,
    },
    {
      id: 'brand',
      header: 'Brand',
      cell: ({ row }) => row.original.brands?.name
        ? <span className="text-sm text-gray-600">{row.original.brands.name}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      id: 'model',
      header: 'Model',
      cell: ({ row }) => (row.original as any).service_devices?.name
        ? <span className="text-sm text-gray-600">{(row.original as any).service_devices.name}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const t = row.original.item_type ?? (row.original.is_service ? 'part' : 'product')
        return (
          <Badge variant={t === 'part' ? 'warning' : 'secondary'}>
            {t === 'part' ? 'Part' : 'Product'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'selling_price',
      header: 'Price',
      cell: ({ getValue }) => <span className="font-medium">{formatCurrency(getValue() as number)}</span>,
    },
    {
      accessorKey: 'cost_price',
      header: 'Unit Cost',
      cell: ({ getValue, row }) => {
        const cost = getValue() as number | null
        const sell = row.original.selling_price
        const margin = cost && sell > 0 ? Math.round(((sell - cost) / sell) * 100) : null
        return (
          <div>
            <span className="text-sm">{cost != null ? formatCurrency(cost) : '—'}</span>
            {margin != null && <span className="ml-1.5 text-xs text-green-600">{margin}%</span>}
          </div>
        )
      },
    },
    {
      id: 'stock',
      header: 'On Hand',
      cell: ({ row }) => {
        const p = row.original
        if (p.is_service) return <span className="text-xs text-gray-400">Service</span>
        if ((p.variant_count ?? 0) > 0 || p.has_variants) {
          return (
            <button
              onClick={() => openVariantDrawer(p)}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200 transition-colors"
            >
              <Layers className="h-3 w-3" />
              {p.variant_count ?? 0} Variants
            </button>
          )
        }
        const isLow = p.low_stock_alert != null && p.on_hand <= p.low_stock_alert && p.on_hand > 0
        const isOut = p.on_hand === 0
        return (
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-medium ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'}`}>
              {p.on_hand}
            </span>
            {isOut && <Badge variant="destructive" className="text-xs">Out</Badge>}
            {isLow && !isOut && <Badge variant="warning" className="text-xs">Low</Badge>}
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Link
            href={`/inventory/${row.original.id}`}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Link>
          <button onClick={() => setDeleteTarget(row.original)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-3">
        {[
          { label: 'Products',        href: '/inventory' },
          { label: 'Purchase Orders', href: '/inventory/purchase-orders' },
          { label: 'Suppliers',       href: '/inventory/suppliers' },
          { label: 'Stock Count',     href: '/inventory/stock-count' },
          { label: 'Special Orders',  href: '/inventory/special-orders' },
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              (href === '/inventory' ? pathname === '/inventory' : pathname.startsWith(href))
                ? 'bg-brand-teal text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">{total} products</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/products/export`, '_blank')}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button onClick={() => router.push('/inventory/new')}>
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        </div>
      </div>

      {/* Stats from API */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Stock Retail Value',
            value: stats ? formatCurrency(stats.stockRetailValue) : '…',
            icon: <Boxes className="h-4 w-4 text-blue-600" />,
            color: 'bg-blue-50',
          },
          {
            label: 'Stock Cost Value',
            value: stats ? formatCurrency(stats.stockCostValue) : '…',
            icon: <Package className="h-4 w-4 text-indigo-600" />,
            color: 'bg-indigo-50',
          },
          {
            label: 'Low Stock Items',
            value: stats?.lowStockCount ?? '…',
            icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
            color: 'bg-amber-50',
          },
          {
            label: 'In Purchase Order',
            value: stats?.inPoCount ?? '…',
            icon: <ShoppingCart className="h-4 w-4 text-green-600" />,
            color: 'bg-green-50',
          },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl ${s.color} border border-gray-100 px-4 py-3 flex items-center gap-3`}>
            {s.icon}
            <div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="font-bold text-gray-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        {/* Row 1: search + type tabs + advanced toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search by name, SKU, barcode, IMEI..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
            {(['all', 'product', 'part'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setTypeFilter(f); setPage(0) }}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${typeFilter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {f === 'all' ? 'All' : f === 'product' ? 'Products' : 'Parts'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${showAdvancedFilters ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Filter className="h-4 w-4" />
            Filters
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
            {hasActiveFilters && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Clear filters
            </button>
          )}
        </div>

        {/* Row 2: advanced filters */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <Select
                options={[{ value: '', label: 'All Categories' }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
                value={categoryFilter}
                onValueChange={(v) => { setCategoryFilter(v); setPage(0) }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
              <Select
                options={[{ value: '', label: 'All Brands' }, ...brands.map(b => ({ value: b.id, label: b.name }))]}
                value={brandFilter}
                onValueChange={(v) => { setBrandFilter(v); setPage(0) }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Supplier</label>
              <Select
                options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
                value={supplierFilter}
                onValueChange={(v) => { setSupplierFilter(v); setPage(0) }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Valuation Method</label>
              <Select
                options={[
                  { value: '', label: 'All Methods' },
                  { value: 'weighted_average', label: 'Weighted Average' },
                  { value: 'fifo', label: 'FIFO' },
                  { value: 'lifo', label: 'LIFO' },
                ]}
                value={valuationFilter}
                onValueChange={(v) => { setValuationFilter(v); setPage(0) }}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideOutOfStock}
                  onChange={(e) => { setHideOutOfStock(e.target.checked); setPage(0) }}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Hide out of stock</span>
              </label>
            </div>
          </div>
        )}
      </div>

      <DataTable
        data={displayProducts}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={30}
        onPageChange={setPage}
        emptyMessage="No products yet. Click Add Product to get started!"
      />

      {/* Import Modal */}
      <Modal open={importModalOpen} onClose={() => { setImportModalOpen(false); setImportResult(null) }} title="Import Products from CSV" size="sm">
        <div className="space-y-4">
          {importResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Import complete
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="font-medium text-green-700">{importResult.created}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Updated</span><span className="font-medium text-blue-700">{importResult.updated}</span></div>
                {importResult.errors > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Errors</span><span className="font-medium text-red-600">{importResult.errors}</span></div>
                )}
              </div>
              {(importResult.error_details ?? []).length > 0 && (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                  {importResult.error_details!.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
              <Button className="w-full" onClick={() => { setImportModalOpen(false); setImportResult(null) }}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">Expected CSV columns:</p>
                <p className="text-xs font-mono text-blue-600">name, sku, barcode, selling_price, cost_price, description, is_service, is_serialized, valuation_method, category, brand</p>
                <p className="text-xs text-blue-600 mt-1">Products are upserted by SKU if provided.</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
              <Button className="w-full" loading={importing} onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {importing ? 'Importing...' : 'Choose CSV File'}
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Product" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will hide it from the POS and inventory. Stock movements history is preserved.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

      {/* View Variants Drawer */}
      {variantDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setVariantDrawer(null)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">{variantDrawer.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {drawerVariants.length} variant{drawerVariants.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/inventory/${variantDrawer.id}`}
                  className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-100 transition-colors"
                  title="Open product"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <button onClick={() => setVariantDrawer(null)} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-100 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {drawerLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />)}
                </div>
              ) : drawerVariants.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">
                  <Layers className="mx-auto h-8 w-8 text-gray-200 mb-2" />
                  No variants found
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Variant</th>
                      <th className="px-4 py-2.5 text-left">SKU</th>
                      <th className="px-4 py-2.5 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {drawerVariants.map(v => (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{v.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(v.attributes ?? {}).map(([k, val]) => (
                              <span key={k} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                {k}: {val}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{v.sku ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(v.selling_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t border-gray-200 px-5 py-3">
              <Link href={`/inventory/${variantDrawer.id}?tab=variants`} className="block">
                <Button variant="outline" className="w-full">Manage Variants</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
    </div>
  )
}
