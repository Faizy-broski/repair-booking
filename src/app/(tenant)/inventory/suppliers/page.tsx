'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Truck, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'

interface Supplier {
  id: string; name: string; contact_person: string | null
  email: string | null; phone: string | null; city: string | null
  payment_terms_days: number; currency: string; is_active: boolean
}

const emptyForm = {
  name: '', contact_person: '', email: '', phone: '', mobile: '',
  address: '', city: '', country: '', tax_id: '', notes: '',
  payment_terms_days: 30, currency: 'GBP', is_active: true,
}

export default function SuppliersPage() {
  const { activeBranch } = useAuthStore()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search,    setSearch]    = useState('')
  const [modal,     setModal]     = useState<{ open: boolean; editing: Supplier | null }>({ open: false, editing: null })
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)

  const fetchSuppliers = useCallback(async () => {
    const res  = await fetch('/api/suppliers')
    const json = await res.json()
    setSuppliers(json.data ?? [])
  }, [])

  useEffect(() => { if (activeBranch) fetchSuppliers() }, [activeBranch, fetchSuppliers])

  const filtered = suppliers.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  )

  function openModal(editing: Supplier | null = null) {
    setForm(editing ? { ...emptyForm, ...editing, email: editing.email ?? '', phone: editing.phone ?? '', contact_person: editing.contact_person ?? '', city: editing.city ?? '' } : emptyForm)
    setModal({ open: true, editing })
  }

  async function save() {
    setSaving(true)
    const { editing } = modal
    const url    = editing ? `/api/suppliers/${editing.id}` : '/api/suppliers'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, email: form.email || null }),
    })
    setModal({ open: false, editing: null })
    fetchSuppliers()
    setSaving(false)
  }

  async function deleteSupplier(id: string) {
    if (!confirm('Delete this supplier?')) return
    await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
    fetchSuppliers()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500">{suppliers.length} suppliers</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search suppliers..."
          className="h-9 w-full rounded-lg border border-gray-300 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="divide-y rounded-xl border border-gray-200 bg-white">
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Truck className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">No suppliers found.</p>
          </div>
        )}
        {filtered.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                <Truck className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-800">{s.name}</p>
                  {!s.is_active && <Badge variant="default">Inactive</Badge>}
                </div>
                <p className="text-xs text-gray-400">
                  {[s.contact_person, s.email, s.phone, s.city].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">Net {s.payment_terms_days}d · {s.currency}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openModal(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteSupplier(s.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        title={modal.editing ? 'Edit Supplier' : 'New Supplier'}
        size="sm"
      >
        <div className="space-y-3">
          <Input label="Company Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Contact Person" value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Email"  type="email" value={form.email}  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <Input label="Phone"  value={form.phone}  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="City"    value={form.city}    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            <Input label="Country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Payment Terms (days)" type="number" min="0" value={form.payment_terms_days} onChange={(e) => setForm((f) => ({ ...f, payment_terms_days: Number(e.target.value) }))} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
              <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="AED">AED</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
            Active
          </label>
          <Button className="w-full" onClick={save} loading={saving} disabled={!form.name.trim()}>Save Supplier</Button>
        </div>
      </Modal>
    </div>
  )
}
