'use client'
import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Layers, Search, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { InventoryNav } from '@/components/inventory/inventory-nav'

interface Category { id: string; name: string; parent_id: string | null }

export default function CategoriesPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')

  const [modal, setModal]         = useState(false)
  const [editCat, setEditCat]     = useState<Category | null>(null)
  const [catName, setCatName]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [deleteCat, setDeleteCat] = useState<Category | null>(null)

  async function fetchCategories() {
    setLoading(true)
    const res  = await fetch('/api/categories')
    const json = await res.json()
    setCategories(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCategories() }, [])

  const filtered = categories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() { setEditCat(null); setCatName(''); setModal(true) }
  function openEdit(c: Category) { setEditCat(c); setCatName(c.name); setModal(true) }

  async function save() {
    if (!catName.trim()) return
    setSaving(true)
    if (editCat) {
      await fetch(`/api/categories/${editCat.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: catName.trim() }),
      })
    } else {
      await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: catName.trim() }),
      })
    }
    setSaving(false); setModal(false); fetchCategories()
  }

  async function confirmDelete() {
    if (!deleteCat) return
    await fetch(`/api/categories/${deleteCat.id}`, { method: 'DELETE' })
    setDeleteCat(null); fetchCategories()
  }

  return (
    <div className="space-y-4">
      <InventoryNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5" strokeWidth={3} />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Categories</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Organise products into categories. Assign attributes to a category when creating them under{' '}
              <Link href="/inventory/attributes" className="text-brand-teal underline">Attributes</Link>.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Category</Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search categories..."
          className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <Layers className="mx-auto h-8 w-8 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">
            {search ? `No categories matching "${search}"` : 'No categories yet'}
          </p>
          {!search && (
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add First Category
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          {filtered.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-teal/10 shrink-0">
                <Layers className="h-4 w-4 text-brand-teal" />
              </div>
              <span className="flex-1 text-sm font-medium text-gray-900">{cat.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(cat)}
                  className="rounded p-1.5 text-blue-500 hover:bg-blue-50 transition-colors" title="Rename">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setDeleteCat(cat)}
                  className="rounded p-1.5 text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400">{filtered.length} categor{filtered.length === 1 ? 'y' : 'ies'}</p>
      )}

      {/* Create / Edit modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editCat ? 'Edit Category' : 'New Category'}>
        <div className="space-y-4">
          <Input
            label="Category Name"
            autoFocus
            placeholder="e.g. Shoes, Electronics, Clothing"
            value={catName}
            onChange={e => setCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !catName.trim()}>
              {saving ? 'Saving…' : editCat ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteCat} onClose={() => setDeleteCat(null)} title="Delete Category">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{deleteCat?.name}</strong>?
            Products assigned to this category will become uncategorised.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteCat(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete Category</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
