'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Play, Store, Wrench, ShoppingBag,
  Scissors, Coffee, Monitor, Package, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { MODULES } from '@/backend/config/constants'
import type { BusinessVerticalTemplate, ModuleName } from '@/types/module-config'

const MODULE_LABELS: Record<string, string> = {
  pos: 'POS', inventory: 'Inventory', repairs: 'Repairs', customers: 'Customers',
  appointments: 'Appointments', expenses: 'Expenses', employees: 'Employees',
  reports: 'Reports', messages: 'Messages', invoices: 'Invoices',
  gift_cards: 'Gift Cards', google_reviews: 'Google Reviews', phone: 'Phone',
}

const ICON_MAP: Record<string, typeof Store> = {
  store: Store, wrench: Wrench, 'shopping-bag': ShoppingBag,
  scissors: Scissors, coffee: Coffee, monitor: Monitor, package: Package,
}


const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  icon: z.string().optional(),
  sort_order: z.coerce.number().int().optional(),
})

type FormData = z.infer<typeof schema>

export default function VerticalTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<BusinessVerticalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editItem, setEditItem] = useState<BusinessVerticalTemplate | null>(null)
  const [modulesEnabled, setModulesEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULES.map((m) => [m, false]))
  )
  const [moduleSettings, setModuleSettings] = useState('{}')
  const [settingsError, setSettingsError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Apply modal
  const [applyTarget, setApplyTarget] = useState<BusinessVerticalTemplate | null>(null)
  const [applyBusinessId, setApplyBusinessId] = useState('')
  const [applyMode, setApplyMode] = useState<'initial' | 'reapply' | 'merge'>('initial')
  const [applyBusy, setApplyBusy] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/vertical-templates')
    const json = await res.json()
    setTemplates(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditItem(null)
    reset({ name: '', slug: '', description: '', icon: 'store', sort_order: 0 })
    setModulesEnabled(Object.fromEntries(MODULES.map((m) => [m, false])))
    setModuleSettings('{}')
    setSettingsError('')
    setSheetOpen(true)
  }

  function openEdit(t: BusinessVerticalTemplate) {
    setEditItem(t)
    reset({ name: t.name, slug: t.slug, description: t.description ?? '', icon: t.icon, sort_order: t.sort_order })
    setModulesEnabled(Object.fromEntries(MODULES.map((m) => [m, (t.modules_enabled ?? []).includes(m as ModuleName)])))
    setModuleSettings(JSON.stringify(t.module_settings ?? {}, null, 2))
    setSettingsError('')
    setSheetOpen(true)
  }

  async function onSubmit(data: FormData) {
    setSettingsError('')
    let settings: Record<string, unknown>
    try { settings = JSON.parse(moduleSettings) } catch { setSettingsError('Invalid JSON'); return }

    const enabledModules = MODULES.filter((m) => modulesEnabled[m])
    const payload = { ...data, modules_enabled: enabledModules, module_settings: settings }

    const res = editItem
      ? await fetch(`/api/admin/vertical-templates/${editItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/admin/vertical-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

    if (res.ok) {
      setSheetOpen(false)
      reset()
      load()
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/vertical-templates/${id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    load()
  }

  async function handleApply() {
    if (!applyTarget || !applyBusinessId.trim()) return
    setApplyBusy(true)
    setApplyResult(null)
    try {
      const res = await fetch(`/api/admin/vertical-templates/${applyTarget.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: applyBusinessId, mode: applyMode }),
      })
      const json = await res.json()
      if (res.ok) {
        setApplyResult(`Applied ${json.data?.modules_applied?.length ?? 0} modules successfully`)
      } else {
        setApplyResult(`Error: ${json.error?.message ?? 'Failed'}`)
      }
    } finally {
      setApplyBusy(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Business Vertical Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pre-configured module bundles for different business types. Apply to new businesses during onboarding.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {templates.map((t) => {
            const IconComp = ICON_MAP[t.icon] ?? Store
            return (
              <div
                key={t.id}
                className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <IconComp className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{t.name}</h3>
                      <Badge variant={t.is_active ? 'success' : 'destructive'} className="text-xs">
                        {t.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">{t.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(t.modules_enabled ?? []).map((mod) => (
                        <span
                          key={mod}
                          className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                        >
                          {MODULE_LABELS[mod] ?? mod}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      {(t.modules_enabled ?? []).length} modules &middot; slug: {t.slug}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => router.push(`/superadmin/vertical-templates/${t.id}/preview`)}>
                    <Eye className="h-3 w-3" /> Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setApplyTarget(t); setApplyBusinessId(''); setApplyResult(null) }}
                  >
                    <Play className="h-3 w-3" /> Apply
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-red-500 hover:text-red-700" onClick={() => setDeleteTarget(t.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && templates.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
          <Store className="h-10 w-10" />
          <p className="text-sm">No vertical templates yet.</p>
        </div>
      )}

      {/* Create/Edit Sheet */}
      <InlineFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editItem ? `Edit ${editItem.name}` : 'New Vertical Template'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Name" required error={errors.name?.message} {...register('name')} />
          <Input label="Slug" required placeholder="repair-shop" error={errors.slug?.message} {...register('slug')} />
          <Input label="Description" {...register('description')} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Icon</label>
              <select {...register('icon')} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {Object.keys(ICON_MAP).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <Input label="Sort Order" type="number" {...register('sort_order')} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Modules Enabled</label>
            <div className="grid grid-cols-2 gap-1.5">
              {MODULES.map((mod) => (
                <label key={mod} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modulesEnabled[mod] ?? false}
                    onChange={(e) => setModulesEnabled((f) => ({ ...f, [mod]: e.target.checked }))}
                    className="rounded"
                  />
                  <span>{MODULE_LABELS[mod] ?? mod}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Default Module Settings (JSON)
            </label>
            <textarea
              value={moduleSettings}
              onChange={(e) => setModuleSettings(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
            />
            {settingsError && <p className="mt-1 text-xs text-red-600">{settingsError}</p>}
          </div>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            {editItem ? 'Update Template' : 'Create Template'}
          </Button>
        </form>
      </InlineFormSheet>

      {/* Apply modal */}
      {applyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold">Apply &quot;{applyTarget.name}&quot;</h2>
            <p className="mb-4 text-sm text-gray-500">
              This will configure {(applyTarget.modules_enabled ?? []).length} modules for the target business.
            </p>
            <div className="space-y-3">
              <Input
                label="Business ID"
                value={applyBusinessId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApplyBusinessId(e.target.value)}
                placeholder="uuid..."
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Apply Mode</label>
                <div className="space-y-1.5">
                  {([
                    { v: 'initial', label: 'Initial Setup', desc: 'Only creates missing module entries' },
                    { v: 'merge', label: 'Merge', desc: 'Fills in missing modules, keeps existing settings' },
                    { v: 'reapply', label: 'Re-apply (overwrite)', desc: 'Overwrites all modules to match template' },
                  ] as const).map((opt) => (
                    <label key={opt.v} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
                      <input
                        type="radio"
                        checked={applyMode === opt.v}
                        onChange={() => setApplyMode(opt.v)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {applyResult && (
                <p className={`rounded-lg p-2 text-sm ${applyResult.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                  {applyResult}
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setApplyTarget(null)}>Cancel</Button>
              <Button onClick={handleApply} loading={applyBusy}>Apply Template</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold">Delete vertical template?</h2>
            <p className="mb-4 text-sm text-gray-500">
              Businesses already using this template will keep their current settings.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTarget)}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
