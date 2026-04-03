'use client'
import { useState, useEffect } from 'react'
import { Cpu, Plus, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Asset {
  id: string
  name: string
  brand: string | null
  model: string | null
  serial_number: string | null
  imei: string | null
  color: string | null
}

interface AssetPickerProps {
  customerId: string
  selected: Asset | null
  onSelect: (asset: Asset | null) => void
}

const emptyForm = { name: '', brand: '', model: '', serial_number: '', imei: '', color: '' }

export function AssetPicker({ customerId, selected, onSelect }: AssetPickerProps) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/customers/${customerId}/assets`)
      .then((r) => r.json())
      .then((j) => setAssets(j.data ?? []))
      .finally(() => setLoading(false))
  }, [customerId])

  async function saveNewAsset() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          brand: form.brand || null,
          model: form.model || null,
          serial_number: form.serial_number || null,
          imei: form.imei || null,
          color: form.color || null,
        }),
      })
      const json = await res.json()
      if (json.data) {
        setAssets((prev) => [...prev, json.data])
        onSelect(json.data)
        setShowAddForm(false)
        setForm(emptyForm)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-9 animate-pulse rounded-lg bg-gray-100" />
  }

  // Device selected — show chip
  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
        <Cpu className="h-4 w-4 shrink-0 text-indigo-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {[selected.brand, selected.model].filter(Boolean).join(' ') || selected.name}
          </p>
          {selected.serial_number && (
            <p className="text-xs text-gray-500">S/N: {selected.serial_number}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setShowDropdown((v) => !v); setShowAddForm(false) }}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-left hover:border-gray-400 focus:outline-none focus:border-blue-500"
      >
        <Cpu className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="flex-1 text-gray-400">
          {assets.length > 0 ? `${assets.length} saved device${assets.length > 1 ? 's' : ''} — select or skip` : 'No saved devices — skip or add one'}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {assets.length > 0 && (
            <ul className="max-h-48 overflow-y-auto py-1">
              {assets.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(a); setShowDropdown(false) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
                      <Cpu className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {[a.brand, a.model].filter(Boolean).join(' ') || a.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {[a.serial_number && `S/N: ${a.serial_number}`, a.imei && `IMEI: ${a.imei}`, a.color].filter(Boolean).join(' · ') || 'No serial/IMEI'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add new device */}
          <div className="border-t border-gray-100 p-2">
            <button
              type="button"
              onClick={() => { setShowAddForm(true); setShowDropdown(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              Save new device to customer
            </button>
          </div>

          {/* Skip option */}
          <div className="border-t border-gray-100 p-2">
            <button
              type="button"
              onClick={() => setShowDropdown(false)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              Skip — type device details manually below
            </button>
          </div>
        </div>
      )}

      {/* Inline add-device form */}
      {showAddForm && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Save Device to Customer</p>
          <Input
            label="Device Name *"
            placeholder="e.g. My iPhone 15"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Brand"
              placeholder="Apple"
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            />
            <Input
              label="Model"
              placeholder="iPhone 15 Pro"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Serial Number"
              placeholder="Optional"
              value={form.serial_number}
              onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
            />
            <Input
              label="IMEI"
              placeholder="Optional"
              value={form.imei}
              onChange={(e) => setForm((f) => ({ ...f, imei: e.target.value }))}
            />
          </div>
          <Input
            label="Color"
            placeholder="Black, White..."
            value={form.color}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              loading={saving}
              onClick={saveNewAsset}
              disabled={!form.name.trim()}
            >
              <Cpu className="h-3.5 w-3.5" />
              Save & Select
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setShowAddForm(false); setForm(emptyForm) }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
