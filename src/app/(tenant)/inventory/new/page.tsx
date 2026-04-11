'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { ImageUpload } from '@/components/ui/image-upload'
import { useAuthStore } from '@/store/auth.store'
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

  const [categories, setCategories] = useState<Category[]>([])
  const [allBrands, setAllBrands] = useState<Brand[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [allDevices, setAllDevices] = useState<ServiceDevice[]>([])
  const [allPartTypes, setAllPartTypes] = useState<PartType[]>([])

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

  const [initialStock, setInitialStock] = useState(0)
  const [lowStockAlert, setLowStockAlert] = useState(5)
  const [supplierId, setSupplierId] = useState('')
  const [physicalLocation, setPhysicalLocation] = useState('')

  const [commissionEnabled, setCommissionEnabled] = useState(false)
  const [commissionType, setCommissionType] = useState('percentage')
  const [commissionRate, setCommissionRate] = useState('')
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true)

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(j => setCategories(j.data ?? [])).catch(() => {})
    fetch('/api/brands').then(r => r.json()).then(j => setAllBrands(j.data ?? [])).catch(() => {})
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? [])).catch(() => {})
    fetch('/api/services/devices').then(r => r.json()).then(j => setAllDevices(j.data ?? [])).catch(() => {})
    fetch('/api/part-types').then(r => r.json()).then(j => setAllPartTypes(j.data ?? [])).catch(() => {})
  }, [])

  // Filtered lists based on hierarchy
  const brands = categoryId ? allBrands.filter(b => b.category_id === categoryId) : allBrands
  const devices = brandId ? allDevices.filter(d => d.brand_id === brandId) : allDevices
  const partTypesForModel = modelId ? allPartTypes.filter(p => p.device_id === modelId) : allPartTypes


  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    const res = await fetch('/api/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName.trim() }),
    })
    if (res.ok) {
      const json = await res.json()
      const created = json.data
      setCategories(prev => [...prev, created])
      setCategoryId(created.id)
      setNewCategoryName('')
      setAddingCategory(false)
    }
  }

  async function handleAddBrand() {
    if (!newBrandName.trim()) return
    const res = await fetch('/api/brands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBrandName.trim(), category_id: categoryId || null }),
    })
    if (res.ok) {
      const json = await res.json()
      const created = json.data
      setAllBrands(prev => [...prev, created])
      setBrandId(created.id)
      setNewBrandName('')
      setAddingBrand(false)
    }
  }

  async function handleAddDevice() {
    if (!newDeviceName.trim() || !brandId) return
    const selectedBrand = brands.find(b => b.id === brandId)
    if (!selectedBrand) return
    const mfRes = await fetch('/api/services/manufacturers')
    const mfJson = await mfRes.json()
    let manufacturer = (mfJson.data ?? []).find((m: { name: string }) => m.name === selectedBrand.name)
    if (!manufacturer) {
      const createMfRes = await fetch('/api/services/manufacturers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedBrand.name }),
      })
      if (!createMfRes.ok) return
      const createMfJson = await createMfRes.json()
      manufacturer = createMfJson.data
    }
    const res = await fetch('/api/services/devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDeviceName.trim(), manufacturer_id: manufacturer.id, brand_id: brandId || null }),
    })
    if (res.ok) {
      const json = await res.json()
      const created = json.data
      setAllDevices(prev => [...prev, created])
      setModelId(created.id)
      setNewDeviceName('')
      setAddingDevice(false)
    }
  }

  async function handleSave(andNew = false) {
    if (!name.trim() || !sellingPrice) return
    setSaving(true)
    setSaveAndNew(andNew)

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
      supplier_id: itemType === 'part' ? (supplierId || null) : null,
      track_inventory: true,
      low_stock_alert: lowStockAlert,
      initial_stock: initialStock,
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
      const productId = json.data?.id ?? json.id
      if (andNew) {
        setName(''); setCategoryId(''); setBrandId(''); setModelId(''); setSku(''); setBarcode('')
        setImageUrl(''); setPartType(''); setCostPrice(''); setSellingPrice('')
        setInitialStock(0); setLowStockAlert(5); setSupplierId(''); setPhysicalLocation('')
        setCommissionEnabled(false); setCommissionType('percentage'); setCommissionRate('')
        setLoyaltyEnabled(true)
      } else {
        router.push(`/inventory/${productId}`)
      }
    }
    setSaving(false)
  }

  const cost = parseFloat(costPrice)
  const sell = parseFloat(sellingPrice)
  const hasMargin = !isNaN(cost) && !isNaN(sell) && cost > 0 && sell > 0

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
          <Button variant="outline" onClick={() => handleSave(true)} loading={saving && saveAndNew}>
            <Plus className="h-4 w-4" /> Save & Add New
          </Button>
          <Button onClick={() => handleSave(false)} loading={saving && !saveAndNew}>
            <Save className="h-4 w-4" /> Save {itemType === 'part' ? 'Part' : 'Product'}
          </Button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 py-6 space-y-8">

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
              <ImageUpload
                label={itemType === 'part' ? 'Part image' : 'Product image'}
                value={imageUrl}
                onChange={setImageUrl}
              />

              <Input label="Name *" placeholder={itemType === 'part' ? 'e.g. iPhone 13 Screen' : 'e.g. iPhone 13 Pro Max'} required value={name} onChange={e => setName(e.target.value)} />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Device Type</label>
                    <button type="button" onClick={() => setAddingCategory(true)} className="text-xs text-brand-teal hover:underline">+ Add</button>
                  </div>
                  <Select options={[{ value: '', label: 'Select type...' }, ...categories.map(c => ({ value: c.id, label: c.name }))]} value={categoryId} onValueChange={v => { setCategoryId(v); setBrandId(''); setModelId(''); setPartType('') }} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Brand</label>
                    <button type="button" onClick={() => setAddingBrand(true)} className="text-xs text-brand-teal hover:underline">+ Add</button>
                  </div>
                  <Select options={[{ value: '', label: 'Select brand...' }, ...brands.map(b => ({ value: b.id, label: b.name }))]} value={brandId} onValueChange={v => { setBrandId(v); setModelId('') }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                    <Select options={[{ value: '', label: 'Select part type...' }, ...partTypesForModel.map(p => ({ value: p.name, label: p.name }))]} value={partType} onValueChange={setPartType} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="SKU" placeholder="Optional" value={sku} onChange={e => setSku(e.target.value)} />
                <Input label="Barcode / UPC" placeholder="Optional" value={barcode} onChange={e => setBarcode(e.target.value)} />
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

          {/* Stock */}
          <section>
            <div className="mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Stock</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Opening Stock" type="number" min="0" value={initialStock} onChange={e => setInitialStock(parseInt(e.target.value) || 0)} />
                <Input label="Low Stock Alert" type="number" min="0" value={lowStockAlert} onChange={e => setLowStockAlert(parseInt(e.target.value) || 0)} />
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
              {itemType === 'part' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier (optional)</label>
                  <Select options={[{ value: '', label: 'Select Supplier...' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} value={supplierId} onValueChange={setSupplierId} />
                </div>
              )}
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

          {/* Bottom save */}
          <div className="flex items-center justify-end gap-3 py-6 border-t border-gray-200">
            <Link href="/inventory"><Button variant="outline">Cancel</Button></Link>
            <Button variant="outline" onClick={() => handleSave(true)} loading={saving && saveAndNew}>
              <Plus className="h-4 w-4" /> Save & Add New
            </Button>
            <Button onClick={() => handleSave(false)} loading={saving && !saveAndNew}>
              <Save className="h-4 w-4" /> Save {itemType === 'part' ? 'Part' : 'Product'}
            </Button>
          </div>
        </div>
      </main>

      <Modal open={addingCategory} onClose={() => { setAddingCategory(false); setNewCategoryName('') }} title="Add Device Type" size="sm">
        <div className="space-y-4">
          <Input label="Device Type Name" placeholder="e.g. Phones, Laptops, Tablets" required value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setAddingCategory(false); setNewCategoryName('') }}>Cancel</Button>
            <Button onClick={handleAddCategory}>Add</Button>
          </div>
        </div>
      </Modal>

      <Modal open={addingBrand} onClose={() => { setAddingBrand(false); setNewBrandName('') }} title="Add Brand" size="sm">
        <div className="space-y-4">
          <Input label="Brand Name" placeholder="e.g. Apple, Samsung" required value={newBrandName} onChange={e => setNewBrandName(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddBrand())} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setAddingBrand(false); setNewBrandName('') }}>Cancel</Button>
            <Button onClick={handleAddBrand}>Add</Button>
          </div>
        </div>
      </Modal>

      <Modal open={addingDevice} onClose={() => { setAddingDevice(false); setNewDeviceName('') }} title="Add Model" size="sm">
        <div className="space-y-4">
          {!brandId ? (
            <p className="text-sm text-amber-600">Please select a brand first, then add a model.</p>
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
    </div>
  )
}
