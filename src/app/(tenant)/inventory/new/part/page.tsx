'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Plus, Lock } from 'lucide-react'
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

interface Category    { id: string; name: string }
interface Brand       { id: string; name: string; category_id?: string | null }
interface Supplier    { id: string; name: string }
interface ServiceDevice { id: string; name: string; brand_id?: string | null }
interface PartType    { id: string; name: string; device_id?: string | null }

export default function NewPartPage() {
  const { activeBranch, branches } = useAuthStore()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saveAndNew, setSaveAndNew] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [categories, setCategories]     = useState<Category[]>([])
  const [allBrands, setAllBrands]       = useState<Brand[]>([])
  const [suppliers, setSuppliers]       = useState<Supplier[]>([])
  const [allDevices, setAllDevices]     = useState<ServiceDevice[]>([])
  const [allPartTypes, setAllPartTypes] = useState<PartType[]>([])

  const [name, setName]                         = useState('')
  const [categoryId, setCategoryId]             = useState('')
  const [brandId, setBrandId]                   = useState('')
  const [modelId, setModelId]                   = useState('')
  const [partType, setPartType]                 = useState('')
  const [sku, setSku]                           = useState('')
  const [barcode, setBarcode]                   = useState('')
  const [imageUrl, setImageUrl]                 = useState('')
  const [costPrice, setCostPrice]               = useState('')
  const [sellingPrice, setSellingPrice]         = useState('')
  const [initialStock, setInitialStock]         = useState('0')
  const [lowStockAlert, setLowStockAlert]       = useState('5')
  const [supplierId, setSupplierId]             = useState('')
  const [physicalLocation, setPhysicalLocation] = useState('')
  const [commissionEnabled, setCommissionEnabled] = useState(false)
  const [commissionType, setCommissionType]       = useState('percentage')
  const [commissionRate, setCommissionRate]       = useState('')
  const [loyaltyEnabled, setLoyaltyEnabled]       = useState(true)
  const [skuConflict, setSkuConflict]             = useState(false)
  const [barcodeConflict, setBarcodeConflict]     = useState(false)

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(j => setCategories(j.data ?? [])).catch(() => {})
    fetch('/api/brands').then(r => r.json()).then(j => setAllBrands(j.data ?? [])).catch(() => {})
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? [])).catch(() => {})
    fetch('/api/services/devices').then(r => r.json()).then(j => setAllDevices(j.data ?? [])).catch(() => {})
    fetch('/api/part-types').then(r => r.json()).then(j => setAllPartTypes(j.data ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!sku && !barcode) { setSkuConflict(false); setBarcodeConflict(false); return }
    const t = setTimeout(async () => {
      const params = new URLSearchParams()
      if (sku) params.set('sku', sku)
      if (barcode) params.set('barcode', barcode)
      const res = await fetch(`/api/products/check-availability?${params}`).catch(() => null)
      if (!res) return
      const json = await res.json()
      if (json.data) { setSkuConflict(json.data.skuExists); setBarcodeConflict(json.data.barcodeExists) }
    }, 500)
    return () => clearTimeout(t)
  }, [sku, barcode])

  const brands          = categoryId ? allBrands.filter(b => b.category_id === categoryId) : allBrands
  const devices         = brandId    ? allDevices.filter(d => d.brand_id === brandId)       : allDevices
  const partTypesForModel = modelId  ? allPartTypes.filter(p => p.device_id === modelId)   : allPartTypes

  async function createCategory(n: string) {
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })
    if (!res.ok) return
    const created: Category = (await res.json()).data
    setCategories(p => [...p, created]); setCategoryId(created.id); setBrandId(''); setModelId(''); setPartType('')
  }

  async function createBrand(n: string) {
    const res = await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, category_id: categoryId || null }) })
    if (!res.ok) return
    const created: Brand = (await res.json()).data
    setAllBrands(p => [...p, created]); setBrandId(created.id); setModelId('')
  }

  async function createModel(n: string) {
    const selected = allBrands.find(b => b.id === brandId)
    if (!selected) return
    const mfJson = await fetch('/api/services/manufacturers').then(r => r.json())
    let mf = (mfJson.data ?? []).find((m: { name: string }) => m.name === selected.name)
    if (!mf) {
      const cr = await fetch('/api/services/manufacturers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: selected.name }) })
      if (!cr.ok) return
      mf = (await cr.json()).data
    }
    const res = await fetch('/api/services/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, manufacturer_id: mf.id, brand_id: brandId }) })
    if (!res.ok) return
    const created: ServiceDevice = (await res.json()).data
    setAllDevices(p => [...p, created]); setModelId(created.id)
  }

  async function createSupplier(n: string) {
    const res = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })
    if (!res.ok) return
    const created: Supplier = (await res.json()).data
    setSuppliers(p => [...p, created]); setSupplierId(created.id)
  }

  async function createPartType(n: string) {
    const res = await fetch('/api/part-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, device_id: modelId || null }) })
    if (!res.ok) return
    const created: PartType = (await res.json()).data
    setAllPartTypes(p => [...p, created]); setPartType(created.name)
  }

  function resetForm() {
    setName(''); setCategoryId(''); setBrandId(''); setModelId(''); setPartType('')
    setSku(''); setBarcode(''); setImageUrl(''); setCostPrice(''); setSellingPrice('')
    setInitialStock('0'); setLowStockAlert('5'); setSupplierId(''); setPhysicalLocation('')
    setCommissionEnabled(false); setCommissionType('percentage'); setCommissionRate(''); setLoyaltyEnabled(true)
  }

  async function handleSave(andNew = false) {
    if (!name.trim()) { toast.error('Please enter a part name.'); return }
    if (!categoryId) { toast.error('Please select a Device Type.'); return }
    if (!brandId) { toast.error('Please select a Brand.'); return }
    if (!modelId) { toast.error('Please select a Model.'); return }
    if (!partType) { toast.error('Please select a Part Type.'); return }
    if (!sellingPrice) { toast.error('Please enter a selling price.'); return }
    setSaving(true); setSaveAndNew(andNew); setSaveError(null)

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(), item_type: 'part',
        category_id: categoryId || null, brand_id: brandId || null, model_id: modelId || null,
        sku: sku || null, barcode: barcode || null, image_url: imageUrl || null,
        is_service: false, part_type: partType || null,
        cost_price: parseFloat(costPrice) || 0, selling_price: parseFloat(sellingPrice) || 0,
        supplier_id: supplierId || null, track_inventory: true,
        low_stock_alert: parseInt(lowStockAlert) || 0, initial_stock: parseInt(initialStock) || 0,
        branch_id: activeBranch?.id ?? null, physical_location: physicalLocation || null,
        commission_enabled: commissionEnabled, commission_type: commissionType,
        commission_rate: parseFloat(commissionRate) || 0, loyalty_enabled: loyaltyEnabled,
      }),
    })

    if (res.ok) {
      const json = await res.json()
      const newProduct = json.data ?? json
      // Prefill detail cache so navigating to the product page is instant
      if (newProduct?.id) queryClient.setQueryData(['product', newProduct.id], newProduct)
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
      if (andNew) {
        resetForm()
        toast.success('Part saved! Add another.')
      } else {
        toast.success(`"${newProduct.name}" added to inventory.`, {
          action: { label: 'View', onClick: () => router.push(`/inventory/${newProduct.id}`) },
        })
        router.push('/inventory')
      }
    } else {
      const j = await res.json().catch(() => ({}))
      const msg = j?.error?.message || j?.message || 'Failed to save.'
      setSaveError(msg); toast.error(msg)
    }
    setSaving(false)
  }

  const cost = parseFloat(costPrice); const sell = parseFloat(sellingPrice)
  const hasMargin = !isNaN(cost) && !isNaN(sell) && cost > 0 && sell > 0

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ChevronLeft className="h-4 w-4" /> Back to Inventory
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">Add New Part</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave(true)} loading={saving && saveAndNew} disabled={skuConflict || barcodeConflict}>
            <Plus className="h-4 w-4" /> Save &amp; Add New
          </Button>
          <Button onClick={() => handleSave(false)} loading={saving && !saveAndNew} disabled={skuConflict || barcodeConflict}>
            <Save className="h-4 w-4" /> Save Part
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 py-6 space-y-8">

          {/* Part Details */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Part Details</h2>
            </div>
            <div className="space-y-4">
              <ImageUpload label="Part image" value={imageUrl} onChange={setImageUrl} />
              <Input label="Name" placeholder="e.g. iPhone 13 Screen" required value={name} onChange={e => setName(e.target.value)} />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Device Type <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                  <CreatableCombobox options={categories.map(c => ({ value: c.id, label: c.name }))} value={categoryId} onChange={(id) => { setCategoryId(id); setBrandId(''); setModelId(''); setPartType('') }} onCreate={createCategory} placeholder="Select or type to create..." createLabel="Add device type" />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${!categoryId ? 'text-gray-400' : 'text-gray-700'}`}>Brand <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                  {categoryId ? (
                    <CreatableCombobox options={brands.map(b => ({ value: b.id, label: b.name }))} value={brandId} onChange={(id) => { setBrandId(id); setModelId(''); setPartType('') }} onCreate={createBrand} placeholder="Select or type to create..." createLabel="Add brand" />
                  ) : (
                    <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                      <Lock className="h-3.5 w-3.5 shrink-0" /> Select device type first
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${!brandId ? 'text-gray-400' : 'text-gray-700'}`}>Model <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                  {brandId ? (
                    <CreatableCombobox options={devices.map(d => ({ value: d.id, label: d.name }))} value={modelId} onChange={(id) => { setModelId(id); setPartType('') }} onCreate={createModel} placeholder="Select or type to create..." createLabel="Add model" />
                  ) : (
                    <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                      <Lock className="h-3.5 w-3.5 shrink-0" /> Select brand first
                    </div>
                  )}
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${!modelId ? 'text-gray-400' : 'text-gray-700'}`}>Part Type <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                  {modelId ? (
                    <CreatableCombobox options={partTypesForModel.map(p => ({ value: p.name, label: p.name }))} value={partType} onChange={setPartType} onCreate={createPartType} placeholder="Select or type to create..." createLabel="Add part type" />
                  ) : (
                    <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                      <Lock className="h-3.5 w-3.5 shrink-0" /> Select model first
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="SKU" placeholder="Optional" value={sku} onChange={e => setSku(e.target.value)} error={skuConflict ? 'This SKU is already in use' : undefined} />
                <Input label="Barcode / UPC" placeholder="Optional" value={barcode} onChange={e => setBarcode(e.target.value)} error={barcodeConflict ? 'This Barcode is already in use' : undefined} />
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Pricing</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Cost Price (£)" type="number" step="0.01" min="0" placeholder="0.00" value={costPrice} onChange={e => setCostPrice(e.target.value)} />
                <Input label="Selling Price (£)" type="number" step="0.01" min="0" placeholder="0.00" required value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} />
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
              <div className="grid grid-cols-2 gap-4">
                <Input label="Opening Stock" type="number" min="0" value={initialStock} onChange={e => setInitialStock(e.target.value)} />
                <Input label="Low Stock Alert" type="number" min="0" value={lowStockAlert} onChange={e => setLowStockAlert(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Location</label>
                <Select options={[{ value: '', label: 'Select location...' }, { value: 'warehouse', label: 'Warehouse (Main Stock)' }, ...branches.map(b => ({ value: b.name, label: b.name + (b.is_main ? ' (Main Branch)' : '') }))]} value={physicalLocation} onValueChange={setPhysicalLocation} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier <span className="text-xs font-normal text-gray-400">(select or create)</span></label>
                <CreatableCombobox options={suppliers.map(s => ({ value: s.id, label: s.name }))} value={supplierId} onChange={setSupplierId} onCreate={createSupplier} placeholder="Select or type to create..." createLabel="Add supplier" />
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
                    <p className="text-xs text-gray-500">Enable employee commission for this part</p>
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
                  <p className="text-xs text-gray-500">Earn / redeem loyalty points on this part</p>
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
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => handleSave(true)} loading={saving && saveAndNew} disabled={skuConflict || barcodeConflict}>
              <Plus className="h-4 w-4" /> Save &amp; New
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => handleSave(false)} loading={saving && !saveAndNew} disabled={skuConflict || barcodeConflict}>
              <Save className="h-4 w-4" /> Save Part
            </Button>
          </div>

        </div>
      </main>
    </div>
  )
}
