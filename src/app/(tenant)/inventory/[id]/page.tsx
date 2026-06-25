'use client'
import { useState, useEffect, use } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BrandSpinner } from '@/components/ui/brand-spinner'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Trash2, Store, Plus, RefreshCw, Layers, Barcode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CreatableCombobox } from '@/components/ui/creatable-combobox'
import { Modal } from '@/components/ui/modal'
import { ImageUpload } from '@/components/ui/image-upload'
import { formatCurrency, getCurrencySymbol } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import Link from 'next/link'
import { BarcodeModal } from '@/components/inventory/barcode-modal'

interface BranchAvailability {
  branch_id: string
  name: string
  is_main: boolean
  is_enabled: boolean
}

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null
  selling_price: number; cost_price: number | null; is_service: boolean
  image_url: string | null; item_type?: string; part_type?: string | null
  physical_location?: string | null; has_variants?: boolean
  commission_enabled: boolean; commission_type: string; commission_rate: number
  loyalty_enabled: boolean; low_stock_alert: number | null
  category_id: string | null; brand_id: string | null; model_id: string | null; supplier_id: string | null
  categories?: { name: string } | null; brands?: { name: string } | null
  suppliers?: { name: string; id: string } | null
  service_devices?: { name: string; id: string } | null
}

interface Category { id: string; name: string }
interface Brand { id: string; name: string; category_id?: string | null }
interface Supplier { id: string; name: string }
interface ServiceDevice { id: string; name: string; brand_id?: string | null }
interface PartType { id: string; name: string; device_id?: string | null }

interface DBVariant {
  id: string; product_id: string; name: string
  sku: string | null; barcode: string | null
  selling_price: number; cost_price: number | null
  attributes: Record<string, string>
  stock?: number
  image_url?: string | null
}

interface EditVariantRow {
  id: string
  name: string
  sku: string
  barcode: string
  costPrice: string
  sellingPrice: string
  attributes: Record<string, string>
  stock: string
  imageUrl: string
  dirty: boolean
}

interface NewVariantRow {
  key: string
  name: string
  attributes: Record<string, string>
  sku: string
  barcode: string
  costPrice: string
  sellingPrice: string
  stock: string
  imageUrl: string
}

interface AttrDef { id: string; name: string; valuesRaw: string }

type ItemType = 'product' | 'part'

function uid() { return Math.random().toString(36).slice(2) }

function cartesian(attrs: { name: string; values: string[] }[]): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}]
  for (const attr of attrs) {
    const next: Record<string, string>[] = []
    for (const combo of combos) {
      for (const val of attr.values) {
        next.push({ ...combo, [attr.name]: val })
      }
    }
    combos = next
  }
  return combos
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { activeBranch, branches, verticalTemplateSlug } = useAuthStore()
  const currSymbol = getCurrencySymbol()
  // Simplified, repair-free product form is specific to the retail-store
  // vertical template — independent of any module's enabled/disabled state.
  const hasRepairs = verticalTemplateSlug !== 'retail-store'
  const router = useRouter()
  const qc = useQueryClient()

  const [product, setProduct] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false)
  const [variantBarcodeTarget, setVariantBarcodeTarget] = useState<{ id: string; name: string; barcode: string } | null>(null)

  // ── Reference data ────────────────────────────────────────────────────────
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['inv-categories'],
    queryFn: async () => { const r = await fetch('/api/categories'); const j = await r.json(); return j.data ?? [] },
    staleTime: 10 * 60_000,
  })
  const { data: allBrands = [] } = useQuery<Brand[]>({
    queryKey: ['inv-brands'],
    queryFn: async () => { const r = await fetch('/api/brands'); const j = await r.json(); return j.data ?? [] },
    staleTime: 10 * 60_000,
  })
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['inv-suppliers'],
    queryFn: async () => { const r = await fetch('/api/suppliers'); const j = await r.json(); return j.data ?? [] },
    staleTime: 10 * 60_000,
  })
  const { data: allDevices = [] } = useQuery<ServiceDevice[]>({
    queryKey: ['inv-devices'],
    queryFn: async () => { const r = await fetch('/api/services/devices'); const j = await r.json(); return j.data ?? [] },
    staleTime: 10 * 60_000,
  })
  const { data: allPartTypes = [] } = useQuery<PartType[]>({
    queryKey: ['inv-part-types'],
    queryFn: async () => { const r = await fetch('/api/part-types'); const j = await r.json(); return j.data ?? [] },
    staleTime: 10 * 60_000,
  })

  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingBrand, setAddingBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [addingDevice, setAddingDevice] = useState(false)
  const [newDeviceName, setNewDeviceName] = useState('')

  const [itemType, setItemType] = useState<ItemType>('product')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [modelId, setModelId] = useState('')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [partType, setPartType] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [onHand, setOnHand] = useState<string>('0')
  const [lowStockAlert, setLowStockAlert] = useState<string>('5')
  const [physicalLocation, setPhysicalLocation] = useState('')
  const [commissionEnabled, setCommissionEnabled] = useState(false)
  const [commissionType, setCommissionType] = useState('percentage')
  const [commissionRate, setCommissionRate] = useState('')
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true)
  const [skuConflict, setSkuConflict] = useState(false)
  const [barcodeConflict, setBarcodeConflict] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [togglingBranch, setTogglingBranch] = useState<string | null>(null)
  const [hasVariants, setHasVariants] = useState(false)

  // ── Variant state ─────────────────────────────────────────────────────────
  const [existingVariants, setExistingVariants] = useState<EditVariantRow[]>([])

  const [showAddVariants, setShowAddVariants] = useState(false)
  const [attrDefs, setAttrDefs] = useState<AttrDef[]>([{ id: uid(), name: '', valuesRaw: '' }])
  const [newVariantRows, setNewVariantRows] = useState<NewVariantRow[]>([])

  // ── Product fetch ─────────────────────────────────────────────────────────
  const { data: productData, isLoading: productLoading } = useQuery<Product & { on_hand?: number }>({
    queryKey: ['inv-product', id, activeBranch?.id],
    queryFn: async () => {
      const branchParam = activeBranch ? `?branch_id=${activeBranch.id}` : ''
      const res = await fetch(`/api/products/${id}${branchParam}`)
      const json = await res.json()
      return json.data ?? json
    },
    staleTime: 30_000,
  })

  // ── Variants fetch ────────────────────────────────────────────────────────
  const { data: variantsData } = useQuery<DBVariant[]>({
    queryKey: ['inv-product-variants', id, activeBranch?.id],
    queryFn: async () => {
      const branchParam = activeBranch ? `?branch_id=${activeBranch.id}` : ''
      const res = await fetch(`/api/products/${id}/variants${branchParam}`)
      const json = await res.json()
      return json.data ?? []
    },
    staleTime: 30_000,
    enabled: !!id,
  })

  useEffect(() => {
    if (!productData) return
    const p = productData
    setProduct(p)
    if (p.on_hand !== undefined) setOnHand(String(p.on_hand))
    setItemType((p.item_type as ItemType) ?? (p.is_service ? 'part' : 'product'))
    setName(p.name ?? '')
    setCategoryId(p.category_id ?? '')
    setBrandId(p.brand_id ?? '')
    setModelId(p.model_id ?? p.service_devices?.id ?? '')
    setSku(p.sku ?? '')
    setBarcode(p.barcode ?? '')
    setImageUrl(p.image_url ?? '')
    setPartType(p.part_type ?? '')
    setCostPrice(p.cost_price != null ? String(p.cost_price) : '')
    setSellingPrice(p.selling_price != null ? String(p.selling_price) : '')
    setSupplierId(p.supplier_id ?? p.suppliers?.id ?? '')
    setLowStockAlert(p.low_stock_alert != null ? String(p.low_stock_alert) : '5')
    setPhysicalLocation(p.physical_location ?? '')
    setCommissionEnabled(p.commission_enabled ?? false)
    setCommissionType(p.commission_type ?? 'percentage')
    setCommissionRate(p.commission_rate != null ? String(p.commission_rate) : '')
    setLoyaltyEnabled(p.loyalty_enabled ?? true)
    setHasVariants(p.has_variants ?? false)
  }, [productData])

  useEffect(() => {
    if (!variantsData) return
    setExistingVariants(variantsData.map(v => ({
      id: v.id,
      name: v.name,
      sku: v.sku ?? '',
      barcode: v.barcode ?? '',
      costPrice: v.cost_price != null ? String(v.cost_price) : '',
      sellingPrice: String(v.selling_price),
      attributes: v.attributes ?? {},
      stock: v.stock != null ? String(v.stock) : '0',
      imageUrl: v.image_url ?? '',
      dirty: false,
    })))
  }, [variantsData])

  // ── Uniqueness check ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!sku && !barcode) { setSkuConflict(false); setBarcodeConflict(false); return }
    const timer = setTimeout(async () => {
      setCheckingAvailability(true)
      try {
        const p = new URLSearchParams()
        if (sku) p.set('sku', sku)
        if (barcode) p.set('barcode', barcode)
        p.set('excludeId', id)
        const res = await fetch(`/api/products/check-availability?${p.toString()}`)
        const json = await res.json()
        if (json.data) { setSkuConflict(json.data.skuExists); setBarcodeConflict(json.data.barcodeExists) }
      } finally {
        setCheckingAvailability(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [sku, barcode, id])

  // ── Branch availability ───────────────────────────────────────────────────
  const { data: branchAvailability = [] } = useQuery<BranchAvailability[]>({
    queryKey: ['inv-product-branches', id],
    queryFn: async () => {
      const res = await fetch(`/api/products/${id}/branch-availability`)
      const json = await res.json()
      return json.data ?? []
    },
    staleTime: 60_000,
  })

  async function toggleBranchAvailability(branchId: string, currentValue: boolean) {
    setTogglingBranch(branchId)
    qc.setQueryData<BranchAvailability[]>(['inv-product-branches', id], (prev = []) =>
      prev.map(b => b.branch_id === branchId ? { ...b, is_enabled: !currentValue } : b)
    )
    const res = await fetch(`/api/products/${id}/branch-availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId, is_enabled: !currentValue }),
    })
    if (!res.ok) {
      qc.setQueryData<BranchAvailability[]>(['inv-product-branches', id], (prev = []) =>
        prev.map(b => b.branch_id === branchId ? { ...b, is_enabled: currentValue } : b)
      )
    }
    setTogglingBranch(null)
  }

  // ── Filtered lists ────────────────────────────────────────────────────────
  const brands = categoryId
    ? allBrands.filter(b => b.id === brandId || b.category_id === categoryId || !b.category_id)
    : allBrands

  const devices = brandId
    ? allDevices.filter(d => d.id === modelId || d.brand_id === brandId || !d.brand_id)
    : allDevices

  const dbPartTypes = modelId ? allPartTypes.filter(p => p.device_id === modelId) : allPartTypes
  const partTypeOptions = [...dbPartTypes.map(p => ({ value: p.name, label: p.name }))]
  if (partType && !partTypeOptions.find(o => o.value === partType)) {
    partTypeOptions.unshift({ value: partType, label: partType })
  }

  // ── Reference data helpers ────────────────────────────────────────────────
  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCategoryName.trim() }) })
    if (res.ok) {
      const json = await res.json()
      qc.setQueryData<Category[]>(['inv-categories'], (prev = []) => [...prev, json.data])
      setCategoryId(json.data.id)
      setNewCategoryName(''); setAddingCategory(false)
    }
  }

  async function createCategory(name: string) {
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!res.ok) return
    const json = await res.json()
    qc.setQueryData<Category[]>(['inv-categories'], (prev = []) => [...prev, json.data])
    setCategoryId(json.data.id); setBrandId(''); setModelId(''); setPartType('')
  }

  async function editCategory(id: string, name: string) {
    const res = await fetch(`/api/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!res.ok) { toast.error('Failed to rename category'); return }
    const updated: Category = (await res.json()).data
    qc.setQueryData<Category[]>(['inv-categories'], (prev = []) => prev.map(c => c.id === id ? { ...c, name: updated.name } : c))
    toast.success('Category renamed')
  }

  async function deleteCategory(id: string) {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete category — it may be in use'); return }
    qc.setQueryData<Category[]>(['inv-categories'], (prev = []) => prev.filter(c => c.id !== id))
    if (categoryId === id) { setCategoryId(''); setBrandId(''); setModelId(''); setPartType('') }
    toast.success('Category deleted')
  }

  async function handleAddBrand() {
    if (!newBrandName.trim()) return
    const res = await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newBrandName.trim(), category_id: categoryId || null }) })
    if (res.ok) {
      const json = await res.json()
      qc.setQueryData<Brand[]>(['inv-brands'], (prev = []) => [...prev, json.data])
      setBrandId(json.data.id)
      setNewBrandName(''); setAddingBrand(false)
    }
  }

  async function createBrand(name: string) {
    const res = await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, category_id: categoryId || null }) })
    if (!res.ok) return
    const json = await res.json()
    qc.setQueryData<Brand[]>(['inv-brands'], (prev = []) => [...prev, json.data])
    setBrandId(json.data.id); setModelId('')
  }

  async function editBrand(id: string, name: string) {
    const res = await fetch(`/api/brands/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!res.ok) { toast.error('Failed to rename brand'); return }
    const updated: Brand = (await res.json()).data
    qc.setQueryData<Brand[]>(['inv-brands'], (prev = []) => prev.map(b => b.id === id ? { ...b, name: updated.name } : b))
    toast.success('Brand renamed')
  }

  async function deleteBrand(id: string) {
    const res = await fetch(`/api/brands/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete brand — it may be in use'); return }
    qc.setQueryData<Brand[]>(['inv-brands'], (prev = []) => prev.filter(b => b.id !== id))
    if (brandId === id) { setBrandId(''); setModelId('') }
    toast.success('Brand deleted')
  }

  async function handleAddDevice() {
    if (!newDeviceName.trim() || !brandId) return
    const selectedBrand = brands.find(b => b.id === brandId)
    if (!selectedBrand) return
    const mfRes = await fetch('/api/services/manufacturers')
    const mfJson = await mfRes.json()
    let manufacturer = (mfJson.data ?? []).find((m: { name: string }) => m.name === selectedBrand.name)
    if (!manufacturer) {
      const cr = await fetch('/api/services/manufacturers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: selectedBrand.name }) })
      if (!cr.ok) return
      manufacturer = (await cr.json()).data
    }
    const res = await fetch('/api/services/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newDeviceName.trim(), manufacturer_id: manufacturer.id, brand_id: brandId || null }) })
    if (res.ok) {
      const json = await res.json()
      qc.setQueryData<ServiceDevice[]>(['inv-devices'], (prev = []) => [...prev, json.data])
      setModelId(json.data.id)
      setNewDeviceName(''); setAddingDevice(false)
    }
  }

  // ── Variant helpers ───────────────────────────────────────────────────────
  function updateExistingVariant(variantId: string, field: keyof Omit<EditVariantRow, 'id' | 'name' | 'attributes' | 'dirty'>, val: string) {
    setExistingVariants(prev => prev.map(v => v.id === variantId ? { ...v, [field]: val, dirty: true } : v))
  }

  async function deleteVariant(variantId: string) {
    const prevVariants = existingVariants
    const wasLast = existingVariants.length === 1
    setExistingVariants(p => p.filter(v => v.id !== variantId))
    if (wasLast) setHasVariants(false)
    const res = await fetch(`/api/products/${id}/variants/${variantId}`, { method: 'DELETE' })
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ['inv-product-variants', id] })
    } else {
      setExistingVariants(prevVariants)
      if (wasLast) setHasVariants(true)
      toast.error('Failed to delete variant.')
    }
  }

  function updateAttr(attrId: string, field: 'name' | 'valuesRaw', val: string) {
    setAttrDefs(prev => prev.map(a => a.id === attrId ? { ...a, [field]: val } : a))
  }

  function removeAttr(attrId: string) {
    setAttrDefs(prev => prev.length > 1 ? prev.filter(a => a.id !== attrId) : prev)
  }

  function generateNewVariants() {
    const valid = attrDefs.filter(a => a.name.trim() && a.valuesRaw.trim())
    if (!valid.length) { toast.error('Add at least one attribute with values.'); return }
    const parsed = valid.map(a => ({
      name: a.name.trim(),
      values: a.valuesRaw.split(',').map(v => v.trim()).filter(Boolean),
    }))
    const combos = cartesian(parsed)
    setNewVariantRows(combos.map((attrs, i) => ({
      key: `${uid()}-${i}`,
      name: Object.values(attrs).join(' / '),
      attributes: attrs,
      sku: '',
      barcode: '',
      costPrice: costPrice,
      sellingPrice: sellingPrice,
      stock: '0',
      imageUrl: '',
    })))
    toast.success(`${combos.length} variant${combos.length !== 1 ? 's' : ''} ready to add.`)
  }

  function updateNewVariantRow(key: string, field: keyof Omit<NewVariantRow, 'key' | 'name' | 'attributes'>, val: string) {
    setNewVariantRows(prev => prev.map(r => r.key === key ? { ...r, [field]: val } : r))
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    // 1. Save product
    const payload: Record<string, unknown> = {
      name: name.trim(), item_type: itemType,
      category_id: categoryId || null, brand_id: brandId || null, model_id: modelId || null,
      sku: sku || null, barcode: barcode || null, image_url: imageUrl || null,
      is_service: false, part_type: itemType === 'part' ? (partType || null) : null,
      cost_price: parseFloat(costPrice) || 0, selling_price: parseFloat(sellingPrice) || 0,
      supplier_id: itemType === 'part' ? (supplierId || null) : null,
      low_stock_alert: parseInt(lowStockAlert) || 0,
      initial_stock: parseInt(onHand) || 0,
      physical_location: physicalLocation || null, branch_id: activeBranch?.id ?? null,
      commission_enabled: commissionEnabled, commission_type: commissionType,
      commission_rate: parseFloat(commissionRate) || 0, loyalty_enabled: loyaltyEnabled,
      has_variants: hasVariants || existingVariants.length > 0 || newVariantRows.length > 0,
      is_draft: false,
    }

    const productCacheKey = ['inv-product', id, activeBranch?.id]
    const prevProductData = qc.getQueryData(productCacheKey)
    qc.setQueryData(productCacheKey, (old: any) =>
      old ? { ...old, name: name.trim(), selling_price: parseFloat(sellingPrice) || old.selling_price, cost_price: parseFloat(costPrice) || old.cost_price } : old
    )

    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      qc.setQueryData(productCacheKey, prevProductData)
      const j = await res.json()
      toast.error(j?.message || j?.error?.message || 'Failed to update product.')
      setSaving(false)
      return
    }

    // 2. PATCH dirty existing variants
    const dirtyVariants = existingVariants.filter(v => v.dirty)
    if (dirtyVariants.length > 0) {
      const results = await Promise.all(dirtyVariants.map(async (v) => {
        const res = await fetch(`/api/products/${id}/variants/${v.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: v.name,
            sku: v.sku || null,
            barcode: v.barcode || null,
            selling_price: parseFloat(v.sellingPrice) || 0,
            cost_price: parseFloat(v.costPrice) || 0,
            attributes: v.attributes,
            stock: parseInt(v.stock) || 0,
            image_url: v.imageUrl || null,
            branch_id: activeBranch?.id
          }),
        })
        return { id: v.id, ok: res.ok, error: res.ok ? null : (await res.json().catch(() => null))?.error?.message }
      }))

      const failed = results.filter(r => !r.ok)
      const succeededIds = new Set(results.filter(r => r.ok).map(r => r.id))
      // Only clear the dirty flag on variants that actually saved — failed ones stay
      // marked unsaved so the user can see and retry instead of silently losing the edit.
      setExistingVariants(prev => prev.map(v => succeededIds.has(v.id) ? { ...v, dirty: false } : v))
      qc.invalidateQueries({ queryKey: ['inv-product-variants', id] })

      if (failed.length > 0) {
        toast.error(failed[0].error || `Failed to save ${failed.length} variant${failed.length !== 1 ? 's' : ''}.`)
        setSaving(false)
        return
      }
    }

    // 3. POST new variants
    if (newVariantRows.length > 0) {
      const missingPrice = newVariantRows.some(v => !v.sellingPrice)
      if (missingPrice) {
        toast.warning('Some new variants are missing a selling price and were skipped.')
      }
      const validNew = newVariantRows.filter(v => !!v.sellingPrice)
      if (validNew.length > 0) {
        const varRes = await fetch(`/api/products/${id}/variants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_id: activeBranch?.id,
            variants: validNew.map(v => ({
              name: v.name, sku: v.sku || null, barcode: v.barcode || null,
              selling_price: parseFloat(v.sellingPrice) || 0,
              cost_price: parseFloat(v.costPrice) || 0,
              attributes: v.attributes,
              stock: parseInt(v.stock) || 0,
              image_url: v.imageUrl || null,
            })),
          }),
        })
        if (varRes.ok) {
          setNewVariantRows([])
          setAttrDefs([{ id: uid(), name: '', valuesRaw: '' }])
          setShowAddVariants(false)
          qc.invalidateQueries({ queryKey: ['inv-product-variants', id] })
        }
      }
    }

    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['inv-product', id, activeBranch?.id] })
    qc.invalidateQueries({ queryKey: ['inventory'] })
    qc.invalidateQueries({ queryKey: ['inventory-stats'] })
    toast.success('Changes saved.')
    setSaving(false)
    router.push('/inventory')
  }

  async function handleDelete() {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory-stats'] })
    }
    router.push('/inventory')
  }

  if (productLoading && !productData) {
    return (
      <div className="flex items-center justify-center py-32">
        <BrandSpinner size="lg" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">Product not found.</p>
        <Link href="/inventory" className="mt-2 inline-block text-sm text-brand-teal hover:underline">Back to Inventory</Link>
      </div>
    )
  }

  const cost = parseFloat(costPrice)
  const sell = parseFloat(sellingPrice)
  const hasMargin = !isNaN(cost) && !isNaN(sell) && cost > 0 && sell > 0
  const allVariants = existingVariants

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 py-3 gap-3 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/inventory" className="flex shrink-0 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back to Inventory</span><span className="sm:hidden">Back</span>
          </Link>
          <span className="text-gray-300 shrink-0">/</span>
          <span className="text-sm font-medium text-gray-900 truncate">{product.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" className="text-red-600 hover:bg-red-50 px-3 sm:px-4" onClick={() => setDeleteModal(true)}>
            <Trash2 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Delete</span>
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={skuConflict || barcodeConflict} className="px-3 sm:px-4">
            <Save className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Save Changes</span><span className="sm:hidden">Save</span>
          </Button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl px-6 py-6 space-y-8">

          {/* Type Toggle */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Item Type</h2>
            </div>
            <div className="flex rounded-lg border border-gray-200 p-0.5 max-w-xs">
              <button type="button" onClick={() => setItemType('product')}
                className={`flex-1 rounded py-2 text-sm font-medium transition-colors ${itemType === 'product' ? 'bg-brand-teal text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Product
              </button>
              <button type="button" onClick={() => setItemType('part')}
                className={`flex-1 rounded py-2 text-sm font-medium transition-colors ${itemType === 'part' ? 'bg-brand-teal text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Part
              </button>
            </div>
          </section>

          {/* Item Details */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">{itemType === 'part' ? 'Part' : 'Product'} Details</h2>
            </div>
            <div className="space-y-4">
              <ImageUpload label={itemType === 'part' ? 'Part image' : 'Product image'} value={imageUrl} onChange={setImageUrl} />
              <Input label="Name *" required value={name} onChange={e => setName(e.target.value)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {hasRepairs ? 'Device Type' : 'Category'} <span className="text-xs font-normal text-gray-400">(select or create)</span>
                  </label>
                  <CreatableCombobox
                    options={categories.map(c => ({ value: c.id, label: c.name }))}
                    value={categoryId}
                    onChange={(v) => { setCategoryId(v); setBrandId(''); setModelId(''); setPartType('') }}
                    onCreate={createCategory}
                    onEdit={editCategory}
                    onDelete={deleteCategory}
                    placeholder={`Select or type to create...`}
                    createLabel={hasRepairs ? 'Add device type' : 'Add category'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Brand <span className="text-xs font-normal text-gray-400">(select or create)</span>
                  </label>
                  <CreatableCombobox
                    options={brands.map(b => ({ value: b.id, label: b.name }))}
                    value={brandId}
                    onChange={(v) => { setBrandId(v); setModelId('') }}
                    onCreate={createBrand}
                    onEdit={editBrand}
                    onDelete={deleteBrand}
                    placeholder="Select or type to create..."
                    createLabel="Add brand"
                  />
                </div>
              </div>
              {hasRepairs && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">Model</label>
                      <button type="button" onClick={() => setAddingDevice(true)} className="text-xs text-brand-teal hover:underline">+ Add</button>
                    </div>
                    <Select options={[{ value: '', label: 'Select model...' }, ...devices.map(d => ({ value: d.id, label: d.name }))]} value={modelId} onValueChange={setModelId} />
                  </div>
                  {itemType === 'part' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Part Type</label>
                      <Select options={[{ value: '', label: 'Select part type...' }, ...partTypeOptions]} value={partType} onValueChange={setPartType} />
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="SKU" value={sku} onChange={e => setSku(e.target.value)} error={skuConflict ? 'This SKU is already in use' : undefined} />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input label="Barcode / UPC" value={barcode} onChange={e => setBarcode(e.target.value)} error={barcodeConflict ? 'This Barcode is already in use' : undefined} />
                  </div>
                  <Button type="button" variant="outline" className="mb-0.5 h-10 px-3 shrink-0 border-gray-300" onClick={() => setBarcodeModalOpen(true)} title="Generate or Print Barcode" disabled={!product}>
                    <Barcode className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Variants */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  Variants
                  {allVariants.length > 0 && (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{allVariants.length}</span>
                  )}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Manage sizes, colours, storage options, etc.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddVariants(v => !v); setNewVariantRows([]) }}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add variants
              </button>
            </div>

            {/* Existing variants table */}
            {allVariants.length > 0 && (
              <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-900">Image</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-900">Variant</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-900">SKU</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-900">Barcode</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-900">Cost ({currSymbol})</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-900">Price ({currSymbol})</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-900">Stock</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {allVariants.map(row => (
                      <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${row.dirty ? 'bg-amber-50' : ''}`}>
                        <td className="px-3 py-2.5">
                          <ImageUpload
                            compact
                            size="lg"
                            value={row.imageUrl}
                            onChange={(url) => updateExistingVariant(row.id, 'imageUrl', url)}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                          {row.name}
                          {row.dirty && <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">unsaved</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="text" value={row.sku} onChange={e => updateExistingVariant(row.id, 'sku', e.target.value)} placeholder="Optional" className="w-28 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal" />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5 items-center">
                            <input type="text" value={row.barcode} onChange={e => updateExistingVariant(row.id, 'barcode', e.target.value)} placeholder="Optional" className="w-40 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal" />
                            <button type="button" onClick={() => updateExistingVariant(row.id, 'barcode', Math.floor(100000000000 + Math.random() * 900000000000).toString())} className="p-1.5 text-gray-400 hover:text-brand-teal transition-colors bg-gray-50 hover:bg-brand-teal/10 rounded-md shrink-0" title="Generate Barcode">
                              <RefreshCw className="h-3 w-3" />
                            </button>
                            {row.barcode && (
                              <button type="button" onClick={() => setVariantBarcodeTarget({ id: row.id, name: `${product?.name} - ${row.name}`, barcode: row.barcode })} className="p-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 transition-colors bg-indigo-50 rounded-md shrink-0" title="Print Barcode">
                                <Barcode className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" min="0" step="0.01" value={row.costPrice} onChange={e => updateExistingVariant(row.id, 'costPrice', e.target.value)} placeholder="0.00" className="w-24 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" min="0" step="0.01" value={row.sellingPrice} onChange={e => updateExistingVariant(row.id, 'sellingPrice', e.target.value)} placeholder="0.00" className="w-24 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" min="0" value={row.stock} onChange={e => updateExistingVariant(row.id, 'stock', e.target.value)} className="w-20 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal" />
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => deleteVariant(row.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {allVariants.length === 0 && !showAddVariants && (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center">
                <Layers className="mx-auto h-7 w-7 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No variants yet.</p>
                <button type="button" onClick={() => setShowAddVariants(true)} className="mt-1 text-sm text-blue-600 hover:underline">Add variants</button>
              </div>
            )}

            {/* Add more variants panel */}
            {showAddVariants && (
              <div className="mt-3 space-y-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Define Attributes</p>
                  {attrDefs.map((attr, idx) => (
                    <div key={attr.id} className="flex items-center gap-2">
                      <div className="w-36 shrink-0">
                        <input
                          type="text"
                          placeholder={`Attribute ${idx + 1}`}
                          value={attr.name}
                          onChange={e => updateAttr(attr.id, 'name', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Values, comma-separated (e.g. Black, White, Silver)"
                          value={attr.valuesRaw}
                          onChange={e => updateAttr(attr.id, 'valuesRaw', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button type="button" onClick={() => removeAttr(attr.id)} disabled={attrDefs.length === 1} className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-1">
                    <button type="button" onClick={() => setAttrDefs(p => [...p, { id: uid(), name: '', valuesRaw: '' }])} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                      <Plus className="h-3.5 w-3.5" /> Add attribute
                    </button>
                    <Button size="sm" variant="outline" onClick={generateNewVariants} className="ml-auto">
                      <RefreshCw className="h-3.5 w-3.5" /> Generate
                    </Button>
                  </div>
                </div>

                {newVariantRows.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-gray-400" /> {newVariantRows.length} new variant{newVariantRows.length !== 1 ? 's' : ''} — will be saved with the product
                      </p>
                      <button type="button" onClick={generateNewVariants} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> Regenerate
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Image</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Variant</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Barcode</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Cost ({currSymbol})</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Price ({currSymbol}) *</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Stock</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {newVariantRows.map(row => (
                            <tr key={row.key} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <ImageUpload
                                  compact
                                  size="lg"
                                  value={row.imageUrl}
                                  onChange={(url) => updateNewVariantRow(row.key, 'imageUrl', url)}
                                />
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{row.name}</td>
                              <td className="px-3 py-2">
                                <input type="text" value={row.sku} onChange={e => updateNewVariantRow(row.key, 'sku', e.target.value)} placeholder="Optional" className="w-24 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1 items-center">
                                  <input type="text" value={row.barcode} onChange={e => updateNewVariantRow(row.key, 'barcode', e.target.value)} placeholder="Optional" className="w-24 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  <button type="button" onClick={() => updateNewVariantRow(row.key, 'barcode', Math.floor(100000000000 + Math.random() * 900000000000).toString())} className="p-1 text-gray-400 hover:text-blue-500 transition-colors bg-gray-50 rounded shrink-0" title="Generate Barcode">
                                    <RefreshCw className="h-3 w-3" />
                                  </button>
                                  {row.barcode && (
                                    <button type="button" onClick={() => setVariantBarcodeTarget({ id: row.key, name: `${product?.name} - ${row.name}`, barcode: row.barcode })} className="p-1 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 transition-colors bg-indigo-50 rounded shrink-0" title="Print Barcode">
                                      <Barcode className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" min="0" step="0.01" value={row.costPrice} onChange={e => updateNewVariantRow(row.key, 'costPrice', e.target.value)} placeholder="0.00" className="w-20 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" min="0" step="0.01" value={row.sellingPrice} onChange={e => updateNewVariantRow(row.key, 'sellingPrice', e.target.value)} placeholder="0.00" className={`w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${!row.sellingPrice ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" min="0" value={row.stock} onChange={e => updateNewVariantRow(row.key, 'stock', e.target.value)} className="w-16 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </td>
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => setNewVariantRows(p => p.filter(r => r.key !== row.key))} className="text-gray-400 hover:text-red-500">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Pricing */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">
                {(allVariants.length > 0 || newVariantRows.length > 0) ? 'Base Pricing' : 'Pricing'}
              </h2>
              {(allVariants.length > 0 || newVariantRows.length > 0) && (
                <p className="text-xs text-gray-500 mt-0.5">Used as default when adding new variants.</p>
              )}
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label={`Cost Price (${currSymbol})`} type="number" step="0.01" min="0" placeholder="0.00" value={costPrice} onChange={e => setCostPrice(e.target.value)} />
                <Input label={`Selling Price (${currSymbol})`} type="number" step="0.01" min="0" placeholder="0.00" required value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} />
              </div>
              {hasMargin && (
                <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-2.5 flex items-center gap-4 text-sm">
                  <span className="text-gray-600">Margin:</span>
                  <span className="font-semibold text-green-700">{Math.round(((sell - cost) / sell) * 100)}%</span>
                  <span className="text-gray-500">({formatCurrency(sell - cost)} profit)</span>
                </div>
              )}
            </div>
          </section>

          {/* Stock */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Stock</h2>
            </div>
            <div className="space-y-4">
              {allVariants.length === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Quantity" type="number" min="0" value={onHand} onChange={e => setOnHand(e.target.value)} />
                  <Input label="Low Stock Alert" type="number" min="0" value={lowStockAlert} onChange={e => setLowStockAlert(e.target.value)} />
                </div>
              )}
              {allVariants.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Low Stock Alert" type="number" min="0" value={lowStockAlert} onChange={e => setLowStockAlert(e.target.value)} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Location</label>
                <Select
                  options={[
                    { value: '', label: 'Select location...' },
                    { value: 'warehouse', label: 'Warehouse (Main Stock)' },
                    ...branches.map(b => ({ value: b.name, label: b.name + (b.is_main ? ' (Main Branch)' : '') })),
                  ]}
                  value={physicalLocation}
                  onValueChange={setPhysicalLocation}
                />
              </div>
              {itemType === 'part' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier (optional)</label>
                  <Select options={[{ value: '', label: 'Select Supplier...' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} value={supplierId} onValueChange={setSupplierId} />
                </div>
              )}
            </div>
          </section>

          {/* Branch Availability */}
          {branchAvailability.length > 1 && (
            <section>
              <div className="mb-4 border-b border-gray-200 pb-2">
                <h2 className="text-base font-semibold text-gray-900">Branch Availability</h2>
                <p className="text-xs text-gray-500 mt-0.5">Control which branches can see and sell this {itemType} in their inventory and POS.</p>
              </div>
              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {branchAvailability.map((b) => (
                  <div key={b.branch_id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                        <Store className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {b.name}
                          {b.is_main && <span className="ml-1.5 text-[10px] uppercase tracking-wide font-semibold text-brand-teal">Main</span>}
                        </p>
                        <p className="text-xs text-gray-400">{b.is_enabled ? 'Enabled — visible in inventory & POS' : 'Disabled — hidden from this branch'}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input type="checkbox" className="sr-only peer" checked={b.is_enabled} disabled={togglingBranch === b.branch_id} onChange={() => toggleBranchAvailability(b.branch_id, b.is_enabled)} />
                      <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-teal peer-checked:after:translate-x-full peer-disabled:opacity-50" />
                    </label>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pricing Options */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Pricing Options</h2>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Commission</p>
                    <p className="text-xs text-gray-500">Enable employee commission for this {itemType}</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="sr-only peer" checked={commissionEnabled} onChange={e => setCommissionEnabled(e.target.checked)} />
                    <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full" />
                  </label>
                </div>
                {commissionEnabled && (
                  <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Commission Type</label>
                      <Select options={[{ value: 'percentage', label: 'Percentage (%)' }, { value: 'fixed', label: `Fixed Amount (${currSymbol})` }]} value={commissionType} onValueChange={setCommissionType} />
                    </div>
                    <Input label={commissionType === 'percentage' ? 'Rate (%)' : `Amount (${currSymbol})`} type="number" step="0.01" min="0" placeholder="0" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Loyalty Points</p>
                  <p className="text-xs text-gray-500">Earn / redeem loyalty points on this {itemType}</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" className="sr-only peer" checked={loyaltyEnabled} onChange={e => setLoyaltyEnabled(e.target.checked)} />
                  <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full" />
                </label>
              </div>
            </div>
          </section>

          {/* Bottom save */}
          <div className="flex items-center justify-end gap-3 py-6 border-t border-gray-200">
            <Link href="/inventory"><Button variant="outline">Cancel</Button></Link>
            <Button onClick={handleSave} loading={saving} disabled={skuConflict || barcodeConflict}>
              <Save className="h-4 w-4" /> Save Changes
            </Button>
          </div>
        </div>
      </main>

      {/* Delete product confirm */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Delete Product" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete <strong>{product.name}</strong>?</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>


      <Modal open={addingDevice} onClose={() => { setAddingDevice(false); setNewDeviceName('') }} title="Add Model" size="sm">
        <div className="space-y-4">
          {!brandId ? (
            <p className="text-sm text-amber-600">Please select a brand first.</p>
          ) : (
            <>
              <Input label="Model Name" placeholder="e.g. iPhone 15 Pro, Galaxy S24" required value={newDeviceName} onChange={e => setNewDeviceName(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddDevice())} />
              <p className="text-xs text-gray-500">This model will be linked to the selected brand.</p>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setAddingDevice(false); setNewDeviceName('') }}>Cancel</Button>
            {brandId && <Button onClick={handleAddDevice}>Add</Button>}
          </div>
        </div>
      </Modal>

      {product && barcodeModalOpen && (
        <BarcodeModal
          product={{ id: product.id, name: product.name, barcode: product.barcode }}
          onClose={() => {
            setBarcodeModalOpen(false)
            qc.invalidateQueries({ queryKey: ['inv-product', id, activeBranch?.id] })
          }}
        />
      )}
      {variantBarcodeTarget && (
        <BarcodeModal
          product={{ id: variantBarcodeTarget.id, name: variantBarcodeTarget.name, barcode: variantBarcodeTarget.barcode }}
          onClose={() => setVariantBarcodeTarget(null)}
        />
      )}
    </div>
  )
}
