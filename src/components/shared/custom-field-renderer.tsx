'use client'
import { useState, useEffect, useCallback } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface CustomFieldDef {
  id: string
  field_key: string
  label: string
  field_type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'boolean' | 'checkbox' | 'phone' | 'email'
  options: { choices?: string[] } | null
  is_required: boolean
  sort_order: number
  repair_category: string | null
}

interface Props {
  /** Current JSONB values (e.g. repair.custom_fields) */
  values: Record<string, unknown>
  /** Field definitions to render */
  definitions: CustomFieldDef[]
  /** Called when user saves — receives updated JSONB blob */
  onSave: (values: Record<string, unknown>) => Promise<void>
  /** Read-only mode */
  readOnly?: boolean
  /** Show save button inline (default true) */
  showSave?: boolean
}

/**
 * Renders and edits custom field values for any entity.
 * Pass field definitions + current values, receive updated values on save.
 */
export function CustomFieldRenderer({
  values,
  definitions,
  onSave,
  readOnly = false,
  showSave = true,
}: Props) {
  const [local, setLocal] = useState<Record<string, unknown>>(values ?? {})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Sync if parent values change (e.g. after reload)
  useEffect(() => { setLocal(values ?? {}); setDirty(false) }, [values])

  function set(key: string, value: unknown) {
    setLocal(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(local)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  if (definitions.length === 0) return null

  return (
    <div className="space-y-3">
      {definitions.map(field => {
        const val = local[field.field_key]
        const choices = field.options?.choices ?? []
        const isCheckbox = field.field_type === 'checkbox' || field.field_type === 'boolean'

        return (
          <div key={field.id} className={isCheckbox ? 'flex items-center gap-2' : 'space-y-1'}>
            {/* Checkbox/Boolean: label comes after */}
            {isCheckbox ? (
              <>
                <input
                  type="checkbox"
                  id={field.field_key}
                  checked={!!val}
                  disabled={readOnly}
                  onChange={e => set(field.field_key, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-teal accent-[var(--brand-teal)] disabled:opacity-60"
                />
                <label htmlFor={field.field_key} className="text-sm text-gray-700 cursor-pointer select-none">
                  {field.label}
                  {field.is_required && <span className="ml-0.5 text-red-500">*</span>}
                </label>
              </>
            ) : (
              <>
                <label className="block text-xs font-medium text-gray-600">
                  {field.label}
                  {field.is_required && <span className="ml-0.5 text-red-500">*</span>}
                </label>

                {field.field_type === 'select' ? (
                  <select
                    value={String(val ?? '')}
                    disabled={readOnly}
                    onChange={e => set(field.field_key, e.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-brand-teal focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">— Select —</option>
                    {choices.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : field.field_type === 'textarea' ? (
                  <textarea
                    rows={2}
                    value={String(val ?? '')}
                    disabled={readOnly}
                    onChange={e => set(field.field_key, e.target.value)}
                    required={field.is_required}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-teal focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                  />
                ) : (
                  <input
                    type={
                      field.field_type === 'number' ? 'number'
                      : field.field_type === 'date' ? 'date'
                      : field.field_type === 'phone' ? 'tel'
                      : field.field_type === 'email' ? 'email'
                      : 'text'
                    }
                    value={String(val ?? '')}
                    disabled={readOnly}
                    onChange={e => set(field.field_key, e.target.value)}
                    required={field.is_required}
                    className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:border-brand-teal focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                  />
                )}
              </>
            )}
          </div>
        )
      })}

      {showSave && !readOnly && dirty && (
        <Button
          size="sm"
          className="bg-brand-teal hover:bg-brand-teal-dark"
          loading={saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Custom Fields
        </Button>
      )}
    </div>
  )
}

/**
 * Hook to load field definitions for a module + optional repair category.
 */
export function useCustomFieldDefs(module: string, repairCategory?: string | null) {
  const [defs, setDefs] = useState<CustomFieldDef[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ module })
    if (repairCategory) params.set('repair_category', repairCategory)
    const res = await fetch(`/api/custom-fields?${params}`)
    if (res.ok) {
      const j = await res.json()
      setDefs(j.data ?? [])
    }
    setLoading(false)
  }, [module, repairCategory])

  useEffect(() => { load() }, [load])

  return { defs, loading, reload: load }
}
