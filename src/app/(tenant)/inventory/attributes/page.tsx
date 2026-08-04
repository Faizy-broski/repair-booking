'use client'
import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Tag, X, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

interface AttributeValue { id: string; value: string; display_order: number }
interface Attribute {
  id: string; name: string; is_default: boolean; display_order: number
  product_attribute_values: AttributeValue[]
  categoryId?: string
  categoryName?: string
}
interface Category { id: string; name: string }

const PAGE_SIZE = 10

export default function InventoryAttributesPage() {
  const { verticalTemplateSlug } = useAuthStore()
  const isRetail = verticalTemplateSlug === 'retail-store'
  const isTyreShop = verticalTemplateSlug === 'mobile-tyre-fitting'
  const useSimpleCatalog = isRetail || isTyreShop
  const pathname = usePathname()

  const [attributes, setAttributes]   = useState<Attribute[]>([])
  const [categories, setCategories]   = useState<Category[]>([])
  const [loading, setLoading]         = useState(true)
  const [filterCatId, setFilterCatId] = useState('')
  const [page, setPage]               = useState(0)

  // Add-value inline state
  const [addingValueFor, setAddingValueFor] = useState<string | null>(null)
  const [newValueText, setNewValueText]     = useState('')

  // Modal state
  const [attrModal, setAttrModal]   = useState(false)
  const [editAttr, setEditAttr]     = useState<Attribute | null>(null)
  const [attrName, setAttrName]     = useState('')
  const [attrCatId, setAttrCatId]   = useState('')
  const [attrSaving, setAttrSaving] = useState(false)
  const [deleteAttr, setDeleteAttr] = useState<Attribute | null>(null)

  async function fetchAll() {
    setLoading(true)
    const [attrRes, catRes] = await Promise.all([
      fetch('/api/product-attributes').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ])
    const attrs: Attribute[] = attrRes.data ?? []
    const cats: Category[]   = catRes.data ?? []
    setCategories(cats)

    const results = await Promise.all(
      cats.map(c =>
        fetch(`/api/categories/${c.id}/attributes`)
          .then(r => r.json())
          .then(j => ({ catId: c.id, catName: c.name, attrIds: (j.data ?? []).map((a: any) => a.id) as string[] }))
          .catch(() => ({ catId: c.id, catName: c.name, attrIds: [] as string[] }))
      )
    )
    const reverseMap: Record<string, { id: string; name: string }> = {}
    for (const { catId, catName, attrIds } of results) {
      for (const attrId of attrIds) reverseMap[attrId] = { id: catId, name: catName }
    }

    setAttributes(attrs.map(a => ({
      ...a,
      categoryId:   reverseMap[a.id]?.id,
      categoryName: reverseMap[a.id]?.name,
    })))
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, []) // eslint-disable-line

  // ── Filtering + pagination ─────────────────────────────────────────────
  const filtered = filterCatId === ''
    ? attributes
    : filterCatId === '__none__'
      ? attributes.filter(a => !a.categoryId)
      : attributes.filter(a => a.categoryId === filterCatId)

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function changeFilter(id: string) { setFilterCatId(id); setPage(0) }

  // ── CRUD ───────────────────────────────────────────────────────────────
  function openCreate() { setEditAttr(null); setAttrName(''); setAttrCatId(''); setAttrModal(true) }
  function openEdit(a: Attribute) { setEditAttr(a); setAttrName(a.name); setAttrCatId(a.categoryId ?? ''); setAttrModal(true) }

  async function saveAttribute() {
    if (!attrName.trim()) return
    setAttrSaving(true)
    let savedId = editAttr?.id ?? ''
    if (editAttr) {
      await fetch(`/api/product-attributes/${editAttr.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: attrName.trim() }),
      })
    } else {
      const res  = await fetch('/api/product-attributes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: attrName.trim() }),
      })
      savedId = (await res.json()).data?.id ?? ''
    }
    if (savedId) {
      const prevCatId = editAttr?.categoryId ?? ''
      if (prevCatId && prevCatId !== attrCatId)
        await fetch(`/api/categories/${prevCatId}/attributes`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attribute_id: savedId }) })
      if (attrCatId && attrCatId !== prevCatId)
        await fetch(`/api/categories/${attrCatId}/attributes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attribute_id: savedId }) })
    }
    setAttrSaving(false); setAttrModal(false); fetchAll()
  }

  async function confirmDeleteAttr() {
    if (!deleteAttr) return
    await fetch(`/api/product-attributes/${deleteAttr.id}`, { method: 'DELETE' })
    setDeleteAttr(null); fetchAll()
  }

  async function addValue(attributeId: string) {
    if (!newValueText.trim()) return
    await fetch(`/api/product-attributes/${attributeId}/values`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: newValueText.trim() }),
    })
    setAddingValueFor(null); setNewValueText(''); fetchAll()
  }

  async function deleteValue(valueId: string) {
    await fetch(`/api/product-attributes/values/${valueId}`, { method: 'DELETE' })
    fetchAll()
  }

  const NAV = [
    { label: 'Products',        href: '/inventory' },
    { label: 'Purchase Orders', href: '/inventory/purchase-orders' },
    { label: 'Suppliers',       href: '/inventory/suppliers' },
    { label: 'Bin',             href: '/inventory/bin' },
    { label: 'Damage Returns',  href: '/inventory/damage-returns' },
    // { label: 'Stock Count', href: '/inventory/stock-count' },  // disabled
    ...(useSimpleCatalog ? [
      { label: 'Categories', href: '/inventory/categories' },
      { label: 'Attributes', href: '/inventory/attributes' },
    ] : []),
  ]

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="flex overflow-x-auto gap-1 border-b border-gray-200 pb-3 no-scrollbar">
        {NAV.map(({ label, href }) => (
          <Link key={href} href={href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              (href === '/inventory' ? pathname === '/inventory' : pathname.startsWith(href))
                ? 'bg-brand-teal text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >{label}</Link>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Product Attributes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define attributes like Color or Size and assign each to a category.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Attribute</Button>
      </div>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Filter:</span>
          {[
            { id: '', label: 'All' },
            ...categories.map(c => ({ id: c.id, label: c.name })),
            { id: '__none__', label: 'No category' },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => changeFilter(id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterCatId === id
                  ? id === '__none__' ? 'border-gray-500 bg-gray-500 text-white' : 'border-brand-teal bg-brand-teal text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800'
              }`}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[2fr_3fr_1.5fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3">
            {['ATTRIBUTE', 'VALUES', 'CATEGORY', 'ACTIONS'].map(h => (
              <div key={h} className="h-3 w-20 animate-pulse rounded bg-gray-200" />
            ))}
          </div>
          {[1,2,3,4].map(i => (
            <div key={i} className="grid grid-cols-[2fr_3fr_1.5fr_auto] gap-4 border-b border-gray-100 px-5 py-4">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100" />
              <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-20 text-center">
          <Tag className="mx-auto h-9 w-9 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">
            {attributes.length === 0 ? 'No attributes yet' : 'No attributes match this filter'}
          </p>
          {attributes.length === 0 && (
            <Button size="sm" className="mt-4" onClick={openCreate}><Plus className="h-4 w-4" /> Add First Attribute</Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* Table head */}
          <div className="grid grid-cols-[2fr_3fr_1.5fr_120px] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <div>Attribute</div>
            <div>Values</div>
            <div>Category</div>
            <div className="text-right">Actions</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {paginated.map(attr => {
              const vals = attr.product_attribute_values
              const isAdding = addingValueFor === attr.id

              return (
                <div key={attr.id} className="grid grid-cols-[2fr_3fr_1.5fr_120px] gap-4 items-start px-5 py-4 hover:bg-gray-50/60 transition-colors">

                  {/* Attribute name */}
                  <div className="flex items-center gap-2.5 min-h-[32px]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100">
                      <Tag className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-gray-900 leading-tight">{attr.name}</span>
                      {attr.is_default && (
                        <span className="mt-0.5 inline-block w-fit rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Default</span>
                      )}
                    </div>
                  </div>

                  {/* Values — inline pills + add input */}
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                    {vals.length === 0 && !isAdding && (
                      <span className="text-xs text-gray-400 italic">No values</span>
                    )}
                    {vals.map(v => (
                      <span key={v.id}
                        className="group inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700 shadow-sm"
                      >
                        {v.value}
                        <button
                          onClick={() => deleteValue(v.id)}
                          className="ml-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {isAdding ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Input
                          autoFocus
                          placeholder="e.g. Red"
                          value={newValueText}
                          onChange={e => setNewValueText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') addValue(attr.id)
                            if (e.key === 'Escape') { setAddingValueFor(null); setNewValueText('') }
                          }}
                          className="h-7 w-32 text-xs"
                        />
                        <Button size="sm" className="h-7 text-xs px-2" onClick={() => addValue(attr.id)} disabled={!newValueText.trim()}>Add</Button>
                        <button onClick={() => { setAddingValueFor(null); setNewValueText('') }} className="text-gray-400 hover:text-gray-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingValueFor(attr.id); setNewValueText('') }}
                        className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 hover:border-brand-teal hover:text-brand-teal transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    )}
                  </div>

                  {/* Category */}
                  <div className="flex items-center min-h-[32px]">
                    {attr.categoryName ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal/10 border border-brand-teal/20 px-2.5 py-1 text-xs font-medium text-brand-teal">
                        <Layers className="h-3 w-3 text-brand-teal" />{attr.categoryName}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1 min-h-[32px]">
                    <button onClick={() => openEdit(attr)}
                      className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteAttr(attr)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-5 py-3">
            <p className="text-xs text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} attribute{filtered.length !== 1 ? 's' : ''}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >Previous</button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} onClick={() => setPage(i)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      page === i ? 'border-brand-teal bg-brand-teal text-white' : 'border-gray-200 text-gray-600 hover:bg-white'
                    }`}
                  >{i + 1}</button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >Next</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal open={attrModal} onClose={() => setAttrModal(false)} title={editAttr ? 'Edit Attribute' : 'New Attribute'}>
        <div className="space-y-4">
          <Input label="Attribute Name" autoFocus placeholder="e.g. Color, Size, Material"
            value={attrName} onChange={e => setAttrName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveAttribute() }}
          />
          <Select
            label="Category (optional)"
            value={attrCatId}
            onValueChange={setAttrCatId}
            options={[
              { value: '', label: 'No category' },
              ...categories.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
          {categories.length === 0 && (
            <p className="text-xs text-gray-400">
              No categories yet.{' '}
              <Link href="/inventory/categories" className="text-brand-teal underline">Create one first.</Link>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAttrModal(false)}>Cancel</Button>
            <Button onClick={saveAttribute} disabled={attrSaving || !attrName.trim()}>
              {attrSaving ? 'Saving…' : editAttr ? 'Save Changes' : 'Create Attribute'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteAttr} onClose={() => setDeleteAttr(null)} title="Delete Attribute">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{deleteAttr?.name}</strong>? This will remove all its values.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteAttr(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteAttr}>Delete Attribute</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
