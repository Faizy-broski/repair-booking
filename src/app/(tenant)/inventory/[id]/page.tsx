'use client'
import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Hash, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

const VALUATION_LABELS: Record<string, string> = {
  weighted_average: 'Weighted Average',
  fifo: 'FIFO',
  lifo: 'LIFO',
}

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null
  selling_price: number; cost_price: number; is_service: boolean
  is_serialized: boolean; valuation_method: string; description: string | null
  categories?: { name: string } | null
  brands?: { name: string } | null
  product_variants?: { id: string; name: string; sku: string | null; selling_price: number }[]
}

interface Serial {
  id: string; serial_number: string; imei: string | null; status: string
  notes: string | null; created_at: string
}

const SERIAL_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'default' | 'destructive'> = {
  in_stock: 'success', sold: 'default', in_repair: 'warning', returned: 'warning', damaged: 'destructive',
}

type Tab = 'overview' | 'serials'

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router  = useRouter()
  const { activeBranch } = useAuthStore()

  const [product,    setProduct]    = useState<Product | null>(null)
  const [serials,    setSerials]    = useState<Serial[]>([])
  const [tab,        setTab]        = useState<Tab>('overview')
  const [loading,    setLoading]    = useState(true)
  const [addModal,   setAddModal]   = useState(false)
  const [bulkModal,  setBulkModal]  = useState(false)
  const [newSerial,  setNewSerial]  = useState({ serial_number: '', imei: '' })
  const [bulkText,   setBulkText]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [settingsModal, setSettingsModal] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ is_serialized: false, valuation_method: 'weighted_average' })
  const [settingsSaving, setSettingsSaving] = useState(false)

  async function fetchProduct() {
    setLoading(true)
    const res  = await fetch(`/api/products/${id}`)
    const json = await res.json()
    setProduct(json.data)
    setSettingsForm({
      is_serialized: json.data?.is_serialized ?? false,
      valuation_method: json.data?.valuation_method ?? 'weighted_average',
    })
    setLoading(false)
  }

  const fetchSerials = useCallback(async () => {
    if (!activeBranch) return
    const res  = await fetch(`/api/products/${id}/serials?branch_id=${activeBranch.id}`)
    const json = await res.json()
    setSerials(json.data ?? [])
  }, [id, activeBranch])

  useEffect(() => { fetchProduct() }, [id])
  useEffect(() => { if (tab === 'serials') fetchSerials() }, [tab, fetchSerials])

  async function addSerial() {
    if (!activeBranch || !newSerial.serial_number) return
    setSaving(true)
    await fetch(`/api/products/${id}/serials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: activeBranch.id, ...newSerial, imei: newSerial.imei || undefined }),
    })
    setAddModal(false)
    setNewSerial({ serial_number: '', imei: '' })
    setSaving(false)
    fetchSerials()
  }

  async function addBulkSerials() {
    if (!activeBranch || !bulkText.trim()) return
    setSaving(true)
    const serials = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [serial_number, imei] = line.split(',').map((s) => s.trim())
        return { serial_number, imei: imei || undefined }
      })
    await fetch(`/api/products/${id}/serials/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: activeBranch.id, serials }),
    })
    setBulkModal(false)
    setBulkText('')
    setSaving(false)
    fetchSerials()
  }

  async function deleteSerial(serialId: string) {
    if (!confirm('Delete this serial? This cannot be undone.')) return
    await fetch(`/api/inventory/serials/${serialId}`, { method: 'DELETE' })
    fetchSerials()
  }

  async function saveSettings() {
    setSettingsSaving(true)
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    })
    setSettingsModal(false)
    setSettingsSaving(false)
    fetchProduct()
  }

  if (loading || !product) {
    return <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>
  }

  const filteredSerials = statusFilter ? serials.filter((s) => s.status === statusFilter) : serials
  const statusCounts = serials.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {} as Record<string, number>)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{product.name}</h1>
            {product.is_service && <Badge variant="purple">Service</Badge>}
            {product.is_serialized && <Badge variant="secondary">Serialized</Badge>}
          </div>
          <p className="text-sm text-gray-500">
            {product.categories?.name && `${product.categories.name} · `}
            {product.sku && `SKU: ${product.sku}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSettingsModal(true)}>
          <Settings2 className="h-4 w-4" /> Settings
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['overview', ...(product.is_serialized ? ['serials'] : [])] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
              tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}{t === 'serials' ? ` (${serials.length})` : ''}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Selling Price', value: formatCurrency(product.selling_price) },
              { label: 'Cost Price',    value: formatCurrency(product.cost_price) },
              { label: 'Margin',        value: product.cost_price > 0 ? `${Math.round(((product.selling_price - product.cost_price) / product.selling_price) * 100)}%` : '—' },
              { label: 'Valuation',     value: product.valuation_method.replace('_', ' ') },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-400">{card.label}</p>
                <p className="font-semibold text-gray-900">{card.value}</p>
              </div>
            ))}
          </div>

          {product.description && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Description</p>
              <p className="text-sm text-gray-600">{product.description}</p>
            </div>
          )}

          {product.product_variants && product.product_variants.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="font-semibold text-gray-900 text-sm">Variants</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Variant</th>
                    <th className="px-4 py-2 text-left">SKU</th>
                    <th className="px-4 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {product.product_variants.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-3 font-medium text-gray-800">{v.name}</td>
                      <td className="px-4 py-3 text-gray-500">{v.sku ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(v.selling_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Serials tab */}
      {tab === 'serials' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {['', 'in_stock', 'sold', 'in_repair', 'returned', 'damaged'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s ? `${s.replace('_', ' ')} (${statusCounts[s] ?? 0})` : `All (${serials.length})`}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setBulkModal(true)}>
                Bulk Add
              </Button>
              <Button size="sm" onClick={() => setAddModal(true)}>
                <Plus className="h-4 w-4" /> Add Serial
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Serial Number</th>
                  <th className="px-4 py-2 text-left">IMEI</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Added</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSerials.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-gray-400">
                      <Hash className="mx-auto h-8 w-8 text-gray-200 mb-2" />
                      No serial numbers yet.
                    </td>
                  </tr>
                ) : filteredSerials.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-gray-800">{s.serial_number}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{s.imei ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={SERIAL_STATUS_VARIANT[s.status] ?? 'default'}>
                        {s.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(s.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {s.status === 'in_stock' && (
                        <Button size="sm" variant="ghost" onClick={() => deleteSerial(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Single Serial Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Serial Number" size="sm">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Serial Number *</label>
            <input
              value={newSerial.serial_number}
              onChange={(e) => setNewSerial((s) => ({ ...s, serial_number: e.target.value }))}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 font-mono text-sm"
              placeholder="SN123456789"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">IMEI</label>
            <input
              value={newSerial.imei}
              onChange={(e) => setNewSerial((s) => ({ ...s, imei: e.target.value }))}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 font-mono text-sm"
              placeholder="Optional"
            />
          </div>
          <Button className="w-full" onClick={addSerial} loading={saving} disabled={!newSerial.serial_number}>
            Add Serial
          </Button>
        </div>
      </Modal>

      {/* Bulk Add Modal */}
      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title="Bulk Add Serials" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Enter one serial per line. Optionally add IMEI after a comma: <code className="text-xs bg-gray-100 px-1 rounded">SN123,IMEI456</code></p>
          <textarea
            rows={8}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
            placeholder={"SN001\nSN002,IMEI001\nSN003"}
          />
          <p className="text-xs text-gray-400">{bulkText.split('\n').filter((l) => l.trim()).length} serials to add</p>
          <Button className="w-full" onClick={addBulkSerials} loading={saving} disabled={!bulkText.trim()}>
            Add Serials
          </Button>
        </div>
      </Modal>

      {/* Product Settings Modal */}
      <Modal open={settingsModal} onClose={() => setSettingsModal(false)} title="Product Settings" size="sm">
        <div className="space-y-5">
          {/* Serialized toggle */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <div>
              <p className="text-sm font-medium text-gray-800">Serialized Inventory</p>
              <p className="text-xs text-gray-500 mt-0.5">Track each unit by serial number / IMEI</p>
            </div>
            <button
              onClick={() => setSettingsForm((f) => ({ ...f, is_serialized: !f.is_serialized }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                settingsForm.is_serialized ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settingsForm.is_serialized ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Valuation method */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Valuation Method</label>
            <select
              value={settingsForm.valuation_method}
              onChange={(e) => setSettingsForm((f) => ({ ...f, valuation_method: e.target.value }))}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="weighted_average">Weighted Average</option>
              <option value="fifo">FIFO (First In, First Out)</option>
              <option value="lifo">LIFO (Last In, First Out)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Controls how cost of goods is calculated when stock is sold.
            </p>
          </div>

          <Button className="w-full" onClick={saveSettings} loading={settingsSaving}>
            Save Settings
          </Button>
        </div>
      </Modal>
    </div>
  )
}
