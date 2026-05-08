'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CreatableCombobox } from '@/components/ui/creatable-combobox'
import { ImageUpload } from '@/components/ui/image-upload'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import { queryClient } from '@/lib/query-client'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

interface Category { id: string; name: string }
interface Brand { id: string; name: string; category_id?: string | null }
interface Supplier { id: string; name: string }
interface ServiceDevice { id: string; name: string; brand_id?: string | null }
interface PartType { id: string; name: string; device_id?: string | null }

type ItemType = 'product' | 'part'

export default function NewProductPage() {
  const { activeBranch, branches } = useAuthStore()
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

  const [commissionEnabled, setCommissionEnabled] = useState(false)
  const [commissionType, setCommissionType] = useState('percentage')
  const [commissionRate, setCommissionRate] = useState('')
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true)

  const [skuConflict, setSkuConflict] = useState(false)
  const [barcodeConflict, setBarcodeConflict] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  // ── Load lookups ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(j => setCategories(j.data ?? [])).catch(() => { })
    fetch('/api/brands').then(r => r.json()).then(j => setAllBrands(j.data ?? [])).catch(() => { })
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? [])).catch(() => { })
    fetch('/api/services/devices').then(r => r.json()).then(j => setAllDevices(j.data ?? [])).catch(() => { })
    fetch('/api/part-types').then(r => r.json()).then(j => setAllPartTypes(j.data ?? [])).catch(() => { })
  }, [])

  // ── Uniqueness Check ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!sku && !barcode) {
      setSkuConflict(false)
      setBarcodeConflict(false)
      return
    }

    const timer = setTimeout(async () => {
      setCheckingAvailability(true)
      try {
        const params = new URLSearchParams()
        if (sku) params.set('sku', sku)
        if (barcode) params.set('barcode', barcode)
        
        const res = await fetch(`/api/products/check-availability?${params.toString()}`)
        const json = await res.json()
        if (json.data) {
          setSkuConflict(json.data.skuExists)
          setBarcodeConflict(json.data.barcodeExists)
        }
      } catch (err) {
        console.error('Failed to check availability:', err)
      } finally {
        setCheckingAvailability(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [sku, barcode])

  // ── Filtered lists based on hierarchy ─────────────────────────────────────
  const brands = categoryId ? allBrands.filter(b => b.category_id === categoryId) : allBrands
  const devices = brandId ? allDevices.filter(d => d.brand_id === brandId) : allDevices
  const partTypesForModel = modelId ? allPartTypes.filter(p => p.device_id === modelId) : allPartTypes

  // ── Inline creators ────────────────────────────────────────────────────────

  async function createCategory(inputName: string) {
    const res = await fetch('/api/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: inputName }),
    })
    if (!res.ok) return
    const json = await res.json()
    const created: Category = json.data
    setCategories(prev => [...prev, created])
    setCategoryId(created.id)
    setBrandId(''); setModelId(''); setPartType('')
  }

  async function createBrand(inputName: string) {
    const res = await fetch('/api/brands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: inputName, category_id: categoryId || null }),
    })
    if (!res.ok) return
    const json = await res.json()
    const created: Brand = json.data
    setAllBrands(prev => [...prev, created])
    setBrandId(created.id)
    setModelId('')
  }

  async function createModel(inputName: string) {
    // Ensure a manufacturer exists (maps brand → manufacturer)
    const selectedBrand = allBrands.find(b => b.id === brandId)
    if (!selectedBrand) return

    const mfRes = await fetch('/api/services/manufacturers')
    const mfJson = await mfRes.json()
    let manufacturer = (mfJson.data ?? []).find((m: { name: string }) => m.name === selectedBrand.name)

    if (!manufacturer) {
      const createRes = await fetch('/api/services/manufacturers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedBrand.name }),
      })
      if (!createRes.ok) return
      manufacturer = (await createRes.json()).data
    }

    const res = await fetch('/api/services/devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: inputName, manufacturer_id: manufacturer.id, brand_id: brandId || null }),
    })
    if (!res.ok) return
    const json = await res.json()
    const created: ServiceDevice = json.data
    setAllDevices(prev => [...prev, created])
    setModelId(created.id)
  }

  async function createSupplier(inputName: string) {
    const res = await fetch('/api/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: inputName }),
    })
    if (!res.ok) return
    const json = await res.json()
    const created: Supplier = json.data
    setSuppliers(prev => [...prev, created])
    setSupplierId(created.id)
  }

  async function createPartType(inputName: string) {
    const res = await fetch('/api/part-types', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: inputName, device_id: modelId || null }),
    })
    if (!res.ok) return
    const json = await res.json()
    const created: PartType = json.data
    setAllPartTypes(prev => [...prev, created])
    setPartType(created.name)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave(andNew = false) {
    if (!name.trim()) {
      toast.error(`Please enter a ${itemType === 'part' ? 'part' : 'product'} name.`)
      return
    }
    if (!sellingPrice) {
      toast.error('Please enter a selling price.')
      return
    }

    setSaving(true)
    setSaveAndNew(andNew)
    setSaveError(null)

    const payload: Record<string, unknown> = {
      name: name.trim(),
      item_type: itemType,
      category_id: categoryId || null,
      brand_id: brandId || null,
      model_id: modelId || null,
      sku: sku || null,
      barcode: barcode || null,
      image_url: imageUrl || null,
      is_service: false,
      part_type: itemType === 'part' ? (partType || null) : null,
      cost_price: parseFloat(costPrice) || 0,
      selling_price: parseFloat(sellingPrice) || 0,
      supplier_id: supplierId || null,
      track_inventory: true,
      low_stock_alert: parseInt(lowStockAlert) || 0,
      initial_stock: parseInt(initialStock) || 0,
      branch_id: activeBranch?.id ?? null,
      physical_location: physicalLocation || null,
      commission_enabled: commissionEnabled,
      commission_type: commissionType,
      commission_rate: parseFloat(commissionRate) || 0,
      loyalty_enabled: loyaltyEnabled,
    }

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const json = await res.json()
      const newProduct = json.data ?? json
      const productId = newProduct?.id ?? json.id
      if (newProduct?.id) queryClient.setQueryData(['product', newProduct.id], newProduct)
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
      if (andNew) {
        setName(''); setCategoryId(''); setBrandId(''); setModelId(''); setSku(''); setBarcode('')
        setImageUrl(''); setPartType(''); setCostPrice(''); setSellingPrice('')
        setInitialStock('0'); setLowStockAlert('5'); setSupplierId(''); setPhysicalLocation('')
        setCommissionEnabled(false); setCommissionType('percentage'); setCommissionRate('')
        setLoyaltyEnabled(true)
        toast.success('Saved! Add another.')
      } else {
        toast.success(`"${newProduct?.name}" added to inventory.`, {
          action: { label: 'View', onClick: () => router.push(`/inventory/${productId}`) },
        })
        router.push('/inventory')
      }
    } else {
      const j = await res.json().catch(() => ({}))
      const message = j?.message || j?.error?.message || 'Failed to save.'
      setSaveError(message)
      toast.error(message)
    }
    setSaving(false)
  }

  const cost = parseFloat(costPrice)
  const sell = parseFloat(sellingPrice)
  const hasMargin = !isNaN(cost) && !isNaN(sell) && cost > 0 && sell > 0

  // ── Option lists for comboboxes ────────────────────────────────────────────
  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }))
  const brandOptions = brands.map(b => ({ value: b.id, label: b.name }))
  const deviceOptions = devices.map(d => ({ value: d.id, label: d.name }))
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const partTypeOptions = partTypesForModel.map(p => ({ value: p.name, label: p.name }))

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ChevronLeft className="h-4 w-4" /> Back to Inventory
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">Add New {itemType === 'part' ? 'Part' : 'Product'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave(true)} loading={saving && saveAndNew} disabled={skuConflict || barcodeConflict}>
            <Plus className="h-4 w-4" /> Save &amp; Add New
          </Button>
          <Button onClick={() => handleSave(false)} loading={saving && !saveAndNew} disabled={skuConflict || barcodeConflict}>
            <Save className="h-4 w-4" /> Save {itemType === 'part' ? 'Part' : 'Product'}
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 py-6 space-y-8">

          {/* ── Type Toggle ── */}
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

          {/* ── Item Details ── */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">{itemType === 'part' ? 'Part' : 'Product'} Details</h2>
            </div>
            <div className="space-y-4">
              <ImageUpload
                label={itemType === 'part' ? 'Part image' : 'Product image'}
                value={imageUrl}
                onChange={setImageUrl}
              />

              <Input
                label="Name *"
                placeholder={itemType === 'part' ? 'e.g. iPhone 13 Screen' : 'e.g. iPhone 13 Pro Max'}
                required
                value={name}
                onChange={e => setName(e.target.value)}
              />

              {/* Device Type + Brand */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Device Type
                    <span className="ml-1 text-xs font-normal text-gray-400">(select or create)</span>
                  </label>
                  <CreatableCombobox
                    options={categoryOptions}
                    value={categoryId}
                    onChange={(id) => { setCategoryId(id); setBrandId(''); setModelId(''); setPartType('') }}
                    onCreate={createCategory}
                    placeholder="Select or type to create..."
                    createLabel="Add device type"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Brand
                    <span className="ml-1 text-xs font-normal text-gray-400">(select or create)</span>
                  </label>
                  <CreatableCombobox
                    options={brandOptions}
                    value={brandId}
                    onChange={(id) => { setBrandId(id); setModelId('') }}
                    onCreate={createBrand}
                    placeholder="Select or type to create..."
                    createLabel="Add brand"
                  />
                </div>
              </div>

              {/* Model + Part Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model
                    <span className="ml-1 text-xs font-normal text-gray-400">(select or create)</span>
                  </label>
                  <CreatableCombobox
                    options={deviceOptions}
                    value={modelId}
                    onChange={setModelId}
                    onCreate={brandId ? createModel : undefined}
                    placeholder={brandId ? 'Select or type to create...' : 'Select a brand first'}
                    createLabel="Add model"
                    disabled={false}
                  />
                  {!brandId && (
                    <p className="mt-1 text-xs text-amber-600">Select a brand to create a new model</p>
                  )}
                </div>
                {itemType === 'part' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Part Type
                      <span className="ml-1 text-xs font-normal text-gray-400">(select or create)</span>
                    </label>
                    <CreatableCombobox
                      options={partTypeOptions}
                      value={partType}
                      onChange={(val) => setPartType(val)}
                      onCreate={createPartType}
                      placeholder="Select or type to create..."
                      createLabel="Add part type"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="SKU" 
                  placeholder="Optional" 
                  value={sku} 
                  onChange={e => setSku(e.target.value)} 
                  error={skuConflict ? 'This SKU is already in use' : undefined}
                />
                <Input 
                  label="Barcode / UPC" 
                  placeholder="Optional" 
                  value={barcode} 
                  onChange={e => setBarcode(e.target.value)} 
                  error={barcodeConflict ? 'This Barcode is already in use' : undefined}
                />
              </div>
            </div>
          </section>

          {/* ── Pricing ── */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Pricing</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Cost Price (£)" type="number" step="0.01" min="0" placeholder="0.00" value={costPrice} onChange={e => setCostPrice(e.target.value)} />
                <Input label="Selling Price (£) *" type="number" step="0.01" min="0" placeholder="0.00" required value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} />
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

          {/* ── Stock ── */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Stock</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Opening Stock" type="number" min="0" value={initialStock} onChange={e => setInitialStock(e.target.value)} />
                <Input label="Low Stock Alert" type="number" min="0" value={lowStockAlert} onChange={e => setLowStockAlert(e.target.value)} />
              </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier
                  <span className="ml-1 text-xs font-normal text-gray-400">(select or create)</span>
                </label>
                <CreatableCombobox
                  options={supplierOptions}
                  value={supplierId}
                  onChange={setSupplierId}
                  onCreate={createSupplier}
                  placeholder="Select or type to create..."
                  createLabel="Add supplier"
                />
              </div>
            </div>
          </section>

          {/* ── Pricing Options ── */}
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
                  <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Commission Type</label>
                      <Select options={[{ value: 'percentage', label: 'Percentage (%)' }, { value: 'fixed', label: 'Fixed Amount (£)' }]} value={commissionType} onValueChange={setCommissionType} />
                    </div>
                    <Input label={commissionType === 'percentage' ? 'Rate (%)' : 'Amount (£)'} type="number" step="0.01" min="0" placeholder="0" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} />
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

          {/* ── Bottom save ── */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 py-6 border-t border-gray-200">
            <Link href="/inventory" className="w-full sm:w-auto"><Button variant="outline" className="w-full">Cancel</Button></Link>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => handleSave(true)} loading={saving && saveAndNew} disabled={skuConflict || barcodeConflict}>
              <Plus className="h-4 w-4" /> Save &amp; New
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => handleSave(false)} loading={saving && !saveAndNew} disabled={skuConflict || barcodeConflict}>
              <Save className="h-4 w-4" /> Save
            </Button>
          </div>

        </div>
      </main>
    </div>
  )
}
