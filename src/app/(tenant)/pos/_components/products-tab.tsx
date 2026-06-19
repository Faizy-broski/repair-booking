'use client'
import { useState, useEffect, useRef, memo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, X, Package, ShoppingBag, Tag, Phone,
  Layers, ChevronRight, Check, ShieldCheck, ExternalLink, ArrowLeft,
} from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { usePosStore } from '@/store/pos.store'
import { formatCurrency } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Product } from '@/types/database'
import type {
  ProductWithStock, ProductVariant,
  CatLevel, PartLevel, ProductsView,
} from '../_types'
import { ScanButton } from '@/components/scanner/scan-button'
import { ScannerModal } from '@/components/scanner/scanner-modal'
import type { ProductWithStock as ScannedProduct } from '@/hooks/use-barcode-lookup'
import { useHidScanner } from '@/hooks/use-hid-scanner'

// ── Extracted & memoized so it isn't recreated on every ProductsTab render ──
const ProductCard = memo(function ProductCard({
  product,
  size = 'md',
  onAdd,
  onVariantSelect,
  onVariantHover,
}: {
  product: ProductWithStock
  size?: 'sm' | 'md'
  onAdd: (product: ProductWithStock) => void
  onVariantSelect: (product: ProductWithStock) => void
  onVariantHover?: (product: ProductWithStock) => void
}) {
  const hasVariants = product.has_variants || (product.variant_count ?? 0) > 0
  const outOfStock = !product.is_service && !hasVariants && product.on_hand !== undefined && (product.on_hand ?? 0) <= 0
  return (
    <button
      disabled={outOfStock}
      onMouseEnter={() => hasVariants && onVariantHover?.(product)}
      onClick={() => hasVariants ? onVariantSelect(product) : onAdd(product)}
      className={`relative flex w-full flex-col overflow-hidden rounded-xl border bg-white p-3 text-left transition-all ${outOfStock
          ? 'border-gray-100 opacity-50 cursor-not-allowed'
          : 'border-gray-200 hover:border-brand-teal hover:shadow-sm cursor-pointer'
        }`}
    >
      {outOfStock && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60">
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600">Out of Stock</span>
        </div>
      )}
      {product.image_url ? (
        <div className="relative mb-3 w-full overflow-hidden rounded-xl bg-gray-50 aspect-[4/3]">
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="mb-3 flex w-full items-center justify-center rounded-xl bg-gray-100 aspect-[4/3]">
          {(product as any).item_type === 'part' ? <Package className="h-8 w-8 text-gray-300" /> : <ShoppingBag className="h-8 w-8 text-gray-300" />}
        </div>
      )}

      <div className="flex flex-1 flex-col justify-between gap-2">
        <div>
          <span className="block text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{product.name}</span>
          {product.sku && <span className="mt-1 block text-xs text-gray-400 font-mono truncate">{product.sku}</span>}
        </div>

        <div className="space-y-1">
          <span className="text-sm font-bold text-brand-teal">{formatCurrency(product.selling_price)}</span>
          {product.on_hand !== undefined && !product.is_service && !hasVariants && (
            <span className={`block text-xs font-medium ${(product.on_hand ?? 0) > 0 ? 'text-gray-400' : 'text-red-500'}`}>
              {(product.on_hand ?? 0) > 0 ? `${product.on_hand} on hand` : 'Out of stock'}
            </span>
          )}
          {hasVariants && <span className="block text-xs text-indigo-500 font-medium">Select variant</span>}
        </div>
      </div>
    </button>
  )
})

export function ProductsTab() {
  const router = useRouter()
  const { activeBranch, verticalTemplateSlug } = useAuthStore()
  const isRetail = verticalTemplateSlug === 'retail-store'
  const pos = usePosStore()
  const queryClient = useQueryClient()
  const prevBranchIdRef = useRef<string | null>(null)

  // ── Clear stale product lists immediately on branch switch ─────────────────
  useEffect(() => {
    const newId = activeBranch?.id ?? null
    if (prevBranchIdRef.current !== null && prevBranchIdRef.current !== newId) {
      setCategoryProducts([])
      setPartProducts([])
      setAdvSearchResults([])
    }
    prevBranchIdRef.current = newId
  }, [activeBranch?.id]) // eslint-disable-line

  // ── View state ─────────────────────────────────────────────────────────────
  const [productsView, setProductsView] = useState<ProductsView>('all_products')

  // ── All Products view ──────────────────────────────────────────────────────
  const [allProductsSearch, setAllProductsSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [allProductsItemType, setAllProductsItemType] = useState<'all' | 'product' | 'part'>('all')
  const [allProductsCategoryId, setAllProductsCategoryId] = useState('')

  // Debounce search input
  useEffect(() => {
    if (!allProductsSearch) { setDebouncedSearch(''); return }
    const t = setTimeout(() => setDebouncedSearch(allProductsSearch), 300)
    return () => clearTimeout(t)
  }, [allProductsSearch])

  // Categories — cached, shared across all views
  const { data: allCats = [] } = useQuery<{ id: string; name: string; parent_id: string | null }[]>({
    queryKey: ['pos-categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories?limit=200')
      const j = await res.json()
      return j.data ?? []
    },
    enabled: !!activeBranch,
    staleTime: 30 * 60_000, // categories change very rarely
  })

  // All Products — fires once per unique [branchId, search, type, cat]
  const { data: allProductsList = [], isFetching: allProductsLoading } = useQuery<ProductWithStock[]>({
    queryKey: ['pos-products', activeBranch?.id, debouncedSearch, allProductsItemType, allProductsCategoryId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '150', branch_id: activeBranch!.id })
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      if (allProductsItemType !== 'all') params.set('item_type', allProductsItemType)
      if (allProductsCategoryId) params.set('category_id', allProductsCategoryId)
      const res = await fetch(`/api/products?${params}`)
      const j = await res.json()
      return j.data ?? []
    },
    enabled: !!activeBranch && productsView === 'all_products',
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev, // keep previous data while fetching
  })

  // ── By Products hierarchy ──────────────────────────────────────────────────
  const [catLevel, setCatLevel] = useState<CatLevel>('device_types')
  const [catBreadcrumb, setCatBreadcrumb] = useState<{ level: CatLevel; id: string; name: string }[]>([])
  const [catItems, setCatItems] = useState<{ id: string; name: string; image_url?: string | null }[]>([])
  const [catItemsLoading, setCatItemsLoading] = useState(false)
  const [categoryProducts, setCategoryProducts] = useState<ProductWithStock[]>([])
  const [categoryProductsLoading, setCategoryProductsLoading] = useState(false)

  // ── By Parts hierarchy ─────────────────────────────────────────────────────
  const [partLevel, setPartLevel] = useState<PartLevel>('device_types')
  const [partBreadcrumb, setPartBreadcrumb] = useState<{ level: PartLevel; id: string; name: string }[]>([])
  const [partItems, setPartItems] = useState<{ id: string; name: string; image_url?: string | null }[]>([])
  const [partItemsLoading, setPartItemsLoading] = useState(false)
  const [partProducts, setPartProducts] = useState<ProductWithStock[]>([])
  const [partProductsLoading, setPartProductsLoading] = useState(false)

  // ── Custom item ────────────────────────────────────────────────────────────
  const [miscName, setMiscName] = useState('')
  const [miscPrice, setMiscPrice] = useState('')

  // ── Scanner ────────────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerDefaultState, setScannerDefaultState] = useState<'scanning' | 'not_found' | 'found'>('scanning')
  const [scannerDefaultBarcode, setScannerDefaultBarcode] = useState<string>()
  const [scannerDefaultProduct, setScannerDefaultProduct] = useState<ProductWithStock | null>(null)
  const [scannerTriggerBarcode, setScannerTriggerBarcode] = useState<string | undefined>()

  // ── Variant modal ──────────────────────────────────────────────────────────
  const [variantProduct, setVariantProduct] = useState<ProductWithStock | null>(null)
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set())

  const { data: variantData, isFetching: variantLoading } = useQuery<ProductVariant[]>({
    queryKey: ['pos-variants', variantProduct?.id, activeBranch?.id],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (activeBranch?.id) params.set('branch_id', activeBranch.id)
      const res = await fetch(`/api/products/${variantProduct!.id}/variants?${params}`)
      const j = await res.json()
      return j.data ?? []
    },
    enabled: !!variantProduct?.id,
    staleTime: 0,
  })
  const variantList = variantData ?? []

  // ── Advanced search ────────────────────────────────────────────────────────
  const [advSearchOpen, setAdvSearchOpen] = useState(false)
  const [advSearchName, setAdvSearchName] = useState('')
  const [advSearchSku, setAdvSearchSku] = useState('')
  const [advSearchCatIds, setAdvSearchCatIds] = useState<Set<string>>(new Set())
  const [advSearchResults, setAdvSearchResults] = useState<ProductWithStock[]>([])
  const [advSearching, setAdvSearching] = useState(false)

  // ── Warranty modal ─────────────────────────────────────────────────────────
  const [warrantyOpen, setWarrantyOpen] = useState(false)
  const [warrantyForm, setWarrantyForm] = useState({ imei: '', partSerial: '', invoiceId: '', ticketId: '', customerName: '', customerMobile: '' })
  const [warrantyResults, setWarrantyResults] = useState<any[]>([])
  const [warrantySearching, setWarrantySearching] = useState(false)
  const [warrantyActionsOpen, setWarrantyActionsOpen] = useState<string | null>(null)
  const [warrantyClaimModal, setWarrantyClaimModal] = useState<{ repairId: string; item: any } | null>(null)
  const [warrantyClaimReason, setWarrantyClaimReason] = useState('')
  const [warrantyClaimSubmitting, setWarrantyClaimSubmitting] = useState(false)

  // ── Global POS Scanner ─────────────────────────────────────────────────────
  const scanLockRef = useRef(false)

  useHidScanner({
    onScan: (code) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      if (scanLockRef.current) return
      scanLockRef.current = true
      // Open modal instantly — the modal will perform the lookup internally and show the spinner
      setScannerTriggerBarcode(code)
      setScannerDefaultState('scanning')
      setScannerDefaultBarcode(undefined)
      setScannerDefaultProduct(null)
      setScannerOpen(true)
      setTimeout(() => { scanLockRef.current = false }, 500)
    },
    enabled: !scannerOpen
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  function openVariantSelect(product: ProductWithStock) {
    setVariantProduct(product)
    setSelectedVariantIds(new Set())
  }

  function toggleVariantSelected(variantId: string) {
    setSelectedVariantIds(prev => {
      const next = new Set(prev)
      if (next.has(variantId)) next.delete(variantId)
      else next.add(variantId)
      return next
    })
  }

  function prefetchVariants(product: ProductWithStock) {
    queryClient.prefetchQuery({
      queryKey: ['pos-variants', product.id],
      queryFn: async () => {
        const res = await fetch(`/api/products/${product.id}/variants`)
        const j = await res.json()
        return j.data ?? []
      },
      staleTime: 0,
    })
  }

  function addVariantToCart() {
    if (!variantProduct || selectedVariantIds.size === 0) return
    for (const variantId of selectedVariantIds) {
      const variant = variantList.find(v => v.id === variantId)
      if (variant) pos.addToCart(variantProduct as unknown as Product, variant as any)
    }
    setVariantProduct(null); setSelectedVariantIds(new Set())
  }

  function addMiscItem() {
    if (!miscName.trim() || !miscPrice) return
    const vp = { id: `misc-${Date.now()}`, name: miscName.trim(), selling_price: parseFloat(miscPrice) || 0, cost_price: 0, is_service: true, show_on_pos: true } as unknown as Product
    pos.addToCart(vp); setMiscName(''); setMiscPrice('')
  }

  useEffect(() => {
    if (productsView === 'by_products' && catBreadcrumb.length === 0) loadCatLevel('device_types')
    if (productsView === 'by_parts' && partBreadcrumb.length === 0) loadPartLevel('device_types')
  }, [productsView]) // eslint-disable-line

  // ── Ctrl+S → Advanced Search ───────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); openAdvSearch() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeBranch]) // eslint-disable-line

  // ── By Products drill-down ─────────────────────────────────────────────────
  async function loadCatLevel(level: CatLevel, parentId?: string) {
    setCatItemsLoading(true); setCategoryProducts([]); setCatLevel(level)
    try {
      if (level === 'device_types') {
        setCatItems(allCats.map((c: any) => ({ id: c.id, name: c.name, image_url: c.image_url })))
      } else if (level === 'brands' && parentId) {
        const j = await (await fetch(`/api/brands?category_id=${parentId}`)).json()
        setCatItems((j.data ?? []).map((b: any) => ({ id: b.id, name: b.name, image_url: b.image_url })))
      } else if (level === 'models' && parentId) {
        const j = await (await fetch(`/api/services/devices?brand_id=${parentId}`)).json()
        setCatItems((j.data ?? []).map((d: any) => ({ id: d.id, name: d.name, image_url: d.image_url })))
      } else if (level === 'products' && parentId && activeBranch) {
        setCatItems([]); setCategoryProductsLoading(true)
        const pp = new URLSearchParams({ limit: '100', show_on_pos: 'true', model_id: parentId, branch_id: activeBranch.id, item_type: 'product' })
        const j = await (await fetch(`/api/products?${pp}`)).json()
        setCategoryProducts(j.data ?? []); setCategoryProductsLoading(false)
      }
    } catch { /* ignore */ }
    setCatItemsLoading(false)
  }

  function selectCatItem(item: { id: string; name: string }) {
    const nextLevel: Record<CatLevel, CatLevel> = { device_types: 'brands', brands: 'models', models: 'products', products: 'products' }
    setCatBreadcrumb(prev => [...prev, { level: catLevel, id: item.id, name: item.name }])
    loadCatLevel(nextLevel[catLevel], item.id)
  }

  function navigateCatBreadcrumb(idx: number) {
    const crumb = catBreadcrumb[idx]
    setCatBreadcrumb(catBreadcrumb.slice(0, idx))
    const nextLevel: Record<CatLevel, CatLevel> = { device_types: 'brands', brands: 'models', models: 'products', products: 'products' }
    loadCatLevel(nextLevel[crumb.level], crumb.id)
  }

  function resetCatBrowse() { setCatBreadcrumb([]); loadCatLevel('device_types') }

  // ── By Parts drill-down ────────────────────────────────────────────────────
  async function loadPartLevel(level: PartLevel, parentId?: string) {
    setPartItemsLoading(true); setPartLevel(level); setPartProducts([])
    try {
      if (level === 'device_types') {
        setPartItems(allCats.map((c: any) => ({ id: c.id, name: c.name, image_url: c.image_url })))
      } else if (level === 'brands' && parentId) {
        const j = await (await fetch(`/api/brands?category_id=${parentId}`)).json()
        setPartItems((j.data ?? []).map((b: any) => ({ id: b.id, name: b.name, image_url: b.image_url })))
      } else if (level === 'models' && parentId) {
        const j = await (await fetch(`/api/services/devices?brand_id=${parentId}`)).json()
        setPartItems((j.data ?? []).map((d: any) => ({ id: d.id, name: d.name, image_url: d.image_url })))
      } else if (level === 'part_types' && parentId) {
        const j = await (await fetch(`/api/part-types?device_id=${parentId}`)).json()
        setPartItems((j.data ?? []).map((pt: any) => ({ id: pt.id, name: pt.name, image_url: pt.image_url })))
      } else if (level === 'parts' && parentId && activeBranch) {
        setPartItems([]); setPartProductsLoading(true)
        const pp = new URLSearchParams({ limit: '100', show_on_pos: 'true', item_type: 'part', part_type: parentId, branch_id: activeBranch.id })
        const j = await (await fetch(`/api/products?${pp}`)).json()
        setPartProducts(j.data ?? []); setPartProductsLoading(false)
      }
    } catch { /* ignore */ }
    setPartItemsLoading(false)
  }

  function selectPartItem(item: { id: string; name: string }) {
    const nextLevel: Record<PartLevel, PartLevel> = { device_types: 'brands', brands: 'models', models: 'part_types', part_types: 'parts', parts: 'parts' }
    setPartBreadcrumb(prev => [...prev, { level: partLevel, id: item.id, name: item.name }])
    loadPartLevel(nextLevel[partLevel], partLevel === 'part_types' ? item.name : item.id)
  }

  function navigatePartBreadcrumb(idx: number) {
    const crumb = partBreadcrumb[idx]
    setPartBreadcrumb(partBreadcrumb.slice(0, idx))
    const nextLevel: Record<PartLevel, PartLevel> = { device_types: 'brands', brands: 'models', models: 'part_types', part_types: 'parts', parts: 'parts' }
    loadPartLevel(nextLevel[crumb.level], crumb.level === 'part_types' ? crumb.name : crumb.id)
  }

  function resetPartBrowse() { setPartBreadcrumb([]); loadPartLevel('device_types') }

  // ── Advanced search ────────────────────────────────────────────────────────
  function openAdvSearch() {
    setAdvSearchOpen(true); setAdvSearchResults([]); setAdvSearchName(''); setAdvSearchSku(''); setAdvSearchCatIds(new Set())
  }

  async function runAdvSearch() {
    setAdvSearching(true)
    const params = new URLSearchParams({ limit: '200', show_on_pos: 'true' })
    if (activeBranch) params.set('branch_id', activeBranch.id)
    const nameTerm = advSearchName.trim()
    const skuTerm = advSearchSku.trim()
    // Pass whichever term is provided to the API for server-side pre-filtering
    if (nameTerm) params.set('search', nameTerm)
    else if (skuTerm) params.set('search', skuTerm)
    const res = await fetch(`/api/products?${params}`)
    const j = await res.json()
    let results: ProductWithStock[] = j.data ?? []
    // Client-side name filter (case-insensitive substring)
    if (nameTerm) {
      const lower = nameTerm.toLowerCase()
      results = results.filter(p => p.name.toLowerCase().includes(lower))
    }
    // Client-side SKU/identifier filter
    if (skuTerm) {
      const lower = skuTerm.toLowerCase()
      results = results.filter(p =>
        (p.sku ?? '').toLowerCase().includes(lower) ||
        (p.barcode ?? '').toLowerCase().includes(lower) ||
        p.id.toLowerCase().includes(lower)
      )
    }
    // Category filter
    if (advSearchCatIds.size > 0) results = results.filter(p => p.category_id && advSearchCatIds.has(p.category_id as string))
    setAdvSearchResults(results); setAdvSearching(false)
  }

  function toggleAdvCat(id: string) {
    setAdvSearchCatIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  // ── Warranty ───────────────────────────────────────────────────────────────
  async function runWarrantySearch() {
    if (!activeBranch) return
    const { imei, ticketId, invoiceId, customerName, customerMobile } = warrantyForm
    if (!imei && !ticketId && !invoiceId && !customerName && !customerMobile) return
    setWarrantySearching(true)
    const params = new URLSearchParams({ branch_id: activeBranch.id })
    if (imei) params.set('imei', imei)
    if (ticketId) params.set('ticket_id', ticketId)
    if (invoiceId) params.set('invoice_id', invoiceId)
    if (customerName) params.set('customer_name', customerName)
    if (customerMobile) params.set('customer_mobile', customerMobile)
    const res = await fetch(`/api/repairs/warranty-search?${params}`)
    const j = await res.json()
    setWarrantyResults(j.data ?? []); setWarrantySearching(false)
  }

  async function submitWarrantyClaim() {
    if (!warrantyClaimModal || !warrantyClaimReason.trim()) return
    setWarrantyClaimSubmitting(true)
    await fetch(`/api/repairs/${warrantyClaimModal.repairId}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'warranty_claim', note: `Warranty claim: ${warrantyClaimReason}` }),
    })
    setWarrantyClaimModal(null); setWarrantyClaimReason('')
    setWarrantyClaimSubmitting(false); runWarrantySearch()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toggle bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            {(
              isRetail
                ? (['all_products', 'by_category', 'custom_item'] as const)
                : (['all_products', 'by_products', 'by_parts', 'custom_item'] as const)
            ).map((view, i) => {
              const label =
                view === 'all_products' ? 'All Products'
                  : view === 'by_products' ? 'By Products'
                    : view === 'by_parts' ? 'By Part Items'
                      : view === 'by_category' ? 'By Category'
                        : 'Custom Item'
              return (
                <button
                  key={view}
                  onClick={() => {
                    setProductsView(view as ProductsView)
                    if (view === 'by_products' && catBreadcrumb.length === 0) loadCatLevel('device_types')
                    if (view === 'by_parts' && partBreadcrumb.length === 0) loadPartLevel('device_types')
                  }}
                  className={`shrink-0 px-3 py-2 text-xs font-medium transition-colors sm:px-5 sm:text-sm ${i > 0 ? 'border-l border-gray-200' : ''} ${productsView === view ? 'bg-white text-brand-teal font-semibold border-b-2 border-brand-teal' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <button
          onClick={openAdvSearch}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 sm:px-3"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden rounded bg-gray-100 px-1 text-[10px] font-mono text-gray-500 sm:inline">Ctrl S</span>
          <span className="hidden sm:inline">Advance Search</span>
        </button>
        <ScanButton onClick={() => setScannerOpen(true)} className="text-xs py-1.5" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ALL PRODUCTS VIEW */}
        {productsView === 'all_products' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text" value={allProductsSearch} onChange={e => setAllProductsSearch(e.target.value)}
                onKeyDown={(e) => {
                  const val = e.currentTarget.value.trim()
                  if (e.key === 'Enter' && val) {
                    e.preventDefault()
                    e.stopPropagation()
                    // Open modal instantly — modal performs the lookup and shows the spinner
                    setScannerTriggerBarcode(val)
                    setScannerDefaultState('scanning')
                    setScannerDefaultBarcode(undefined)
                    setScannerDefaultProduct(null)
                    setScannerOpen(true)
                    setAllProductsSearch('')
                  }
                }}
                placeholder="Search by name, SKU or barcode…" autoFocus
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-9 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
              />
              {allProductsSearch && (
                <button onClick={() => setAllProductsSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(isRetail ? (['all', 'product'] as const) : (['all', 'product', 'part'] as const)).map(t => (
                <button
                  key={t}
                  onClick={() => setAllProductsItemType(t)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${allProductsItemType === t ? 'bg-brand-teal text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {t === 'all' ? 'All' : t === 'product' ? 'Products' : 'Parts'}
                </button>
              ))}
              {allCats.length > 0 && (
                <select value={allProductsCategoryId} onChange={e => setAllProductsCategoryId(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal">
                  <option value="">All Categories</option>
                  {allCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {(allProductsCategoryId || allProductsItemType !== 'all') && (
                <button onClick={() => { setAllProductsCategoryId(''); setAllProductsItemType('all') }} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
              {!allProductsLoading && <span className="ml-auto text-xs text-gray-400">{allProductsList.length} item{allProductsList.length !== 1 ? 's' : ''}</span>}
            </div>
            {allProductsLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}
              </div>
            ) : allProductsList.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {allProductsList.map(product => <ProductCard key={product.id} product={product} onAdd={p => pos.addToCart(p as unknown as Product)} onVariantSelect={openVariantSelect} onVariantHover={prefetchVariants} />)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Package className="h-12 w-12 text-gray-200 mb-3" />
                <p className="text-sm text-gray-500 font-medium">{allProductsSearch ? `No results for "${allProductsSearch}"` : 'No products found'}</p>
                <p className="text-xs text-gray-400 mt-1">{allProductsSearch ? 'Try a different search term' : 'Add products in Inventory to get started'}</p>
              </div>
            )}
          </div>
        )}

        {/* BY PRODUCTS VIEW */}
        {productsView === 'by_products' && (
          <>
            {catBreadcrumb.length > 0 && (
              <div className="flex items-center gap-1 text-xs flex-wrap">
                <button onClick={resetCatBrowse} className="text-blue-500 hover:underline">Device Types</button>
                {catBreadcrumb.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-gray-400" />
                    {i === catBreadcrumb.length - 1
                      ? <span className="font-semibold text-gray-800">{crumb.name}</span>
                      : <button onClick={() => navigateCatBreadcrumb(i)} className="text-blue-500 hover:underline">{crumb.name}</button>
                    }
                  </span>
                ))}
              </div>
            )}
            {catLevel !== 'products' && (
              catItemsLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-200" />)}</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {catItems.map(item => (
                    <button key={item.id} onClick={() => selectCatItem(item)} className="flex flex-col w-full overflow-hidden rounded-xl border border-gray-200 bg-white hover:border-brand-teal hover:shadow-sm transition-all text-center min-h-[140px]">
                      {item.image_url ? (
                        <div className="relative w-full h-24 border-b border-gray-100 bg-white">
                          <Image src={item.image_url} alt={item.name} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-contain" />
                        </div>
                      ) : (
                        <div className="flex w-full h-24 items-center justify-center bg-gray-50 border-b border-gray-100">
                          {catLevel === 'device_types' && <Layers className="h-8 w-8 text-gray-400" />}
                          {catLevel === 'brands' && <Tag className="h-8 w-8 text-blue-400" />}
                          {catLevel === 'models' && <Phone className="h-8 w-8 text-purple-400" />}
                        </div>
                      )}
                      <div className="w-full p-3 flex-1 flex items-center justify-center">
                        <span className="text-sm font-semibold text-gray-800 line-clamp-2 leading-tight">{item.name}</span>
                      </div>
                    </button>
                  ))}
                  {catItems.length === 0 && !catItemsLoading && (
                    <p className="col-span-4 py-8 text-center text-sm text-gray-400">
                      {catLevel === 'device_types' ? 'No device types' : catLevel === 'brands' ? 'No brands' : 'No models'} found
                    </p>
                  )}
                </div>
              )
            )}
            {catLevel === 'products' && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">{catBreadcrumb[catBreadcrumb.length - 1]?.name}</h4>
                {categoryProductsLoading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}</div>
                ) : categoryProducts.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {categoryProducts.map(product => <ProductCard key={product.id} product={product} size="sm" onAdd={p => pos.addToCart(p as unknown as Product)} onVariantSelect={openVariantSelect} onVariantHover={prefetchVariants} />)}
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-gray-400">No products for this model</p>
                )}
              </div>
            )}
          </>
        )}

        {/* BY PART ITEMS VIEW */}
        {productsView === 'by_parts' && (
          <>
            {partBreadcrumb.length > 0 && (
              <div className="flex items-center gap-1 text-xs flex-wrap">
                <button onClick={resetPartBrowse} className="text-blue-500 hover:underline">Device Types</button>
                {partBreadcrumb.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-gray-400" />
                    {i === partBreadcrumb.length - 1
                      ? <span className="font-semibold text-gray-800">{crumb.name}</span>
                      : <button onClick={() => navigatePartBreadcrumb(i)} className="text-blue-500 hover:underline">{crumb.name}</button>
                    }
                  </span>
                ))}
              </div>
            )}
            {partItemsLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />)}</div>
            ) : partLevel === 'parts' ? (
              partProductsLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-200" />)}</div>
              ) : partProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {partProducts.map(product => {
                    const hasVariants = product.has_variants || (product as any).variant_count > 0
                    const oos = !hasVariants && typeof product.on_hand === 'number' && product.on_hand <= 0
                    return (
                      <button key={product.id} disabled={oos} onClick={() => hasVariants ? openVariantSelect(product) : pos.addToCart(product as unknown as Product)}
                        className={`relative flex flex-col items-center rounded-xl border bg-white p-3 text-center transition-all w-full overflow-hidden ${oos ? 'border-gray-100 opacity-50 cursor-not-allowed' : 'border-gray-200 hover:border-brand-teal hover:shadow-sm cursor-pointer'}`}>
                        {oos && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60">
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Out of Stock</span>
                          </div>
                        )}
                        {product.image_url ? (
                          <div className="relative mb-2 w-full h-28 rounded-lg bg-gray-50 overflow-hidden">
                            <Image src={product.image_url} alt={product.name} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-contain" />
                          </div>
                        ) : (
                          <div className="mb-2 flex h-28 w-full items-center justify-center rounded-lg bg-gray-100"><Package className="h-8 w-8 text-gray-300" /></div>
                        )}
                        <span className="text-sm font-semibold text-gray-800 line-clamp-2 leading-tight w-full">{product.name}</span>
                        <span className="text-sm font-bold text-brand-teal mt-1">{formatCurrency(Number(product.selling_price))}</span>
                        {typeof product.on_hand === 'number' && (
                          <span className={`text-xs mt-0.5 ${product.on_hand > 0 ? 'text-gray-400' : 'text-red-500 font-medium'}`}>
                            {product.on_hand > 0 ? `${product.on_hand} on hand` : 'Out of stock'}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-gray-400">No parts found for this part type</p>
              )
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {partItems.map(item => (
                  <button key={item.id} onClick={() => selectPartItem(item)} className="flex flex-col w-full overflow-hidden rounded-xl border border-gray-200 bg-white hover:border-brand-teal hover:shadow-sm transition-all cursor-pointer text-center min-h-[140px]">
                    {item.image_url ? (
                      <div className="relative w-full h-24 border-b border-gray-100 bg-white">
                        <Image src={item.image_url} alt={item.name} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-contain" />
                      </div>
                    ) : (
                      <div className="flex w-full h-24 items-center justify-center bg-gray-50 border-b border-gray-100">
                        {partLevel === 'device_types' && <Layers className="h-8 w-8 text-gray-400" />}
                        {partLevel === 'brands' && <Tag className="h-8 w-8 text-blue-400" />}
                        {partLevel === 'models' && <Phone className="h-8 w-8 text-purple-400" />}
                        {partLevel === 'part_types' && <Package className="h-8 w-8 text-purple-500" />}
                      </div>
                    )}
                    <div className="w-full p-3 flex-1 flex items-center justify-center">
                      <span className="text-sm font-semibold text-gray-800 line-clamp-2 leading-tight">{item.name}</span>
                    </div>
                  </button>
                ))}
                {partItems.length === 0 && !partItemsLoading && (
                  <p className="col-span-4 py-8 text-center text-sm text-gray-400">
                    {partLevel === 'device_types' ? 'No device types' : partLevel === 'brands' ? 'No brands' : partLevel === 'models' ? 'No models' : 'No part types'} found
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* BY CATEGORY VIEW — retail only */}
        {productsView === 'by_category' && (
          <div className="space-y-3">
            {!allProductsCategoryId ? (
              allCats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Package className="h-12 w-12 text-gray-200 mb-3" />
                  <p className="text-sm text-gray-500 font-medium">No categories found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {allCats.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setAllProductsCategoryId(cat.id)}
                      className="flex flex-col w-full overflow-hidden rounded-xl border border-gray-200 bg-white hover:border-brand-teal hover:shadow-sm transition-all text-center min-h-[100px] items-center justify-center p-4"
                    >
                      <Layers className="h-8 w-8 text-gray-400 mb-2" />
                      <span className="text-sm font-semibold text-gray-800 line-clamp-2 leading-tight">{cat.name}</span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => setAllProductsCategoryId('')} className="text-blue-500 hover:underline">
                    All Categories
                  </button>
                  <ChevronRight className="h-3 w-3 text-gray-400" />
                  <span className="font-semibold text-gray-800">{allCats.find(c => c.id === allProductsCategoryId)?.name}</span>
                </div>
                {allProductsLoading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}
                  </div>
                ) : allProductsList.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {allProductsList.map(product => <ProductCard key={product.id} product={product} onAdd={p => pos.addToCart(p as unknown as Product)} onVariantSelect={openVariantSelect} onVariantHover={prefetchVariants} />)}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Package className="h-12 w-12 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-500 font-medium">No products in this category</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CUSTOM ITEM VIEW */}
        {productsView === 'custom_item' && (
          <div className="max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-gray-900">Add Custom Item</h3>
            <Input label="Item Name" placeholder="Enter item description..." value={miscName} onChange={e => setMiscName(e.target.value)} />
            <Input label="Price (£)" type="number" min="0" step="0.01" placeholder="0.00" value={miscPrice} onChange={e => setMiscPrice(e.target.value)} />
            <Button className="w-full bg-brand-teal hover:bg-brand-teal-dark" disabled={!miscName.trim() || !miscPrice} onClick={addMiscItem}>
              <Plus className="h-4 w-4" /> Add to Cart
            </Button>
          </div>
        )}
      </div>

      {/* ── Variant Selection Modal ── */}
      <Modal
        open={!!variantProduct}
        onClose={() => { setVariantProduct(null); setSelectedVariantIds(new Set()) }}
        title={variantProduct ? `Select Variant — ${variantProduct.name}` : 'Select Variant'}
      >
        <div className="space-y-3">
          {variantLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />)}</div>
          ) : variantList.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No variants found</p>
          ) : (
            <>
              <p className="text-xs text-gray-400">Select one or more variants to add to the cart.</p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {variantList.map(v => {
                  const selected = selectedVariantIds.has(v.id)
                  const oos = typeof v.stock === 'number' && v.stock <= 0
                  return (
                    <button key={v.id} disabled={oos} onClick={() => !oos && toggleVariantSelected(v.id)}
                      className={`relative flex w-full items-center justify-between rounded-lg border-2 px-4 py-3 text-left transition-colors ${oos ? 'border-gray-100 opacity-50 cursor-not-allowed' : selected ? 'border-brand-teal bg-brand-teal-light cursor-pointer' : 'border-gray-200 hover:border-gray-300 cursor-pointer'}`}>
                      {oos && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Out of Stock</span>
                      )}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${selected && !oos ? 'border-brand-teal bg-brand-teal' : 'border-gray-300 bg-white'}`}>
                          {selected && !oos && <Check className="h-3.5 w-3.5 text-white" />}
                        </div>
                        {v.image_url ? (
                          <img src={v.image_url} alt={v.name} className="h-12 w-12 shrink-0 rounded-lg border border-gray-200 object-cover" />
                        ) : (
                          <div className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-gray-200 bg-gray-50" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{v.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(v.attributes ?? {}).map(([k, val]) => (
                              <span key={k} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{k}: {val}</span>
                            ))}
                          </div>
                          {v.sku && <p className="text-xs text-gray-400 mt-0.5">SKU: {v.sku}</p>}
                          {typeof v.stock === 'number' && !oos && <p className="text-xs text-gray-400 mt-0.5">{v.stock} on hand</p>}
                        </div>
                      </div>
                      {!oos && (
                        <div className="shrink-0 ml-3 text-right">
                          <p className="font-bold text-brand-teal">{formatCurrency(v.selling_price)}</p>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { setVariantProduct(null); setSelectedVariantIds(new Set()) }}>Cancel</Button>
            <Button className="bg-brand-teal hover:bg-brand-teal-dark" disabled={selectedVariantIds.size === 0} onClick={addVariantToCart}>
              Add to Cart{selectedVariantIds.size > 1 ? ` (${selectedVariantIds.size})` : ''}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Advanced Search Modal ── */}
      {advSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAdvSearchOpen(false)}>
          <div className="flex w-[920px] max-h-[85vh] rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Left: Category filter */}
            <div className="w-60 shrink-0 border-r border-gray-100 flex flex-col">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold text-gray-700">Browse by Categories</p>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
                {allCats.map(cat => (
                  <label key={cat.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50">
                    <input type="checkbox" checked={advSearchCatIds.has(cat.id)} onChange={() => toggleAdvCat(cat.id)} className="h-3.5 w-3.5 rounded border-gray-300 text-brand-teal accent-[var(--brand-teal)]" />
                    <span className="text-xs text-gray-700">{cat.name}</span>
                  </label>
                ))}
                {allCats.length === 0 && <p className="py-4 text-center text-xs text-gray-400">No categories</p>}
              </div>
            </div>
            {/* Right: Search + results */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                <h3 className="font-bold text-gray-900">Advanced Search</h3>
                <button onClick={() => setAdvSearchOpen(false)} className="ml-2 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex gap-3 border-b border-gray-100 px-5 py-3">
                <div className="flex-1">
                  <p className="mb-1 text-xs font-medium text-gray-600">Item Name</p>
                  <input type="text" placeholder="Enter item name" value={advSearchName} onChange={e => setAdvSearchName(e.target.value)} onKeyDown={e => e.key === 'Enter' && runAdvSearch()} className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none" />
                </div>
                <div className="flex-1">
                  <p className="mb-1 text-xs font-medium text-gray-600">Item Identifier</p>
                  <input type="text" placeholder="Item ID/SKU/UPC/IMEI/Serial" value={advSearchSku} onChange={e => setAdvSearchSku(e.target.value)} onKeyDown={e => e.key === 'Enter' && runAdvSearch()} className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3">
                <p className="mb-2 text-xs text-gray-500">Results ({advSearchResults.length})</p>
                {advSearching ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />)}</div>
                ) : advSearchResults.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No results. Try searching above.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
                        <th className="pb-2 text-left">Item</th>
                        <th className="pb-2 text-left w-28">SKU/UPC</th>
                        <th className="pb-2 text-center w-20">Stock</th>
                        <th className="pb-2 text-right w-20">Price</th>
                        <th className="pb-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {advSearchResults.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              {p.image_url ? <div className="relative h-9 w-9 shrink-0 rounded border border-gray-100 overflow-hidden"><Image src={p.image_url} alt={p.name} fill sizes="36px" className="object-contain" /></div> : <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100"><ShoppingBag className="h-4 w-4 text-gray-300" /></div>}
                              <div className="min-w-0">
                                <p className="line-clamp-1 text-xs font-medium text-gray-900">{p.name}</p>
                                {p.is_serialized && <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">Serialized</span>}
                              </div>
                            </div>
                          </td>
                          <td className="py-2 text-xs text-gray-500">{p.sku ?? '—'}</td>
                          <td className="py-2 text-center">
                            {p.on_hand !== undefined
                              ? <span className={`inline-flex h-6 w-8 items-center justify-center rounded-full text-xs font-medium ${(p.on_hand ?? 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{p.on_hand ?? 0}</span>
                              : <span className="text-xs text-gray-400">—</span>
                            }
                          </td>
                          <td className="py-2 text-right text-xs font-semibold text-brand-teal">{formatCurrency(p.selling_price)}</td>
                          <td className="py-2 pl-2">
                            {(() => {
                              const advOos = !p.is_service && !(p.has_variants || (p.variant_count ?? 0) > 0) && p.on_hand !== undefined && (p.on_hand ?? 0) <= 0
                              return (
                                <button
                                  disabled={advOos}
                                  title={advOos ? 'Out of stock' : undefined}
                                  onClick={() => { if ((p.has_variants || (p.variant_count ?? 0) > 0)) { openVariantSelect(p); setAdvSearchOpen(false) } else { pos.addToCart(p as unknown as Product); setAdvSearchOpen(false) } }}
                                  className={`flex h-7 w-7 items-center justify-center rounded border text-gray-500 ${advOos ? 'border-gray-100 opacity-40 cursor-not-allowed' : 'border-gray-200 hover:border-brand-teal hover:text-brand-teal'}`}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              )
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                <button onClick={() => { setAdvSearchName(''); setAdvSearchSku(''); setAdvSearchCatIds(new Set()); setAdvSearchResults([]) }} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                  <X className="h-3.5 w-3.5" /> Reset
                </button>
                <button onClick={runAdvSearch} disabled={advSearching} className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50">
                  <Search className="h-3.5 w-3.5" /> Search
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Warranty Claim Modal ── */}
      {warrantyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setWarrantyOpen(false)}>
          <div className="flex w-[880px] max-h-[88vh] flex-col rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-teal" />
                <h3 className="text-base font-bold text-gray-900">Warranty Claim — Check Device / Item History</h3>
              </div>
              <button onClick={() => setWarrantyOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Device IMEI / Serial No.', key: 'imei', placeholder: 'Enter IMEI or serial' },
                  { label: 'Customer Name', key: 'customerName', placeholder: 'First or last name' },
                  { label: 'Customer Mobile', key: 'customerMobile', placeholder: 'Phone number' },
                  { label: 'Ticket ID', key: 'ticketId', placeholder: 'e.g. T-0042' },
                  { label: 'Invoice ID', key: 'invoiceId', placeholder: 'Invoice UUID' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs font-medium text-gray-600">{field.label}</label>
                    <input
                      type="text" placeholder={field.placeholder}
                      value={(warrantyForm as any)[field.key]}
                      onChange={e => setWarrantyForm(f => ({ ...f, [field.key]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && runWarrantySearch()}
                      className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                    />
                  </div>
                ))}
                <div className="flex items-end">
                  <button onClick={runWarrantySearch} disabled={warrantySearching} className="flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-brand-teal px-4 text-sm font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50">
                    <Search className="h-3.5 w-3.5" /> {warrantySearching ? 'Searching…' : 'Search'}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {warrantySearching ? (
                <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />)}</div>
              ) : warrantyResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <ShieldCheck className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">Enter search criteria above to find repair history</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {warrantyResults.map((repair: any) => {
                    const customer = repair.customers
                    const items: any[] = repair.repair_items ?? []
                    const statusColors: Record<string, string> = { repaired: 'bg-green-100 text-green-700', in_progress: 'bg-blue-100 text-blue-700', waiting_for_parts: 'bg-yellow-100 text-yellow-700', waiting_for_inspection: 'bg-orange-100 text-orange-700', picked_up: 'bg-gray-100 text-gray-600' }
                    const statusLabel = repair.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                    return (
                      <div key={repair.id} className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                          <div className="flex items-center gap-4">
                            <div><p className="text-xs text-gray-500">Ticket</p><p className="text-sm font-bold text-gray-900">{repair.job_number}</p></div>
                            {customer && <div><p className="text-xs text-gray-500">Customer</p><p className="text-sm font-medium text-gray-900">{customer.first_name} {customer.last_name ?? ''}</p>{customer.phone && <p className="text-xs text-gray-500">{customer.phone}</p>}</div>}
                            <div><p className="text-xs text-gray-500">Device</p><p className="text-sm font-medium text-gray-900">{[repair.device_brand, repair.device_model].filter(Boolean).join(' ') || '—'}</p>{repair.serial_number && <p className="text-xs text-gray-500">S/N: {repair.serial_number}</p>}</div>
                            <div><p className="text-xs text-gray-500">Issue</p><p className="text-sm text-gray-700 line-clamp-1 max-w-xs">{repair.issue}</p></div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[repair.status] ?? 'bg-gray-100 text-gray-600'}`}>{statusLabel}</span>
                            <div className="relative">
                              <button onClick={() => setWarrantyActionsOpen(warrantyActionsOpen === repair.id ? null : repair.id)} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                                Actions <ChevronRight className="h-3 w-3 rotate-90" />
                              </button>
                              {warrantyActionsOpen === repair.id && (
                                <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                                  <button onClick={() => { setWarrantyActionsOpen(null); router.push(`/repairs/${repair.id}`) }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"><ExternalLink className="h-3.5 w-3.5" /> View Ticket</button>
                                  <button onClick={() => { setWarrantyActionsOpen(null); router.push(`/pos/refund?sale_id=${repair.id}`) }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"><ArrowLeft className="h-3.5 w-3.5" /> Issue Refund</button>
                                  <button onClick={() => setWarrantyActionsOpen(null)} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"><X className="h-3.5 w-3.5" /> Out Of Warranty</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {items.length > 0 && (
                          <table className="w-full text-sm">
                            <thead><tr className="border-b border-gray-100 text-xs font-medium text-gray-500"><th className="px-4 py-2 text-left">Part / Service</th><th className="px-4 py-2 text-center w-24">Warranty</th><th className="px-4 py-2 text-center w-32">Expires</th><th className="px-4 py-2 text-center w-24">Status</th><th className="px-4 py-2 w-32"></th></tr></thead>
                            <tbody className="divide-y divide-gray-50">
                              {items.map((item: any) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2.5 font-medium text-gray-900">{item.name}</td>
                                  <td className="px-4 py-2.5 text-center">{item.warranty_days ? <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{item.warranty_days}d</span> : <span className="text-xs text-gray-400">None</span>}</td>
                                  <td className="px-4 py-2.5 text-center text-xs text-gray-500">{item.warrantyExpiry ? new Date(item.warrantyExpiry).toLocaleDateString() : '—'}</td>
                                  <td className="px-4 py-2.5 text-center">{item.warranty_days ? (item.inWarranty ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">In Warranty</span> : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Expired</span>) : <span className="text-xs text-gray-400">—</span>}</td>
                                  <td className="px-4 py-2.5 text-right">{item.inWarranty && <button onClick={() => setWarrantyClaimModal({ repairId: repair.id, item })} className="rounded border border-brand-teal-light bg-brand-teal-light px-3 py-1 text-xs font-medium text-brand-teal hover:bg-brand-teal-light">Warranty Claim</button>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {items.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">No parts recorded for this repair.</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Warranty Claim Sub-Modal ── */}
      <Modal open={!!warrantyClaimModal} onClose={() => { setWarrantyClaimModal(null); setWarrantyClaimReason('') }} title="Part Warranty Claim" size="sm">
        {warrantyClaimModal && (
          <div className="space-y-4">
            <div className="rounded-lg bg-brand-teal-light border border-brand-teal-light px-4 py-3">
              <p className="text-xs text-brand-teal font-medium">Part</p>
              <p className="text-sm font-semibold text-gray-900">{warrantyClaimModal.item.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">Warranty expires: {warrantyClaimModal.item.warrantyExpiry ? new Date(warrantyClaimModal.item.warrantyExpiry).toLocaleDateString() : '—'}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fault Description / Reason <span className="text-red-500">*</span></label>
              <textarea rows={3} placeholder="Describe the fault or reason for warranty claim…" value={warrantyClaimReason} onChange={e => setWarrantyClaimReason(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setWarrantyClaimModal(null); setWarrantyClaimReason('') }}>Cancel</Button>
              <Button className="flex-1 bg-brand-teal hover:bg-brand-teal-dark" loading={warrantyClaimSubmitting} disabled={!warrantyClaimReason.trim()} onClick={submitWarrantyClaim}>Submit Claim</Button>
            </div>
          </div>
        )}
      </Modal>

      <ScannerModal
        open={scannerOpen}
        onClose={() => { setScannerOpen(false); setScannerTriggerBarcode(undefined); setScannerDefaultState('scanning'); setScannerDefaultBarcode(undefined); setScannerDefaultProduct(null) }}
        mode="pos"
        branchId={activeBranch?.id ?? null}
        triggerBarcode={scannerTriggerBarcode}
        defaultState={scannerDefaultState}
        defaultBarcode={scannerDefaultBarcode}
        defaultProduct={scannerDefaultProduct}
        onProductCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['pos-products'] })
        }}
        onAddToCart={(scanned: ScannedProduct) => {
          const product = scanned as unknown as ProductWithStock
          if (product.has_variants || (product as any).variant_count > 0) {
            setVariantProduct(product)
          } else {
            pos.addToCart(product as unknown as Product)
            toast.success(`${product.name} added to cart`)
          }
          setScannerOpen(false)
        }}
      />
    </div>
  )
}
