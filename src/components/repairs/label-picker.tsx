'use client'
import { useState, useEffect, useRef } from 'react'
import { Tag, Plus, X, Check } from 'lucide-react'

interface TicketLabel {
  id: string
  name: string
  color: string
}

interface LabelPickerProps {
  repairId: string
  selectedIds: string[]
  onChange?: (ids: string[]) => void
}

export function LabelPicker({ repairId, selectedIds, onChange }: LabelPickerProps) {
  const [labels, setLabels] = useState<TicketLabel[]>([])
  const [open, setOpen] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#6366f1')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/repairs/labels')
      .then((r) => r.json())
      .then((json) => setLabels(json.data ?? []))
  }, [])

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  async function toggleLabel(labelId: string) {
    const next = selectedIds.includes(labelId)
      ? selectedIds.filter((id) => id !== labelId)
      : [...selectedIds, labelId]
    setSaving(true)
    await fetch(`/api/repairs/${repairId}/labels`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label_ids: next }),
    })
    setSaving(false)
    onChange?.(next)
  }

  async function createLabel() {
    if (!newLabelName.trim()) return
    const res = await fetch('/api/repairs/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor }),
    })
    if (res.ok) {
      const json = await res.json()
      setLabels((prev) => [...prev, json.data])
      setNewLabelName('')
      setCreating(false)
    }
  }

  const activeLabels = labels.filter((l) => selectedIds.includes(l.id))

  return (
    <div ref={containerRef} className="relative">
      {/* Display selected labels + add button */}
      <div className="flex flex-wrap items-center gap-1.5">
        {activeLabels.map((label) => (
          <span
            key={label.id}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: label.color }}
          >
            {label.name}
            <button
              onClick={() => toggleLabel(label.id)}
              className="ml-0.5 opacity-70 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          <Tag className="h-3 w-3" />
          {activeLabels.length === 0 ? 'Add labels' : 'Edit'}
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-2 space-y-0.5 max-h-48 overflow-y-auto">
            {labels.length === 0 && (
              <p className="px-2 py-1 text-xs text-gray-400">No labels yet</p>
            )}
            {labels.map((label) => {
              const selected = selectedIds.includes(label.id)
              return (
                <button
                  key={label.id}
                  onClick={() => toggleLabel(label.id)}
                  disabled={saving}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 text-gray-800">{label.name}</span>
                  {selected && <Check className="h-3 w-3 text-blue-600" />}
                </button>
              )
            })}
          </div>

          {/* Create new label */}
          <div className="border-t border-gray-100 p-2">
            {creating ? (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                    className="h-7 w-8 rounded border border-gray-200 p-0.5"
                  />
                  <input
                    autoFocus
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createLabel()}
                    placeholder="Label name"
                    className="h-7 flex-1 rounded border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={createLabel}
                    className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setCreating(false)}
                    className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Create new label
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
