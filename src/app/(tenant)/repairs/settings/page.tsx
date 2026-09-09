'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmModal } from '@/components/ui/confirm-modal'

type Tab = 'status' | 'faults'

interface CustomStatus {
  id: string
  name: string
  color: string
  sort_order: number
  created_at: string
  is_terminal: boolean
}

interface Fault {
  id: string
  name: string
  sort_order: number
  created_at: string
}

const PRESET_COLORS = [
  '#09d6f1', '#2a2a2c', '#008000', '#1a388d', '#00aaeb',
  '#12bced', '#d92629', '#f59e0b', '#8b5cf6', '#ec4899',
  '#10b981', '#6366f1', '#f97316', '#06b6d4', '#84cc16',
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
            style={{ backgroundColor: c, borderColor: value === c ? '#1e40af' : 'transparent' }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg border border-outline shrink-0" style={{ backgroundColor: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-16 cursor-pointer rounded border border-outline p-0.5"
        />
        <span className="text-xs text-on-surface-variant font-mono">{value}</span>
      </div>
    </div>
  )
}

export default function RepairSettingsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('status')

  // ── Statuses ──────────────────────────────────────────────────
  const queryClient = useQueryClient()

  // ── Statuses ──────────────────────────────────────────────────
  const [addingStatus, setAddingStatus] = useState(false)
  const [newStatusName, setNewStatusName] = useState('')
  const [newStatusColor, setNewStatusColor] = useState('#09d6f1')
  const [newStatusIsTerminal, setNewStatusIsTerminal] = useState(false)
  const [editingStatus, setEditingStatus] = useState<CustomStatus | null>(null)
  const [editStatusName, setEditStatusName] = useState('')
  const [editStatusColor, setEditStatusColor] = useState('')
  const [editStatusIsTerminal, setEditStatusIsTerminal] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)

  // ── Faults ────────────────────────────────────────────────────
  const [addingFault, setAddingFault] = useState(false)
  const [newFaultName, setNewFaultName] = useState('')
  const [editingFault, setEditingFault] = useState<Fault | null>(null)
  const [editFaultName, setEditFaultName] = useState('')
  const [faultSaving, setFaultSaving] = useState(false)

  // ── Confirmation ─────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, name: string, type: 'status' | 'fault' } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)

  const { data: statuses = [], isLoading: statusLoading } = useQuery<CustomStatus[]>({
    queryKey: ['repair-custom-statuses'],
    queryFn: async () => {
      const res = await fetch('/api/repairs/custom-statuses')
      const json = await res.json()
      return json.data ?? []
    },
    staleTime: 60_000,
  })

  const { data: faults = [], isLoading: faultLoading } = useQuery<Fault[]>({
    queryKey: ['repair-faults'],
    queryFn: async () => {
      const res = await fetch('/api/repairs/faults')
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !statusLoading,
    staleTime: 60_000,
  })

  // ── Status CRUD ───────────────────────────────────────────────
  async function createStatus() {
    if (!newStatusName.trim()) return
    setStatusSaving(true)
    await fetch('/api/repairs/custom-statuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStatusName.trim(), color: newStatusColor, sort_order: statuses.length, is_terminal: newStatusIsTerminal }),
    })
    setNewStatusName('')
    setNewStatusColor('#09d6f1')
    setNewStatusIsTerminal(false)
    setAddingStatus(false)
    setStatusSaving(false)
    queryClient.invalidateQueries({ queryKey: ['repair-custom-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['repairs-meta'] })
  }

  async function updateStatus() {
    if (!editingStatus || !editStatusName.trim()) return
    setStatusSaving(true)
    await fetch(`/api/repairs/custom-statuses/${editingStatus.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editStatusName.trim(), color: editStatusColor, is_terminal: editStatusIsTerminal }),
    })
    setEditingStatus(null)
    setStatusSaving(false)
    queryClient.invalidateQueries({ queryKey: ['repair-custom-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['repairs-meta'] })
  }

  async function deleteStatus(id: string, name: string) {
    setConfirmDelete({ id, name, type: 'status' })
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setIsDeleting(true)
    const endpoint = confirmDelete.type === 'status' ? 'custom-statuses' : 'faults'
    const res = await fetch(`/api/repairs/${endpoint}/${confirmDelete.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${confirmDelete.type === 'status' ? 'Status' : 'Fault'} "${confirmDelete.name}" deleted.`)
      if (confirmDelete.type === 'status') {
        queryClient.invalidateQueries({ queryKey: ['repair-custom-statuses'] })
        queryClient.invalidateQueries({ queryKey: ['repairs-meta'] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['repair-faults'] })
        queryClient.invalidateQueries({ queryKey: ['repairs-meta'] })
      }
      setConfirmDelete(null)
    } else {
      toast.error(`Failed to delete ${confirmDelete.type}.`)
    }
    setIsDeleting(false)
  }

  function startEditStatus(s: CustomStatus) {
    setEditingStatus(s)
    setEditStatusName(s.name)
    setEditStatusColor(s.color)
    setEditStatusIsTerminal(s.is_terminal)
    setAddingStatus(false)
  }

  async function seedDefaults() {
    setIsSeeding(true)
    try {
      const res = await fetch('/api/repairs/seed-defaults', { method: 'POST' })
      if (res.ok) {
        toast.success('Default settings seeded successfully')
        queryClient.invalidateQueries({ queryKey: ['repair-custom-statuses'] })
        queryClient.invalidateQueries({ queryKey: ['repair-faults'] })
        queryClient.invalidateQueries({ queryKey: ['repairs-meta'] })
      } else {
        toast.error('Failed to seed defaults')
      }
    } catch (err) {
      toast.error('An error occurred while seeding defaults')
    } finally {
      setIsSeeding(false)
    }
  }

  // ── Fault CRUD ────────────────────────────────────────────────
  async function createFault() {
    if (!newFaultName.trim()) return
    setFaultSaving(true)
    await fetch('/api/repairs/faults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFaultName.trim(), sort_order: faults.length }),
    })
    setNewFaultName('')
    setAddingFault(false)
    setFaultSaving(false)
    queryClient.invalidateQueries({ queryKey: ['repair-faults'] })
    queryClient.invalidateQueries({ queryKey: ['repairs-meta'] })
  }

  async function updateFault() {
    if (!editingFault || !editFaultName.trim()) return
    setFaultSaving(true)
    await fetch(`/api/repairs/faults/${editingFault.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editFaultName.trim() }),
    })
    setEditingFault(null)
    setFaultSaving(false)
    queryClient.invalidateQueries({ queryKey: ['repair-faults'] })
    queryClient.invalidateQueries({ queryKey: ['repairs-meta'] })
  }

  async function deleteFault(id: string, name: string) {
    setConfirmDelete({ id, name, type: 'fault' })
  }

  function startEditFault(f: Fault) {
    setEditingFault(f)
    setEditFaultName(f.name)
    setAddingFault(false)
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center gap-2 pb-1">
        <button
          onClick={() => router.push('/repairs')}
          className="flex items-center gap-1.5 text-lg font-bold text-on-surface hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Repairs
        </button>
        <span className="text-outline">/</span>
        <span className="text-lg font-bold text-on-surface-variant">Settings</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-outline-variant mt-2">
        {[
          { id: 'status' as Tab, label: 'Status' },
          { id: 'faults' as Tab, label: 'Faults' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-on-surface-variant hover:text-on-surface-variant'
            }`}
          >
            {tab === t.id && <span className="h-2 w-2 rounded-full bg-blue-600 inline-block" />}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Status Tab ── */}
      {tab === 'status' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
              Manage Statuses
              {statusLoading && <Loader2 className="h-4 w-4 animate-spin text-outline" />}
            </h2>
            <div className="flex gap-2">
              {statuses.length === 0 && !statusLoading && (
                <Button variant="outline" onClick={seedDefaults} loading={isSeeding}>
                  Seed Default Statuses
                </Button>
              )}
              <Button onClick={() => { setAddingStatus(true); setEditingStatus(null) }}>
                <Plus className="h-4 w-4" /> Add Status
              </Button>
            </div>
          </div>

          {/* Add form */}
          {addingStatus && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800">New Status</p>
              <Input
                label="Status Name"
                placeholder="e.g. Warranty, Booked..."
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                autoFocus
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-on-surface-variant">Color</label>
                <ColorPicker value={newStatusColor} onChange={setNewStatusColor} />
              </div>
              <label className="flex items-center gap-2 text-sm text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={newStatusIsTerminal}
                  onChange={(e) => setNewStatusIsTerminal(e.target.checked)}
                  className="h-4 w-4 rounded border-outline"
                />
                Job Finished? (counts as completed revenue in Profit &amp; Loss)
              </label>
              <div className="flex gap-2">
                <Button size="sm" onClick={createStatus} loading={statusSaving} disabled={!newStatusName.trim()}>
                  <Check className="h-3.5 w-3.5" /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddingStatus(false)}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant w-16">Sr#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Status Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Color</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant w-32">Job Finished?</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant w-40">Action</th>
                </tr>
              </thead>
              <tbody>
                {statusLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-t border-outline-variant">
                      {[1, 2, 3, 4, 5].map((j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-surface-container" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : statuses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-outline">
                      No statuses yet. Click "Add Status" to create one.
                    </td>
                  </tr>
                ) : (
                  statuses.map((s, i) => (
                    <tr key={s.id} className={`border-t border-outline-variant ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-container-low/60'}`}>
                      <td className="px-4 py-3 text-on-surface-variant">{i + 1}</td>
                      <td className="px-4 py-3">
                        {editingStatus?.id === s.id ? (
                          <input
                            autoFocus
                            value={editStatusName}
                            onChange={(e) => setEditStatusName(e.target.value)}
                            className="h-8 w-full rounded-lg border border-blue-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        ) : (
                          <span className="font-medium text-on-surface">{s.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingStatus?.id === s.id ? (
                          <ColorPicker value={editStatusColor} onChange={setEditStatusColor} />
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
                            style={{ backgroundColor: s.color }}
                          >
                            {s.color}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingStatus?.id === s.id ? (
                          <input
                            type="checkbox"
                            checked={editStatusIsTerminal}
                            onChange={(e) => setEditStatusIsTerminal(e.target.checked)}
                            className="h-4 w-4 rounded border-outline"
                          />
                        ) : s.is_terminal ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-600">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-surface-container-low border border-outline-variant px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingStatus?.id === s.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={updateStatus}
                              disabled={statusSaving}
                              className="flex items-center gap-1 rounded-md bg-green-50 border border-green-200 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-100 transition-colors"
                            >
                              <Check className="h-3 w-3" /> Save
                            </button>
                            <button
                              onClick={() => setEditingStatus(null)}
                              className="flex items-center gap-1 rounded-md bg-surface-container-low border border-outline-variant px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
                            >
                              <X className="h-3 w-3" /> Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditStatus(s)}
                              className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            <button
                              onClick={() => deleteStatus(s.id, s.name)}
                              className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {statuses.length > 0 && (
            <p className="text-xs text-outline">Showing 1 to {statuses.length} of {statuses.length} entries</p>
          )}
        </div>
      )}

      {tab === 'faults' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
              Manage Faults
              {faultLoading && <Loader2 className="h-4 w-4 animate-spin text-outline" />}
            </h2>
            <div className="flex gap-2">
              {faults.length === 0 && !faultLoading && (
                <Button variant="outline" onClick={seedDefaults} loading={isSeeding}>
                  Seed Default Faults
                </Button>
              )}
              <Button onClick={() => { setAddingFault(true); setEditingFault(null) }}>
                <Plus className="h-4 w-4" /> Add Fault
              </Button>
            </div>
          </div>

          {/* Add form */}
          {addingFault && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800">New Fault</p>
              <Input
                label="Fault Name"
                placeholder="e.g. Screen Crack, Battery Issue..."
                value={newFaultName}
                onChange={(e) => setNewFaultName(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={createFault} loading={faultSaving} disabled={!newFaultName.trim()}>
                  <Check className="h-3.5 w-3.5" /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddingFault(false)}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant w-16">Sr#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Fault Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant w-40">Action</th>
                </tr>
              </thead>
              <tbody>
                {faultLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-t border-outline-variant">
                      {[1, 2, 3].map((j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-surface-container" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : faults.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-outline">
                      No faults yet. Click "Add Fault" to create one.
                    </td>
                  </tr>
                ) : (
                  faults.map((f, i) => (
                    <tr key={f.id} className={`border-t border-outline-variant ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-container-low/60'}`}>
                      <td className="px-4 py-3 text-on-surface-variant">{i + 1}</td>
                      <td className="px-4 py-3">
                        {editingFault?.id === f.id ? (
                          <input
                            autoFocus
                            value={editFaultName}
                            onChange={(e) => setEditFaultName(e.target.value)}
                            className="h-8 w-full max-w-sm rounded-lg border border-blue-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        ) : (
                          <span className="font-medium text-on-surface">{f.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingFault?.id === f.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={updateFault}
                              disabled={faultSaving}
                              className="flex items-center gap-1 rounded-md bg-green-50 border border-green-200 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-100 transition-colors"
                            >
                              <Check className="h-3 w-3" /> Save
                            </button>
                            <button
                              onClick={() => setEditingFault(null)}
                              className="flex items-center gap-1 rounded-md bg-surface-container-low border border-outline-variant px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
                            >
                              <X className="h-3 w-3" /> Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditFault(f)}
                              className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            <button
                              onClick={() => deleteFault(f.id, f.name)}
                              className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {faults.length > 0 && (
            <p className="text-xs text-outline">Showing 1 to {faults.length} of {faults.length} entries</p>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete ${confirmDelete?.type === 'status' ? 'Status' : 'Fault'}?`}
        description={confirmDelete ? `Are you sure you want to delete "${confirmDelete.name}"? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        loading={isDeleting}
      />

    </div>
  )
}
