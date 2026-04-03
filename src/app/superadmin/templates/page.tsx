'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Upload, Layers, ChevronDown, Eye } from 'lucide-react'
import type { ModuleConfigTemplate } from '@/types/module-config'
import type { ModuleName, TemplatePushDiffItem } from '@/types/module-config'
import { MODULES } from '@/backend/config/constants'

const MODULE_LABELS: Record<ModuleName, string> = {
  pos: 'POS', inventory: 'Inventory', repairs: 'Repairs', customers: 'Customers',
  appointments: 'Appointments', expenses: 'Expenses', employees: 'Employees',
  reports: 'Reports', messages: 'Messages', invoices: 'Invoices',
  gift_cards: 'Gift Cards', google_reviews: 'Google Reviews', phone: 'Phone',
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ModuleConfigTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState<ModuleName | ''>('')
  const [showCreate, setShowCreate] = useState(false)
  const [pushTarget, setPushTarget] = useState<ModuleConfigTemplate | null>(null)
  const [pushMode, setPushMode] = useState<'force_override' | 'merge_missing_only'>('merge_missing_only')
  const [pushBusy, setPushBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Diff preview
  const [diffData, setDiffData] = useState<TemplatePushDiffItem[] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffCount, setDiffCount] = useState(0)

  const [form, setForm] = useState({ module: '' as ModuleName | '', name: '', description: '', settings: '{}' })
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = moduleFilter ? `?module=${moduleFilter}` : ''
    const res = await fetch(`/api/admin/module-templates${qs}`)
    const json = await res.json()
    setTemplates(json.data ?? [])
    setLoading(false)
  }, [moduleFilter])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.module) return setFormError('Select a module')
    if (!form.name.trim()) return setFormError('Name is required')
    let settings: object
    try { settings = JSON.parse(form.settings) } catch { return setFormError('Settings must be valid JSON') }

    setFormBusy(true)
    try {
      const res = await fetch('/api/admin/module-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: form.module, name: form.name, description: form.description, settings }),
      })
      if (!res.ok) throw new Error((await res.json()).error?.message ?? 'Failed')
      setShowCreate(false)
      setForm({ module: '', name: '', description: '', settings: '{}' })
      load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setFormBusy(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/module-templates/${id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    load()
  }

  async function handlePush() {
    if (!pushTarget) return
    setPushBusy(true)
    try {
      await fetch(`/api/admin/module-templates/${pushTarget.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_ids: 'all', push_mode: pushMode }),
      })
      setPushTarget(null)
      setDiffData(null)
    } finally {
      setPushBusy(false)
    }
  }

  async function loadDiffPreview() {
    if (!pushTarget) return
    setDiffLoading(true)
    try {
      const res = await fetch(`/api/admin/module-templates/${pushTarget.id}/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_ids: 'all', push_mode: pushMode }),
      })
      const json = await res.json()
      setDiffData(json.data?.diffs ?? [])
      setDiffCount(json.data?.affected_count ?? 0)
    } finally {
      setDiffLoading(false)
    }
  }

  const grouped = MODULES.reduce((acc, mod) => {
    acc[mod] = templates.filter((t) => t.module === mod)
    return acc
  }, {} as Record<ModuleName, ModuleConfigTemplate[]>)

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Module Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create shared configuration presets for modules. Assign them to businesses to enforce consistency.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-500">Filter by module:</label>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value as ModuleName | '')}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        >
          <option value="">All modules</option>
          {MODULES.map((m) => (
            <option key={m} value={m}>{MODULE_LABELS[m]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-gray-100 bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {MODULES.filter((m) => !moduleFilter || m === moduleFilter).map((mod) => {
            const rows = grouped[mod]
            if (!rows.length) return null
            return (
              <div key={mod}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {MODULE_LABELS[mod]}
                </h3>
                <div className="space-y-2">
                  {rows.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
                    >
                      <Layers className="h-4 w-4 shrink-0 text-blue-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{t.name}</span>
                          {t.is_default && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                              default
                            </span>
                          )}
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            v{t.version}
                          </span>
                        </div>
                        {t.description && (
                          <p className="mt-0.5 text-xs text-gray-500 truncate">{t.description}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => setPushTarget(t)}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <Upload className="h-3 w-3" /> Push
                        </button>
                        <button
                          onClick={() => setDeleteTarget(t.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {templates.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
              <Layers className="h-10 w-10" />
              <p className="text-sm">No templates yet. Create one to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">New Module Template</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Module</label>
                <select
                  value={form.module}
                  onChange={(e) => setForm({ ...form, module: e.target.value as ModuleName })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Select module…</option>
                  {MODULES.map((m) => (
                    <option key={m} value={m}>{MODULE_LABELS[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Standard Repair Shop"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Settings (JSON)
                </label>
                <textarea
                  value={form.settings}
                  onChange={(e) => setForm({ ...form, settings: e.target.value })}
                  rows={6}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                />
              </div>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formBusy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {formBusy ? 'Creating…' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Push modal */}
      {pushTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto">
            <h2 className="mb-1 text-lg font-semibold">Push Template to All Businesses</h2>
            <p className="mb-4 text-sm text-gray-500">
              Pushing <strong>{pushTarget.name}</strong> (v{pushTarget.version}) will update all businesses
              that currently use this template.
            </p>
            <div className="mb-4 space-y-2">
              <label className="text-sm font-medium text-gray-700">Push mode</label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  checked={pushMode === 'merge_missing_only'}
                  onChange={() => { setPushMode('merge_missing_only'); setDiffData(null) }}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Merge (safe)</p>
                  <p className="text-xs text-gray-500">
                    Only applies template fields that businesses have not customised. Existing overrides are kept.
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-red-100 bg-red-50 p-3 hover:bg-red-100">
                <input
                  type="radio"
                  checked={pushMode === 'force_override'}
                  onChange={() => { setPushMode('force_override'); setDiffData(null) }}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-red-700">Force override (destructive)</p>
                  <p className="text-xs text-red-500">
                    Clears all business customisations and replaces with the template. Cannot be undone.
                  </p>
                </div>
              </label>
            </div>

            {/* Diff Preview */}
            <div className="mb-4">
              <button
                onClick={loadDiffPreview}
                disabled={diffLoading}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                <Eye className="h-4 w-4" />
                {diffLoading ? 'Loading preview…' : 'Preview Changes'}
              </button>

              {diffData && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-60 overflow-y-auto">
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    {diffCount} business{diffCount !== 1 ? 'es' : ''} will be affected
                  </p>
                  {diffData.length === 0 ? (
                    <p className="text-xs text-gray-400">No changes detected — all businesses are up to date.</p>
                  ) : (
                    <div className="space-y-3">
                      {diffData.slice(0, 20).map((d) => (
                        <div key={d.business_id} className="rounded-md border border-gray-200 bg-white p-2">
                          <p className="text-xs font-medium text-gray-700">{d.business_name}</p>
                          <div className="mt-1 space-y-0.5">
                            {d.changes.map((c) => (
                              <div key={c.field} className="flex items-center gap-2 text-[10px]">
                                <span className="font-mono text-gray-500">{c.field}:</span>
                                <span className="text-red-500 line-through">{JSON.stringify(c.current_value)}</span>
                                <span className="text-green-600">{JSON.stringify(c.new_value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {diffData.length > 20 && (
                        <p className="text-xs text-gray-400">...and {diffData.length - 20} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setPushTarget(null); setDiffData(null) }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handlePush}
                disabled={pushBusy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {pushBusy ? 'Pushing…' : 'Push to All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold">Delete template?</h2>
            <p className="mb-4 text-sm text-gray-500">
              Businesses linked to this template will be detached (their overrides are kept).
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">Cancel</button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
