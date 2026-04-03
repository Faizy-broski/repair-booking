'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ConditionItem {
  id?: string
  label: string
  status: 'ok' | 'damaged' | 'missing'
  notes: string
}

const STATUS_CONFIG = {
  ok:      { label: 'OK',      color: 'bg-green-100 text-green-700 border-green-300' },
  damaged: { label: 'Damaged', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  missing: { label: 'Missing', color: 'bg-red-100 text-red-700 border-red-300' },
}

const DEFAULT_LABELS = [
  'Screen', 'Battery', 'Camera', 'Charging Port', 'Buttons', 'Speaker', 'Microphone',
  'Back Cover', 'SIM Tray', 'Headphone Jack',
]

interface ConditionChecklistProps {
  repairId: string
  stage: 'pre' | 'post'
  title: string
}

export function ConditionChecklist({ repairId, stage, title }: ConditionChecklistProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ConditionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/repairs/${repairId}/conditions`)
      .then((r) => r.json())
      .then((json) => {
        const stageItems = (json.data ?? [])
          .filter((i: ConditionItem & { stage: string }) => i.stage === stage)
          .map((i: ConditionItem) => ({ id: i.id, label: i.label, status: i.status, notes: i.notes ?? '' }))
        if (stageItems.length > 0) {
          setItems(stageItems)
        } else {
          // Seed with defaults
          setItems(DEFAULT_LABELS.map((label) => ({ label, status: 'ok' as const, notes: '' })))
        }
        setLoading(false)
      })
  }, [open, repairId, stage])

  function addItem() {
    setItems((prev) => [...prev, { label: '', status: 'ok', notes: '' }])
  }

  function updateItem(idx: number, patch: Partial<ConditionItem>) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item))
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/repairs/${repairId}/conditions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage,
        items: items.filter((i) => i.label.trim()).map((i) => ({
          label: i.label,
          status: i.status,
          notes: i.notes || null,
        })),
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="rounded-lg border border-gray-200">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <div className="flex items-center gap-2">
          {items.length > 0 && open && (
            <span className="text-xs text-gray-400">{items.length} items</span>
          )}
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={item.label}
                    onChange={(e) => updateItem(idx, { label: e.target.value })}
                    placeholder="Component name"
                    className="h-8 flex-1 rounded border border-gray-200 px-2 text-sm focus:border-blue-400 focus:outline-none"
                  />
                  {/* Status toggle */}
                  <div className="flex rounded-md border border-gray-200 overflow-hidden">
                    {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateItem(idx, { status: s })}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          item.status === s ? STATUS_CONFIG[s].color : 'text-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={addItem}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add item
                </button>
                <div className="flex-1" />
                <Button size="sm" variant="outline" loading={saving} onClick={handleSave}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {saved ? 'Saved!' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
