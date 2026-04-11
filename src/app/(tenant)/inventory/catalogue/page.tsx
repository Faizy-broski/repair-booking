'use client'
import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Tag, Package, Smartphone, Cpu, Check, X, ChevronRight } from 'lucide-react'
import { ImageUpload } from '@/components/ui/image-upload'

interface CatCategory { id: string; name: string; image_url?: string | null }
interface CatBrand    { id: string; name: string; category_id: string | null; image_url?: string | null }
interface CatModel    { id: string; name: string; brand_id: string | null; manufacturer_id: string | null; image_url?: string | null }
interface CatPartType { id: string; name: string; device_id: string | null; image_url?: string | null }

export default function CataloguePage() {
  const [categories, setCategories] = useState<CatCategory[]>([])
  const [brands,     setBrands]     = useState<CatBrand[]>([])
  const [models,     setModels]     = useState<CatModel[]>([])
  const [partTypes,  setPartTypes]  = useState<CatPartType[]>([])
  const [saving,     setSaving]     = useState(false)

  // add inputs
  const [newTypeName,  setNewTypeName]  = useState('')
  const [newTypeImage, setNewTypeImage] = useState('')
  const [newBrandName,  setNewBrandName]  = useState('')
  const [newBrandImage, setNewBrandImage] = useState('')
  const [newModelName,  setNewModelName]  = useState('')
  const [newModelImage, setNewModelImage] = useState('')
  const [newPartName,  setNewPartName]  = useState('')
  const [newPartImage, setNewPartImage] = useState('')

  // selection
  const [selectedTypeId,  setSelectedTypeId]  = useState<string | null>(null)
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [mobileStep, setMobileStep] = useState<0 | 1 | 2 | 3>(0)

  // inline rename
  const [editingTypeId,  setEditingTypeId]  = useState<string | null>(null)
  const [editTypeName,   setEditTypeName]   = useState('')
  const [editTypeImage,  setEditTypeImage]  = useState('')
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null)
  const [editBrandName,  setEditBrandName]  = useState('')
  const [editBrandImage, setEditBrandImage] = useState('')
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [editModelName,  setEditModelName]  = useState('')
  const [editModelImage, setEditModelImage] = useState('')
  const [editingPartId,  setEditingPartId]  = useState<string | null>(null)
  const [editPartName,   setEditPartName]   = useState('')
  const [editPartImage,  setEditPartImage]  = useState('')

  async function load() {
    const [cRes, bRes, mRes, pRes] = await Promise.all([
      fetch('/api/categories'), fetch('/api/brands'),
      fetch('/api/services/devices'), fetch('/api/part-types'),
    ])
    const [cj, bj, mj, pj] = await Promise.all([cRes.json(), bRes.json(), mRes.json(), pRes.json()])
    setCategories(cj.data ?? [])
    setBrands(bj.data ?? [])
    setModels(mj.data ?? [])
    setPartTypes(pj.data ?? [])
  }

  useEffect(() => { load() }, [])

  async function addDeviceType() {
    if (!newTypeName.trim()) return
    setSaving(true)
    await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTypeName.trim(), image_url: newTypeImage || null }) })
    setNewTypeName(''); setNewTypeImage('')
    await load(); setSaving(false)
  }

  async function deleteDeviceType(id: string) {
    await fetch(`/api/categories/${id}`, { method: 'DELETE' }); await load()
  }

  async function renameDeviceType(id: string) {
    if (!editTypeName.trim()) return
    await fetch(`/api/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editTypeName.trim(), image_url: editTypeImage || null }) })
    setEditingTypeId(null); await load()
  }

  async function addBrand(categoryId: string) {
    if (!newBrandName.trim()) return
    setSaving(true)
    await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newBrandName.trim(), category_id: categoryId, image_url: newBrandImage || null }) })
    setNewBrandName(''); setNewBrandImage('')
    await load(); setSaving(false)
  }

  async function deleteBrand(id: string) {
    await fetch(`/api/brands/${id}`, { method: 'DELETE' }); await load()
  }

  async function renameBrand(id: string) {
    if (!editBrandName.trim()) return
    await fetch(`/api/brands/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editBrandName.trim(), image_url: editBrandImage || null }) })
    setEditingBrandId(null); await load()
  }

  async function addModel(brandId: string) {
    if (!newModelName.trim()) return
    setSaving(true)
    const brand = brands.find(b => b.id === brandId)
    let manufacturerId: string | null = null
    if (brand) {
      const mfRes = await fetch('/api/services/manufacturers')
      const mfJson = await mfRes.json()
      let mf = (mfJson.data ?? []).find((m: { name: string }) => m.name === brand.name)
      if (!mf) {
        const createRes = await fetch('/api/services/manufacturers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: brand.name }) })
        if (createRes.ok) mf = (await createRes.json()).data
      }
      if (mf) manufacturerId = mf.id
    }
    await fetch('/api/services/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newModelName.trim(), brand_id: brandId, manufacturer_id: manufacturerId, image_url: newModelImage || null }) })
    setNewModelName(''); setNewModelImage('')
    await load(); setSaving(false)
  }

  async function deleteModel(id: string) {
    await fetch(`/api/services/devices/${id}`, { method: 'DELETE' }); await load()
  }

  async function renameModel(id: string) {
    if (!editModelName.trim()) return
    await fetch(`/api/services/devices/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editModelName.trim(), image_url: editModelImage || null }) })
    setEditingModelId(null); await load()
  }

  async function addPartType(deviceId: string) {
    if (!newPartName.trim()) return
    setSaving(true)
    await fetch('/api/part-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newPartName.trim(), device_id: deviceId, image_url: newPartImage || null }) })
    setNewPartName(''); setNewPartImage('')
    await load(); setSaving(false)
  }

  async function deletePartType(id: string) {
    await fetch(`/api/part-types/${id}`, { method: 'DELETE' }); await load()
  }

  async function renamePartType(id: string) {
    if (!editPartName.trim()) return
    await fetch(`/api/part-types/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editPartName.trim(), image_url: editPartImage || null }) })
    setEditingPartId(null); await load()
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-on-surface">Device Catalogue</h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Manage device types, brands, models and part types used in repairs and parts inventory.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Mobile breadcrumb stepper */}
        <div className="lg:hidden border-b border-gray-100 px-4 py-2 bg-gray-50 flex items-center gap-1 flex-wrap">
          <button onClick={() => setMobileStep(0)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 0 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}>Types</button>
          {selectedTypeId && (<>
            <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
            <button onClick={() => setMobileStep(1)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 1 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              {categories.find(c => c.id === selectedTypeId)?.name ?? 'Brands'}
            </button>
          </>)}
          {selectedBrandId && (<>
            <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
            <button onClick={() => setMobileStep(2)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 2 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              {brands.find(b => b.id === selectedBrandId)?.name ?? 'Models'}
            </button>
          </>)}
          {selectedModelId && (<>
            <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
            <button onClick={() => setMobileStep(3)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 3 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}>Parts</button>
          </>)}
        </div>

        {/* 4-column explorer */}
        <div className="lg:grid lg:grid-cols-4 lg:divide-x lg:divide-gray-200" style={{ minHeight: 520 }}>

          {/* ── Col 1: Device Types ── */}
          <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 0 ? 'hidden lg:flex' : 'flex'}`}>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Device Types</span>
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{categories.length}</span>
            </div>
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="flex gap-2 items-center">
                <ImageUpload compact value={newTypeImage} onChange={setNewTypeImage} className="h-10 w-10" />
                <input type="text" placeholder="e.g. Phones, Laptops…" value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDeviceType()}
                  className="h-10 flex-1 min-w-0 rounded-md border border-gray-200 px-3 text-[15px] focus:border-brand-teal focus:outline-none" />
                <button onClick={addDeviceType} disabled={saving || !newTypeName.trim()}
                  className="h-10 px-4 rounded-md bg-brand-teal text-white text-[13px] font-medium hover:bg-brand-teal/90 disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {categories.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No device types yet</p>}
              {categories.map(dt => {
                const isSelected = selectedTypeId === dt.id
                const isEditing  = editingTypeId === dt.id
                return (
                  <div key={dt.id}
                    onClick={() => { if (!isEditing) { setSelectedTypeId(dt.id); setSelectedBrandId(null); setSelectedModelId(null); setMobileStep(1) } }}
                    className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${isSelected ? 'bg-teal-50 border-l-[3px] border-l-brand-teal' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}>
                    {dt.image_url
                      ? <img src={dt.image_url} alt={dt.name} className="h-8 w-8 rounded-lg object-cover border border-gray-200 shrink-0 bg-white" />
                      : <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center shrink-0 border border-teal-200"><Smartphone className="h-4 w-4 text-brand-teal" /></div>}
                    {isEditing ? (
                      <>
                        <ImageUpload compact value={editTypeImage} onChange={setEditTypeImage} className="shrink-0" />
                        <input autoFocus value={editTypeName} onChange={e => setEditTypeName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renameDeviceType(dt.id); if (e.key === 'Escape') setEditingTypeId(null) }}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 h-7 min-w-0 rounded border border-brand-teal px-2 text-sm focus:outline-none" />
                        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => renameDeviceType(dt.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingTypeId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-[15px] font-medium text-gray-800 truncate">{dt.name}</span>
                        <span className="text-xs font-semibold text-gray-400 shrink-0 mr-2">{brands.filter(b => b.category_id === dt.id).length}</span>
                        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditingTypeId(dt.id); setEditTypeName(dt.name); setEditTypeImage(dt.image_url ?? '') }} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteDeviceType(dt.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Col 2: Brands ── */}
          <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 1 ? 'hidden lg:flex' : 'flex'}`}>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Brands</span>
              {selectedTypeId && <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{brands.filter(b => b.category_id === selectedTypeId).length}</span>}
            </div>
            {!selectedTypeId ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 py-10">
                <Tag className="h-9 w-9 text-gray-200" />
                <p className="text-xs text-gray-400">Select a device type first</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="flex gap-2 items-center">
                    <ImageUpload compact value={newBrandImage} onChange={setNewBrandImage} className="h-10 w-10" />
                    <input type="text" placeholder="e.g. Apple, Samsung…" value={newBrandName}
                      onChange={e => setNewBrandName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addBrand(selectedTypeId)}
                      className="h-10 flex-1 min-w-0 rounded-md border border-gray-200 px-3 text-[15px] focus:border-brand-teal focus:outline-none" />
                    <button onClick={() => addBrand(selectedTypeId)} disabled={saving || !newBrandName.trim()}
                      className="h-10 px-4 rounded-md bg-brand-teal text-white text-[13px] font-medium hover:bg-brand-teal/90 disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                      <Plus className="h-4 w-4" /> Add
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {brands.filter(b => b.category_id === selectedTypeId).length === 0 && <p className="text-xs text-gray-400 text-center py-10">No brands yet</p>}
                  {brands.filter(b => b.category_id === selectedTypeId).map(brand => {
                    const isSelected = selectedBrandId === brand.id
                    const isEditing  = editingBrandId === brand.id
                    return (
                      <div key={brand.id}
                        onClick={() => { if (!isEditing) { setSelectedBrandId(brand.id); setSelectedModelId(null); setMobileStep(2) } }}
                        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${isSelected ? 'bg-teal-50 border-l-[3px] border-l-brand-teal' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}>
                        {brand.image_url
                          ? <img src={brand.image_url} alt={brand.name} className="h-8 w-8 rounded-lg object-contain border border-gray-200 shrink-0 bg-white" />
                          : <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100"><Tag className="h-4 w-4 text-blue-500" /></div>}
                        {isEditing ? (
                          <>
                            <ImageUpload compact value={editBrandImage} onChange={setEditBrandImage} className="shrink-0" />
                            <input autoFocus value={editBrandName} onChange={e => setEditBrandName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') renameBrand(brand.id); if (e.key === 'Escape') setEditingBrandId(null) }}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 h-7 min-w-0 rounded border border-brand-teal px-2 text-sm focus:outline-none" />
                            <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => renameBrand(brand.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingBrandId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-[15px] font-medium text-gray-800 truncate">{brand.name}</span>
                            <span className="text-xs font-semibold text-gray-400 shrink-0 mr-2">{models.filter(m => m.brand_id === brand.id).length}</span>
                            <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditingBrandId(brand.id); setEditBrandName(brand.name); setEditBrandImage(brand.image_url ?? '') }} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteBrand(brand.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Col 3: Models ── */}
          <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 2 ? 'hidden lg:flex' : 'flex'}`}>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Models</span>
              {selectedBrandId && <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{models.filter(m => m.brand_id === selectedBrandId).length}</span>}
            </div>
            {!selectedBrandId ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 py-10">
                <Package className="h-9 w-9 text-gray-200" />
                <p className="text-xs text-gray-400">Select a brand first</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="flex gap-2 items-center">
                    <ImageUpload compact value={newModelImage} onChange={setNewModelImage} className="h-10 w-10" />
                    <input type="text" placeholder="e.g. iPhone 15, Galaxy S24…" value={newModelName}
                      onChange={e => setNewModelName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addModel(selectedBrandId)}
                      className="h-10 flex-1 min-w-0 rounded-md border border-gray-200 px-3 text-[15px] focus:border-brand-teal focus:outline-none" />
                    <button onClick={() => addModel(selectedBrandId)} disabled={saving || !newModelName.trim()}
                      className="h-10 px-4 rounded-md bg-brand-teal text-white text-[13px] font-medium hover:bg-brand-teal/90 disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                      <Plus className="h-4 w-4" /> Add
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {models.filter(m => m.brand_id === selectedBrandId).length === 0 && <p className="text-xs text-gray-400 text-center py-10">No models yet</p>}
                  {models.filter(m => m.brand_id === selectedBrandId).map(model => {
                    const isSelected = selectedModelId === model.id
                    const isEditing  = editingModelId === model.id
                    const partCount  = partTypes.filter(p => p.device_id === model.id).length
                    return (
                      <div key={model.id}
                        onClick={() => { if (!isEditing) { setSelectedModelId(model.id); setMobileStep(3) } }}
                        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${isSelected ? 'bg-teal-50 border-l-[3px] border-l-brand-teal' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}>
                        {model.image_url
                          ? <img src={model.image_url} alt={model.name} className="h-8 w-8 rounded-lg object-cover border border-gray-200 shrink-0 bg-white" />
                          : <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200"><Package className="h-4 w-4 text-gray-500" /></div>}
                        {isEditing ? (
                          <>
                            <ImageUpload compact value={editModelImage} onChange={setEditModelImage} className="shrink-0" />
                            <input autoFocus value={editModelName} onChange={e => setEditModelName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') renameModel(model.id); if (e.key === 'Escape') setEditingModelId(null) }}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 h-7 min-w-0 rounded border border-brand-teal px-2 text-sm focus:outline-none" />
                            <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => renameModel(model.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingModelId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-[15px] font-medium text-gray-800 truncate">{model.name}</span>
                            <span className="text-xs font-semibold text-gray-400 shrink-0 mr-2">{partCount} parts</span>
                            <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditingModelId(model.id); setEditModelName(model.name); setEditModelImage(model.image_url ?? '') }} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteModel(model.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Col 4: Part Types ── */}
          <div className={`flex flex-col ${mobileStep !== 3 ? 'hidden lg:flex' : 'flex'}`}>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Part Types</span>
              </div>
              {selectedModelId && <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{partTypes.filter(p => p.device_id === selectedModelId).length}</span>}
            </div>
            {!selectedModelId ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 py-10">
                <Cpu className="h-9 w-9 text-gray-200" />
                <p className="text-xs text-gray-400">Select a model first</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="flex gap-2 items-center">
                    <ImageUpload compact value={newPartImage} onChange={setNewPartImage} className="h-10 w-10" />
                    <input type="text" placeholder="e.g. Screen, Battery, IC…" value={newPartName}
                      onChange={e => setNewPartName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addPartType(selectedModelId)}
                      className="h-10 flex-1 min-w-0 rounded-md border border-gray-200 px-3 text-[15px] focus:border-purple-400 focus:outline-none" />
                    <button onClick={() => addPartType(selectedModelId)} disabled={saving || !newPartName.trim()}
                      className="h-10 px-4 rounded-md bg-purple-600 text-white text-[13px] font-medium hover:bg-purple-700 disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                      <Plus className="h-4 w-4" /> Add
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {partTypes.filter(p => p.device_id === selectedModelId).length === 0 && <p className="text-xs text-gray-400 text-center py-10">No part types yet</p>}
                  {partTypes.filter(p => p.device_id === selectedModelId).map(pt => {
                    const isEditing = editingPartId === pt.id
                    return (
                      <div key={pt.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-b-0 hover:bg-purple-50/40 transition-colors">
                        {pt.image_url
                          ? <img src={pt.image_url} alt={pt.name} className="h-8 w-8 rounded-lg object-cover border border-gray-200 shrink-0 bg-white" />
                          : <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 border border-purple-100"><Cpu className="h-4 w-4 text-purple-500" /></div>}
                        {isEditing ? (
                          <>
                            <ImageUpload compact value={editPartImage} onChange={setEditPartImage} className="shrink-0" />
                            <input autoFocus value={editPartName} onChange={e => setEditPartName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') renamePartType(pt.id); if (e.key === 'Escape') setEditingPartId(null) }}
                              className="flex-1 h-7 min-w-0 rounded border border-purple-400 px-2 text-sm focus:outline-none" />
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => renamePartType(pt.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingPartId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-[15px] font-medium text-gray-800 truncate">{pt.name}</span>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => { setEditingPartId(pt.id); setEditPartName(pt.name); setEditPartImage(pt.image_url ?? '') }} className="p-1.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deletePartType(pt.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60">
                  <p className="text-[11px] text-gray-400 truncate">
                    <span className="font-medium text-gray-500">{models.find(m => m.id === selectedModelId)?.name}</span>
                    {' '}· {brands.find(b => b.id === selectedBrandId)?.name}
                  </p>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
