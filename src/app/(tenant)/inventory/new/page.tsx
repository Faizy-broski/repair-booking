'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Plus, Lock, Trash2, RefreshCw, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CreatableCombobox } from '@/components/ui/creatable-combobox'
import { ImageUpload } from '@/components/ui/image-upload'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import { queryClient } from '@/lib/query-client'
import { formatCurrency, getCurrencySymbol } from '@/lib/utils'
import Link from 'next/link'

interface Category { id: string; name: string }
interface Brand { id: string; name: string; category_id?: string | null }
interface Supplier { id: string; name: string }
interface ServiceDevice { id: string; name: string; brand_id?: string | null }
interface PartType { id: string; name: string; device_id?: string | null }

interface AttrDef { id: string; name: string; valuesRaw: string }
interface SavedAttr { id: string; name: string; product_attribute_values: { value: string }[] }
interface VariantRow {
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

export default function NewInventoryPage() {
  const { activeBranch, branches, verticalTemplateSlug } = useAuthStore()
  const currSymbol = getCurrencySymbol()
  // Simplified, repair-free product form is specific to the retail-store
  // vertical template — independent of any module's enabled/disabled state.
  const hasRepairs = verticalTemplateSlug !== 'retail-store'
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saveAndNew, setSaveAndNew] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Lookup data ────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([])
  const [allBrands, setAllBrands] = useState<Brand[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [allDevices, setAllDevices] = useState<ServiceDevice[]>([])
  const [allPartTypes, setAllPartTypes] = useState<PartType[]>([])

  // ── Form fields ────────────────────────────────────────────────────────────
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
  const [initialStock, setInitialStock] = useState('0')
  const [lowStockAlert, setLowStockAlert] = useState('5')
  const [supplierId, setSupplierId] = useState('')
  const [physicalLocation, setPhysicalLocation] = useState('')
  const [isTradeIn, setIsTradeIn] = useState(false)
  const [commissionEnabled, setCommissionEnabled] = useState(false)
  const [commissionType, setCommissionType] = useState('percentage')
  const [commissionRate, setCommissionRate] = useState('')
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true)
  const [skuConflict, setSkuConflict] = useState(false)
  const [barcodeConflict, setBarcodeConflict] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  // ── Variants ───────────────────────────────────────────────────────────────
  const [hasVariants, setHasVariants] = useState(!hasRepairs)
  const [attrDefs, setAttrDefs] = useState<AttrDef[]>([{ id: uid(), name: '', valuesRaw: '' }])
  const [variantRows, setVariantRows] = useState<VariantRow[]>([])
  const [savedAttributes, setSavedAttributes] = useState<SavedAttr[]>([])
  const [categoryAttributes, setCategoryAttributes] = useState<SavedAttr[]>([])

  // Sync variants toggle if verticalTemplateSlug loads after initial render
  useEffect(() => { setHasVariants(!hasRepairs) }, [hasRepairs])

  // ── Load lookups ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(j => setCategories(j.data ?? [])).catch(() => { })
    fetch('/api/brands').then(r => r.json()).then(j => setAllBrands(j.data ?? [])).catch(() => { })
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? [])).catch(() => { })
    fetch('/api/services/devices').then(r => r.json()).then(j => setAllDevices(j.data ?? [])).catch(() => { })
    fetch('/api/part-types').then(r => r.json()).then(j => setAllPartTypes(j.data ?? [])).catch(() => { })
    fetch('/api/product-attributes').then(r => r.json()).then(j => setSavedAttributes(j.data ?? [])).catch(() => { })
  }, [])

  // ── Fetch category-linked attributes when category changes ─────────────────
  useEffect(() => {
    if (!categoryId) { setCategoryAttributes([]); return }
    fetch(`/api/categories/${categoryId}/attributes`)
      .then(r => r.json())
      .then(j => {
        const ids: string[] = (j.data ?? []).map((a: any) => a.id)
        // Enrich with values from the already-loaded savedAttributes list
        const enriched = savedAttributes.filter(a => ids.includes(a.id))
        setCategoryAttributes(enriched)
      })
      .catch(() => setCategoryAttributes([]))
  }, [categoryId, savedAttributes])

  // ── Uniqueness check ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!sku && !barcode) { setSkuConflict(false); setBarcodeConflict(false); return }
    const timer = setTimeout(async () => {
      setCheckingAvailability(true)
      try {
        const params = new URLSearchParams()
        if (sku) params.set('sku', sku)
        if (barcode) params.set('barcode', barcode)
        const res = await fetch(`/api/products/check-availability?${params.toString()}`)
        const json = await res.json()
        if (json.data) { setSkuConflict(json.data.skuExists); setBarcodeConflict(json.data.barcodeExists) }
      } finally { setCheckingAvailability(false) }
    }, 500)
    return () => clearTimeout(timer)
  }, [sku, barcode])

  // ── Filtered lists ─────────────────────────────────────────────────────────
  const brands = categoryId ? allBrands.filter(b => b.category_id === categoryId) : allBrands
  const devices = brandId ? allDevices.filter(d => d.brand_id === brandId) : allDevices
  const partTypesForModel = modelId ? allPartTypes.filter(p => p.device_id === modelId) : allPartTypes

  // ── Inline creators ────────────────────────────────────────────────────────
  async function createCategory(inputName: string) {
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: inputName }) })
    if (!res.ok) return
    const created: Category = (await res.json()).data
    setCategories(p => [...p, created]); setCategoryId(created.id); setBrandId(''); setModelId(''); setPartType('')
  }

  async function editCategory(id: string, name: string) {
    const res = await fetch(`/api/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!res.ok) { toast.error('Failed to rename category'); return }
    const updated: Category = (await res.json()).data
    setCategories(p => p.map(c => c.id === id ? { ...c, name: updated.name } : c))
    toast.success('Category renamed')
  }

  async function deleteCategory(id: string) {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete category — it may be in use'); return }
    setCategories(p => p.filter(c => c.id !== id))
    if (categoryId === id) { setCategoryId(''); setBrandId(''); setModelId(''); setPartType('') }
    toast.success('Category deleted')
  }

  async function createBrand(inputName: string) {
    const res = await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: inputName, category_id: categoryId || null }) })
    if (!res.ok) return
    const created: Brand = (await res.json()).data
    setAllBrands(p => [...p, created]); setBrandId(created.id); setModelId('')
  }

  async function editBrand(id: string, name: string) {
    const res = await fetch(`/api/brands/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!res.ok) { toast.error('Failed to rename brand'); return }
    const updated: Brand = (await res.json()).data
    setAllBrands(p => p.map(b => b.id === id ? { ...b, name: updated.name } : b))
    toast.success('Brand renamed')
  }

  async function deleteBrand(id: string) {
    const res = await fetch(`/api/brands/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete brand — it may be in use'); return }
    setAllBrands(p => p.filter(b => b.id !== id))
    if (brandId === id) { setBrandId(''); setModelId(''); setPartType('') }
    toast.success('Brand deleted')
  }

  async function createModel(inputName: string) {
    const selectedBrand = allBrands.find(b => b.id === brandId)
    if (!selectedBrand) return
    const mfJson = await fetch('/api/services/manufacturers').then(r => r.json())
    let mf = (mfJson.data ?? []).find((m: { name: string }) => m.name === selectedBrand.name)
    if (!mf) {
      const cr = await fetch('/api/services/manufacturers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: selectedBrand.name }) })
      if (!cr.ok) return
      mf = (await cr.json()).data
    }
    const res = await fetch('/api/services/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: inputName, manufacturer_id: mf.id, brand_id: brandId || null }) })
    if (!res.ok) return
    const created: ServiceDevice = (await res.json()).data
    setAllDevices(p => [...p, created]); setModelId(created.id)
  }

  async function editModel(id: string, name: string) {
    const res = await fetch(`/api/services/devices/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!res.ok) { toast.error('Failed to rename model'); return }
    const updated: ServiceDevice = (await res.json()).data
    setAllDevices(p => p.map(d => d.id === id ? { ...d, name: updated.name } : d))
    toast.success('Model renamed')
  }

  async function deleteModel(id: string) {
    const res = await fetch(`/api/services/devices/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete model — it may be in use'); return }
    setAllDevices(p => p.filter(d => d.id !== id))
    if (modelId === id) { setModelId(''); setPartType('') }
    toast.success('Model deleted')
  }

  async function createSupplier(inputName: string) {
    const res = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: inputName }) })
    if (!res.ok) return
    const created: Supplier = (await res.json()).data
    setSuppliers(p => [...p, created]); setSupplierId(created.id)
  }

  async function editSupplier(id: string, name: string) {
    const res = await fetch(`/api/suppliers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!res.ok) { toast.error('Failed to rename supplier'); return }
    const updated: Supplier = (await res.json()).data
    setSuppliers(p => p.map(s => s.id === id ? { ...s, name: updated.name } : s))
    toast.success('Supplier renamed')
  }

  async function deleteSupplier(id: string) {
    const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete supplier — it may be in use'); return }
    setSuppliers(p => p.filter(s => s.id !== id))
    if (supplierId === id) setSupplierId('')
    toast.success('Supplier deleted')
  }

  async function createPartType(inputName: string) {
    const res = await fetch('/api/part-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: inputName, device_id: modelId || null }) })
    if (!res.ok) return
    const created: PartType = (await res.json()).data
    setAllPartTypes(p => [...p, created]); setPartType(created.name)
  }

  async function editPartType(oldName: string, newName: string) {
    const pt = allPartTypes.find(p => p.name === oldName)
    if (!pt) return
    const res = await fetch(`/api/part-types/${pt.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) })
    if (!res.ok) { toast.error('Failed to rename part type'); return }
    setAllPartTypes(p => p.map(t => t.id === pt.id ? { ...t, name: newName } : t))
    if (partType === oldName) setPartType(newName)
    toast.success('Part type renamed')
  }

  async function deletePartType(name: string) {
    const pt = allPartTypes.find(p => p.name === name)
    if (!pt) return
    const res = await fetch(`/api/part-types/${pt.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete part type — it may be in use'); return }
    setAllPartTypes(p => p.filter(t => t.id !== pt.id))
    if (partType === name) setPartType('')
    toast.success('Part type deleted')
  }

  // ── Variant helpers ────────────────────────────────────────────────────────
  function updateAttr(id: string, field: 'name' | 'valuesRaw', val: string) {
    setAttrDefs(prev => prev.map(a => a.id === id ? { ...a, [field]: val } : a))
  }

  function removeAttr(id: string) {
    setAttrDefs(prev => prev.length > 1 ? prev.filter(a => a.id !== id) : prev)
  }

  function generateVariants() {
    const valid = attrDefs.filter(a => a.name.trim() && a.valuesRaw.trim())
    if (!valid.length) { toast.error('Add at least one attribute with values.'); return }
    const parsed = valid.map(a => ({
      name: a.name.trim(),
      values: a.valuesRaw.split(',').map(v => v.trim()).filter(Boolean),
    }))
    const combos = cartesian(parsed)
    setVariantRows(combos.map((attrs, i) => ({
      key: `${uid()}-${i}`,
      name: Object.values(attrs).join(' / '),
      attributes: attrs,
      sku: '', barcode: '', imageUrl: '',
      costPrice, sellingPrice,
      stock: '0',
    })))
    toast.success(`${combos.length} variant${combos.length !== 1 ? 's' : ''} generated.`)
  }

  function updateVariantRow(key: string, field: keyof Omit<VariantRow, 'key' | 'name' | 'attributes'>, val: string | number) {
    setVariantRows(prev => prev.map(r => r.key === key ? { ...r, [field]: val } : r))
  }

  function resetForm() {
    setName(''); setCategoryId(''); setBrandId(''); setModelId(''); setSku(''); setBarcode('')
    setImageUrl(''); setPartType(''); setCostPrice(''); setSellingPrice('')
    setInitialStock('0'); setLowStockAlert('5'); setSupplierId(''); setPhysicalLocation('')
    setCommissionEnabled(false); setCommissionType('percentage'); setCommissionRate(''); setLoyaltyEnabled(true)
    setHasVariants(false); setAttrDefs([{ id: uid(), name: '', valuesRaw: '' }]); setVariantRows([])
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave(andNew = false) {
    if (!name.trim()) { toast.error(`Please enter a ${itemType === 'part' ? 'part' : 'product'} name.`); return }
    if (!categoryId) { toast.error(`Please select a ${hasRepairs ? 'Device Type' : 'Category'}.`); return }
    if (!brandId) { toast.error('Please select a Brand.'); return }
    if (itemType === 'part' && !partType) { toast.error('Please select a Part Type.'); return }
    if (!hasVariants && !sellingPrice) { toast.error('Please enter a selling price.'); return }
    if (hasVariants && variantRows.length === 0) { toast.error('Generate variants before saving.'); return }
    if (hasVariants && variantRows.some(v => !v.sellingPrice)) { toast.error('All variants must have a selling price.'); return }

    setSaving(true); setSaveAndNew(andNew); setSaveError(null)

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(), item_type: itemType,
        category_id: categoryId || null, brand_id: brandId || null, model_id: modelId || null,
        sku: sku || null, barcode: barcode || null, image_url: imageUrl || null,
        is_service: false, part_type: itemType === 'part' ? (partType || null) : null,
        has_variants: hasVariants,
        cost_price: parseFloat(costPrice) || 0,
        selling_price: parseFloat(sellingPrice) || 0,
        supplier_id: supplierId || null, track_inventory: true,
        low_stock_alert: parseInt(lowStockAlert) || 0,
        initial_stock: hasVariants ? 0 : (parseInt(initialStock) || 0),
        branch_id: activeBranch?.id ?? null, physical_location: physicalLocation || null,
        is_trade_in: isTradeIn,
        commission_enabled: commissionEnabled, commission_type: commissionType,
        commission_rate: parseFloat(commissionRate) || 0, loyalty_enabled: loyaltyEnabled,
      }),
    })

    if (res.ok) {
      const json = await res.json()
      const newProduct = json.data ?? json

      if (hasVariants && variantRows.length > 0 && newProduct?.id) {
        const varRes = await fetch(`/api/products/${newProduct.id}/variants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variants: variantRows.map(v => ({
              name: v.name, sku: v.sku || null, barcode: v.barcode || null,
              selling_price: parseFloat(v.sellingPrice) || 0,
              cost_price: parseFloat(v.costPrice) || 0,
              attributes: v.attributes,
              image_url: v.imageUrl || null,
            })),
          }),
        })
        if (!varRes.ok) {
          const vj = await varRes.json().catch(() => ({}))
          toast.warning(`Product saved but variants failed: ${vj?.message || 'Unknown error'}`)
        }
      }

      if (newProduct?.id) queryClient.setQueryData(['product', newProduct.id], newProduct)
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })

      if (andNew) {
        resetForm()
        toast.success('Saved! Add another.')
      } else {
        toast.success(`"${newProduct?.name}" added to inventory.`, {
          action: { label: 'View', onClick: () => router.push(`/inventory/${newProduct.id}`) },
        })
        router.push('/inventory')
      }
    } else {
      const j = await res.json().catch(() => ({}))
      const message = j?.message || j?.error?.message || 'Failed to save.'
      setSaveError(message); toast.error(message)
    }
    setSaving(false)
  }

  const cost = parseFloat(costPrice)
  const sell = parseFloat(sellingPrice)
  const hasMargin = !isNaN(cost) && !isNaN(sell) && cost > 0 && sell > 0
  const hasConflict = skuConflict || barcodeConflict

  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }))
  const brandOptions = brands.map(b => ({ value: b.id, label: b.name }))
  const deviceOptions = devices.map(d => ({ value: d.id, label: d.name }))
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const partTypeOptions = partTypesForModel.map(p => ({ value: p.name, label: p.name }))

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ChevronLeft className="h-4 w-4" /> Back to Inventory
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">Add New {itemType === 'part' ? 'Part' : 'Product'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave(true)} loading={saving && saveAndNew} disabled={hasConflict}>
            <Plus className="h-4 w-4" /> Save &amp; Add New
          </Button>
          <Button onClick={() => handleSave(false)} loading={saving && !saveAndNew} disabled={hasConflict}>
            <Save className="h-4 w-4" /> Save {itemType === 'part' ? 'Part' : 'Product'}
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 py-6 space-y-8">

          {/* Type Toggle — only relevant for repair-shop businesses (Part = spare part) */}
          {hasRepairs && (
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
          )}

          {/* Bought from Customer */}
          <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-lg border-2 px-4 py-3 transition-colors ${isTradeIn ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isTradeIn ? 'bg-purple-100' : 'bg-gray-100'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isTradeIn ? 'text-purple-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
              </div>
              <div>
                <p className={`text-sm font-semibold ${isTradeIn ? 'text-purple-800' : 'text-gray-900'}`}>Bought from Customer</p>
                <p className={`text-xs ${isTradeIn ? 'text-purple-600' : 'text-gray-500'}`}>Mark if this item was purchased directly from a customer</p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {isTradeIn && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">Active</span>}
              <input type="checkbox" className="sr-only" checked={isTradeIn} onChange={e => setIsTradeIn(e.target.checked)} />
              <div className={`relative h-5 w-9 rounded-full transition-colors ${isTradeIn ? 'bg-purple-600' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isTradeIn ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>
          </label>

          {/* Item Details */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">{itemType === 'part' ? 'Part' : 'Product'} Details</h2>
            </div>
            <div className="space-y-4">
              <ImageUpload label={itemType === 'part' ? 'Part image' : 'Product image'} value={imageUrl} onChange={setImageUrl} />
              <Input label="Name" placeholder={itemType === 'part' ? 'Part name' : 'Product name'} required value={name} onChange={e => setName(e.target.value)} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{hasRepairs ? 'Device Type' : 'Category'} <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                  <CreatableCombobox options={categoryOptions} value={categoryId} onChange={(id) => { setCategoryId(id); setBrandId(''); setModelId(''); setPartType('') }} onCreate={createCategory} onEdit={editCategory} onDelete={deleteCategory} placeholder="Select or type to create..." createLabel={hasRepairs ? 'Add device type' : 'Add category'} />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${!categoryId ? 'text-gray-400' : 'text-gray-700'}`}>Brand <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                  {categoryId ? (
                    <CreatableCombobox options={brandOptions} value={brandId} onChange={(id) => { setBrandId(id); setModelId(''); setPartType('') }} onCreate={createBrand} onEdit={editBrand} onDelete={deleteBrand} placeholder="Select or type to create..." createLabel="Add brand" />
                  ) : (
                    <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                      <Lock className="h-3.5 w-3.5 shrink-0" /> {hasRepairs ? 'Select device type first' : 'Select category first'}
                    </div>
                  )}
                </div>
              </div>

              {hasRepairs && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${!brandId ? 'text-gray-400' : 'text-gray-700'}`}>Model <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                    {brandId ? (
                      <CreatableCombobox options={deviceOptions} value={modelId} onChange={(id) => { setModelId(id); setPartType('') }} onCreate={createModel} onEdit={editModel} onDelete={deleteModel} placeholder="Select or type to create..." createLabel="Add model" />
                    ) : (
                      <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                        <Lock className="h-3.5 w-3.5 shrink-0" /> Select brand first
                      </div>
                    )}
                  </div>
                  {itemType === 'part' && (
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${!modelId ? 'text-gray-400' : 'text-gray-700'}`}>Part Type <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                      {modelId ? (
                        <CreatableCombobox options={partTypeOptions} value={partType} onChange={(v) => setPartType(v)} onCreate={createPartType} onEdit={editPartType} onDelete={deletePartType} placeholder="Select or type to create..." createLabel="Add part type" />
                      ) : (
                        <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                          <Lock className="h-3.5 w-3.5 shrink-0" /> Select model first
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="SKU" placeholder="Optional" value={sku} onChange={e => setSku(e.target.value)} error={skuConflict ? 'This SKU is already in use' : undefined} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Barcode / UPC</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Optional" value={barcode} onChange={e => setBarcode(e.target.value)} className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal ${barcodeConflict ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                    <button type="button" title="Generate Barcode" onClick={() => setBarcode(Math.floor(100000000000 + Math.random() * 900000000000).toString())} className="shrink-0 rounded-lg border border-brand-teal bg-brand-teal/10 px-2.5 py-2 text-brand-teal hover:bg-brand-teal hover:text-white transition-colors">
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                  {barcodeConflict && <p className="mt-1 text-xs text-red-500">This Barcode is already in use</p>}
                </div>
              </div>
            </div>
          </section>

          {/* Variants */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Variants</h2>
                <p className="text-xs text-gray-500 mt-0.5">Optional — define sizes, colours, storage options, grades, etc.</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center gap-2">
                <span className={`text-sm font-medium ${hasVariants ? 'text-blue-600' : 'text-gray-400'}`}>{hasVariants ? 'Enabled' : 'Disabled'}</span>
                <input type="checkbox" className="sr-only peer" checked={hasVariants} onChange={e => { setHasVariants(e.target.checked); if (!e.target.checked) setVariantRows([]) }} />
                <div className="relative peer h-6 w-11 rounded-full bg-gray-300 transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-5" />
              </label>
            </div>

            {hasVariants && (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Define Attributes</p>
                  {(() => {
                    const attrsToShow = categoryId && categoryAttributes.length > 0
                      ? categoryAttributes
                      : categoryId && categoryAttributes.length === 0
                        ? []
                        : savedAttributes
                    return attrsToShow.length > 0 ? (
                      <div className="space-y-1.5 pb-1">
                        {categoryId && categoryAttributes.length > 0 && (
                          <p className="text-xs text-indigo-600 font-medium">Attributes linked to this category:</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {attrsToShow.map(attr => (
                            <button
                              key={attr.id}
                              type="button"
                              onClick={() => {
                                if (attrDefs.some(a => a.name.toLowerCase() === attr.name.toLowerCase())) return
                                const valuesRaw = attr.product_attribute_values.map(v => v.value).join(', ')
                                setAttrDefs(prev => {
                                  const hasEmptyFirst = prev.length === 1 && !prev[0].name.trim()
                                  return [...(hasEmptyFirst ? [] : prev), { id: uid(), name: attr.name, valuesRaw }]
                                })
                              }}
                              className={`rounded-full border border-dashed px-2.5 py-0.5 text-xs transition-colors ${
                                categoryId && categoryAttributes.length > 0
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:border-indigo-500 hover:bg-indigo-100'
                                  : 'border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-500 hover:bg-blue-100'
                              }`}
                            >
                              + {attr.name}
                              {attr.product_attribute_values.length > 0 && (
                                <span className={`ml-1 ${categoryId && categoryAttributes.length > 0 ? 'text-indigo-400' : 'text-blue-400'}`}>
                                  ({attr.product_attribute_values.slice(0, 3).map(v => v.value).join(', ')}{attr.product_attribute_values.length > 3 ? '…' : ''})
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : categoryId ? (
                      <p className="text-xs text-gray-400 italic">No attributes linked to this category yet. <a href="/inventory/attributes" className="text-brand-teal underline">Add some in Attributes.</a></p>
                    ) : null
                  })()}
                  {attrDefs.map((attr, idx) => (
                    <div key={attr.id} className="flex items-center gap-2">
                      <div className="w-36 shrink-0">
                        <input type="text" placeholder={`Attribute ${idx + 1}`} value={attr.name} onChange={e => updateAttr(attr.id, 'name', e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="flex-1">
                        <input type="text" placeholder="Values, comma-separated (e.g. Black, White, Silver)" value={attr.valuesRaw} onChange={e => updateAttr(attr.id, 'valuesRaw', e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <button type="button" onClick={() => removeAttr(attr.id)} disabled={attrDefs.length === 1} className="rounded p-1.5 bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-1">
                    <button type="button" onClick={() => setAttrDefs(p => [...p, { id: uid(), name: '', valuesRaw: '' }])} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                      <Plus className="h-3.5 w-3.5" /> Add attribute
                    </button>
                    <Button size="sm" variant="outline" onClick={generateVariants} className="ml-auto">
                      <RefreshCw className="h-3.5 w-3.5" /> Generate Variants
                    </Button>
                  </div>
                </div>

                {variantRows.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-gray-400" /> {variantRows.length} variant{variantRows.length !== 1 ? 's' : ''}
                      </p>
                      <button type="button" onClick={generateVariants} className="flex items-center gap-1 rounded-lg border border-brand-teal bg-brand-teal/10 px-2.5 py-1 text-xs font-medium text-brand-teal hover:bg-brand-teal hover:text-white transition-colors">
                        <RefreshCw className="h-3 w-3" /> Regenerate
                      </button>
                    </div>
                    <div className="rounded-lg border border-gray-200">
                      <table className="w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Image</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Variant</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">SKU</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Barcode</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Cost ({currSymbol})</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Price ({currSymbol}) *</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Stock</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {variantRows.map(row => (
                            <tr key={row.key} className="hover:bg-gray-50/60 align-middle">
                              <td className="px-4 py-3">
                                {row.imageUrl ? (
                                  <div className="relative w-12 h-12 group">
                                    <img src={row.imageUrl} alt={row.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                                    <button type="button" onClick={() => updateVariantRow(row.key, 'imageUrl', '')} className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px]">×</button>
                                  </div>
                                ) : (
                                  <label className="flex w-12 h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:border-brand-teal hover:bg-brand-teal/5 transition-colors">
                                    <Plus className="h-5 w-5 text-gray-400" />
                                    <input type="file" accept="image/*" className="sr-only" onChange={async e => {
                                      const file = e.target.files?.[0]
                                      if (!file) return
                                      const fd = new FormData(); fd.append('file', file)
                                      const res = await fetch('/api/upload/image', { method: 'POST', body: fd })
                                      if (res.ok) { const json = await res.json(); updateVariantRow(row.key, 'imageUrl', json.data?.url ?? json.url ?? '') }
                                    }} />
                                  </label>
                                )}
                              </td>
                              <td className="px-4 py-3 font-semibold text-sm text-gray-800 whitespace-nowrap">{row.name}</td>
                              <td className="px-4 py-3"><input type="text" value={row.sku} onChange={e => updateVariantRow(row.key, 'sku', e.target.value)} placeholder="Optional" className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" /></td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <input type="text" value={row.barcode} onChange={e => updateVariantRow(row.key, 'barcode', e.target.value)} placeholder="Optional" className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" />
                                  <button type="button" title="Generate" onClick={() => updateVariantRow(row.key, 'barcode', Math.floor(100000000000 + Math.random() * 900000000000).toString())} className="p-2 text-brand-teal bg-brand-teal/10 hover:bg-brand-teal hover:text-white transition-colors rounded-lg shrink-0">
                                    <RefreshCw className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-3"><input type="number" min="0" step="0.01" value={row.costPrice} onChange={e => updateVariantRow(row.key, 'costPrice', e.target.value)} placeholder="0.00" className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" /></td>
                              <td className="px-4 py-3"><input type="number" min="0" step="0.01" value={row.sellingPrice} onChange={e => updateVariantRow(row.key, 'sellingPrice', e.target.value)} placeholder="0.00" className={`w-24 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal ${!row.sellingPrice ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} /></td>
                              <td className="px-4 py-3"><input type="number" min="0" value={row.stock} onChange={e => updateVariantRow(row.key, 'stock', e.target.value)} className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal" /></td>
                              <td className="px-4 py-3"><button type="button" onClick={() => setVariantRows(p => p.filter(r => r.key !== row.key))} className="rounded-lg p-2 bg-red-500 text-white hover:bg-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button></td>
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
              <h2 className="text-base font-semibold text-gray-900">{hasVariants ? 'Default Pricing' : 'Pricing'}</h2>
              {hasVariants && <p className="text-xs text-gray-500 mt-0.5">Pre-filled into all generated variants — override each one above.</p>}
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label={`Cost Price (${currSymbol})`} type="number" step="0.01" min="0" placeholder="0.00" value={costPrice} onChange={e => setCostPrice(e.target.value)} />
                <Input label={`Selling Price (${currSymbol})`} type="number" step="0.01" min="0" placeholder="0.00" required={!hasVariants} value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!hasVariants && (
                  <Input label="Opening Stock" type="number" min="0" value={initialStock} onChange={e => setInitialStock(e.target.value)} />
                )}
                <Input label="Low Stock Alert" type="number" min="0" value={lowStockAlert} onChange={e => setLowStockAlert(e.target.value)} />
              </div>
              {hasVariants && (
                <p className="text-xs text-gray-500 rounded-lg border border-dashed border-gray-200 px-3 py-2">Opening stock is set per-variant in the table above.</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Location</label>
                <Select options={[{ value: '', label: 'Select location...' }, { value: 'warehouse', label: 'Warehouse (Main Stock)' }, ...branches.map(b => ({ value: b.name, label: b.name + (b.is_main ? ' (Main Branch)' : '') }))]} value={physicalLocation} onValueChange={setPhysicalLocation} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                <CreatableCombobox options={supplierOptions} value={supplierId} onChange={(v) => setSupplierId(v)} onCreate={createSupplier} onEdit={editSupplier} onDelete={deleteSupplier} placeholder="Select or type to create..." createLabel="Add supplier" />
              </div>
            </div>
          </section>

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

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 py-6 border-t border-gray-200">
            <Link href="/inventory" className="w-full sm:w-auto"><Button variant="outline" className="w-full">Cancel</Button></Link>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => handleSave(true)} loading={saving && saveAndNew} disabled={hasConflict}>
              <Plus className="h-4 w-4" /> Save &amp; New
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => handleSave(false)} loading={saving && !saveAndNew} disabled={hasConflict}>
              <Save className="h-4 w-4" /> Save
            </Button>
          </div>

        </div>
      </main>
    </div>
  )
}
