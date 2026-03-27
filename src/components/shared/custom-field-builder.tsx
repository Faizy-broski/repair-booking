'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, GripVertical, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { MODULES, type Module } from '@/backend/config/constants'

interface CustomField {
  id?: string
  field_key: string
  label: string
  field_type: 'text' | 'number' | 'select' | 'date' | 'boolean'
  options: string[]
  is_required: boolean
  sort_order: number
}

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
]

const MODULE_OPTIONS = MODULES.map((m) => ({ value: m, label: m.replace('_', ' ') }))

interface CustomFieldBuilderProps {
  module?: Module
  onSaved?: () => void
}

/**
 * Drag-and-drop custom field definition builder.
 * Fetches existing fields from /api/custom-fields and allows CRUD.
 */
export function CustomFieldBuilder({ module: initialModule, onSaved }: CustomFieldBuilderProps) {
  const [module, setModule] = useState<Module>(initialModule ?? 'repairs')
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  async function fetchFields() {
    setLoading(true)
    const res = await fetch(`/api/custom-fields?module=${module}`)
    const json = await res.json()
    const data: CustomField[] = (json.data ?? []).map((f: CustomField & { options: { choices?: string[] } | null }) => ({
      ...f,
      options: f.options && 'choices' in f.options ? (f.options as { choices: string[] }).choices ?? [] : [],
    }))
    setFields(data)
    setLoading(false)
  }

  useEffect(() => { fetchFields() }, [module]) // eslint-disable-line react-hooks/exhaustive-deps

  function addField() {
    setFields((prev) => [
      ...prev,
      {
        field_key: `field_${Date.now()}`,
        label: '',
        field_type: 'text',
        options: [],
        is_required: false,
        sort_order: prev.length,
      },
    ])
  }

  function updateField(index: number, updates: Partial<CustomField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)))
  }

  async function removeField(index: number) {
    const field = fields[index]
    if (field.id) {
      await fetch(`/api/custom-fields/${field.id}`, { method: 'DELETE' })
    }
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  async function saveAll() {
    setSaving(true)
    try {
      for (const field of fields) {
        const body = {
          module,
          field_key: field.field_key.toLowerCase().replace(/\s+/g, '_'),
          label: field.label,
          field_type: field.field_type,
          options: field.field_type === 'select' ? field.options : null,
          is_required: field.is_required,
          sort_order: field.sort_order,
        }
        if (field.id) {
          await fetch(`/api/custom-fields/${field.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        } else {
          await fetch('/api/custom-fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        }
      }
      await fetchFields()
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  // Simple drag-and-drop reordering
  function onDragStart(index: number) { setDragIndex(index) }
  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setFields((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next.map((f, i) => ({ ...f, sort_order: i }))
    })
    setDragIndex(index)
  }

  return (
    <div className="space-y-4">
      {!initialModule && (
        <Select
          options={MODULE_OPTIONS}
          value={module}
          onValueChange={(v) => setModule(v as Module)}
          placeholder="Select module"
          className="w-48"
        />
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id ?? index}
              draggable
              onDragStart={() => onDragStart(index)}
              onDragOver={(e) => onDragOver(e, index)}
              className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-3"
            >
              <GripVertical className="mt-2.5 h-4 w-4 shrink-0 cursor-grab text-gray-300" />

              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                <Input
                  placeholder="Label"
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                />
                <Input
                  placeholder="field_key"
                  value={field.field_key}
                  onChange={(e) => updateField(index, { field_key: e.target.value })}
                />
                <Select
                  options={FIELD_TYPE_OPTIONS}
                  value={field.field_type}
                  onValueChange={(v) => updateField(index, { field_type: v as CustomField['field_type'] })}
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={field.is_required}
                      onChange={(e) => updateField(index, { is_required: e.target.checked })}
                      className="rounded"
                    />
                    Required
                  </label>
                  {field.id && <Badge variant="secondary" className="text-xs">saved</Badge>}
                </div>
              </div>

              {field.field_type === 'select' && (
                <div className="w-full col-span-full pl-6">
                  <Input
                    placeholder="Options (comma-separated)"
                    value={field.options.join(', ')}
                    onChange={(e) => updateField(index, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => removeField(index)}
                className="mt-2 text-gray-300 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addField}>
          <Plus className="h-4 w-4" />
          Add Field
        </Button>
        {fields.length > 0 && (
          <Button size="sm" loading={saving} onClick={saveAll}>
            <Save className="h-4 w-4" />
            Save Fields
          </Button>
        )}
      </div>
    </div>
  )
}
