'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'

interface CustomerGroup {
  id: string; name: string; discount_percent: number
  third_party_billing_enabled: boolean; billing_email: string | null
  net_payment_days: number
}

const emptyForm = {
  name: '', discount_percent: 0, third_party_billing_enabled: false,
  billing_contact_name: '', billing_email: '', billing_phone: '', net_payment_days: 0,
}

export default function CustomerGroupsPage() {
  const { activeBranch } = useAuthStore()
  const [groups,  setGroups]  = useState<CustomerGroup[]>([])
  const [modal,   setModal]   = useState<{ open: boolean; editing: CustomerGroup | null }>({ open: false, editing: null })
  const [form,    setForm]    = useState(emptyForm)
  const [saving,  setSaving]  = useState(false)

  const fetchGroups = useCallback(async () => {
    const res  = await fetch('/api/customer-groups')
    const json = await res.json()
    setGroups(json.data ?? [])
  }, [])

  useEffect(() => { if (activeBranch) fetchGroups() }, [activeBranch, fetchGroups])

  function openModal(editing: CustomerGroup | null = null) {
    setForm(editing
      ? { ...emptyForm, ...editing, billing_contact_name: '', billing_email: editing.billing_email ?? '', billing_phone: '' }
      : emptyForm
    )
    setModal({ open: true, editing })
  }

  async function save() {
    setSaving(true)
    const { editing } = modal
    const url    = editing ? `/api/customer-groups/${editing.id}` : '/api/customer-groups'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, billing_email: form.billing_email || null }),
    })
    setModal({ open: false, editing: null })
    fetchGroups()
    setSaving(false)
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this group? Customers in this group will be ungrouped.')) return
    await fetch(`/api/customer-groups/${id}`, { method: 'DELETE' })
    fetchGroups()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customer Groups</h1>
          <p className="text-sm text-gray-500 mt-0.5">Segment customers for pricing and billing</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="h-4 w-4" /> New Group
        </Button>
      </div>

      <div className="divide-y rounded-xl border border-gray-200 bg-white">
        {groups.length === 0 && (
          <div className="py-16 text-center">
            <Users className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">No customer groups yet.</p>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
                <Users className="h-4 w-4 text-indigo-600" />
              </div>
              <div>
                <p className="font-medium text-gray-800">{g.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {g.discount_percent > 0 && (
                    <span className="text-xs text-green-600">{g.discount_percent}% discount</span>
                  )}
                  {g.third_party_billing_enabled && (
                    <Badge variant="warning">3rd-party billing</Badge>
                  )}
                  {g.net_payment_days > 0 && (
                    <span className="text-xs text-gray-400">Net {g.net_payment_days}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => openModal(g)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteGroup(g.id)}>
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        title={modal.editing ? 'Edit Group' : 'New Customer Group'}
        size="sm"
      >
        <div className="space-y-3">
          <Input
            label="Group Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Discount %"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={form.discount_percent}
            onChange={(e) => setForm((f) => ({ ...f, discount_percent: Number(e.target.value) }))}
          />
          <Input
            label="Net Payment Days"
            type="number"
            min="0"
            value={form.net_payment_days}
            onChange={(e) => setForm((f) => ({ ...f, net_payment_days: Number(e.target.value) }))}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.third_party_billing_enabled}
              onChange={(e) => setForm((f) => ({ ...f, third_party_billing_enabled: e.target.checked }))}
              className="rounded"
            />
            Third-party billing enabled
          </label>

          {form.third_party_billing_enabled && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 space-y-2">
              <Input
                label="Billing Contact Name"
                value={form.billing_contact_name}
                onChange={(e) => setForm((f) => ({ ...f, billing_contact_name: e.target.value }))}
              />
              <Input
                label="Billing Email"
                type="email"
                value={form.billing_email}
                onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))}
              />
              <Input
                label="Billing Phone"
                value={form.billing_phone}
                onChange={(e) => setForm((f) => ({ ...f, billing_phone: e.target.value }))}
              />
            </div>
          )}

          <Button className="w-full" onClick={save} loading={saving} disabled={!form.name.trim()}>
            Save Group
          </Button>
        </div>
      </Modal>
    </div>
  )
}
