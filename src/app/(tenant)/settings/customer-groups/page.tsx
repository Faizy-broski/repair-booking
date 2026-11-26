'use client'
import { useState, useEffect, useCallback } from 'react'
import { confirmToast } from '@/lib/confirm-toast'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/ui-kit'
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
    if (!await confirmToast('Delete this group? Customers in this group will be ungrouped.', 'Delete')) return
    await fetch(`/api/customer-groups/${id}`, { method: 'DELETE' })
    fetchGroups()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Groups"
        description="Segment customers for pricing and billing"
        actions={
          <Button onClick={() => openModal()}>
            <Plus className="h-4 w-4" /> New Group
          </Button>
        }
      />

      <div className="divide-y divide-outline-variant overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
        {groups.length === 0 && (
          <EmptyState icon={Users} title="No customer groups yet." bordered={false} />
        )}
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-on-surface">{g.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {g.discount_percent > 0 && (
                    <span className="text-xs text-emerald-600">{g.discount_percent}% discount</span>
                  )}
                  {g.third_party_billing_enabled && (
                    <Badge variant="warning">3rd-party billing</Badge>
                  )}
                  {g.net_payment_days > 0 && (
                    <span className="text-xs text-on-surface-variant">Net {g.net_payment_days}</span>
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
              className="h-4 w-4 rounded accent-primary"
            />
            Third-party billing enabled
          </label>

          {form.third_party_billing_enabled && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
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
