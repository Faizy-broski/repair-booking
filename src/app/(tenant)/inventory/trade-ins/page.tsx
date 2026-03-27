'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/shared/data-table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import type { ColumnDef } from '@tanstack/react-table'

interface TradeIn {
  id: string; trade_in_value: number; condition_grade: string
  serial_number: string | null; imei: string | null
  notes: string | null; created_at: string
  products?: { name: string } | null
  customers?: { id: string; full_name: string; phone: string | null } | null
}

interface ProductOption { id: string; name: string; sku: string | null }

const GRADE_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'default'> = {
  A: 'success', B: 'success', C: 'warning', D: 'destructive', faulty: 'destructive',
}

const emptyForm = {
  product_id: '', condition_grade: 'B', trade_in_value: 0,
  serial_number: '', imei: '', notes: '',
}

export default function TradeInsPage() {
  const { activeBranch, activeProfile } = useAuthStore()
  const [tradeIns,  setTradeIns]  = useState<TradeIn[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [products,  setProducts]  = useState<ProductOption[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const [tiRes, pRes] = await Promise.all([
      fetch(`/api/inventory/trade-ins?branch_id=${activeBranch.id}&page=${page + 1}`),
      fetch(`/api/products?limit=200`),
    ])
    const [tiJson, pJson] = await Promise.all([tiRes.json(), pRes.json()])
    setTradeIns(tiJson.data ?? [])
    setTotal(tiJson.meta?.total ?? 0)
    setProducts(pJson.data ?? [])
    setLoading(false)
  }, [activeBranch, page])

  useEffect(() => { fetchData() }, [fetchData])

  async function save() {
    if (!activeBranch || !activeProfile) return
    setSaving(true)
    await fetch('/api/inventory/trade-ins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: activeProfile.business_id,
        branch_id: activeBranch.id,
        product_id: form.product_id,
        condition_grade: form.condition_grade,
        trade_in_value: form.trade_in_value,
        serial_number: form.serial_number || undefined,
        imei: form.imei || undefined,
        notes: form.notes || undefined,
      }),
    })
    setModalOpen(false)
    setForm(emptyForm)
    setSaving(false)
    fetchData()
  }

  const columns: ColumnDef<TradeIn>[] = [
    {
      accessorKey: 'products',
      header: 'Device',
      cell: ({ getValue, row }) => (
        <div>
          <p className="font-medium text-gray-800">{(getValue() as TradeIn['products'])?.name ?? '—'}</p>
          {row.original.serial_number && <p className="text-xs text-gray-400">S/N: {row.original.serial_number}</p>}
          {row.original.imei && <p className="text-xs text-gray-400">IMEI: {row.original.imei}</p>}
        </div>
      ),
    },
    {
      accessorKey: 'customers',
      header: 'Customer',
      cell: ({ getValue }) => {
        const c = getValue() as TradeIn['customers']
        return c ? <span className="text-gray-700">{c.full_name}</span> : <span className="text-gray-400">—</span>
      },
    },
    {
      accessorKey: 'condition_grade',
      header: 'Grade',
      cell: ({ getValue }) => {
        const g = getValue() as string
        return <Badge variant={GRADE_VARIANT[g] ?? 'default'}>Grade {g}</Badge>
      },
    },
    {
      accessorKey: 'trade_in_value',
      header: 'Value',
      cell: ({ getValue }) => <span className="font-semibold">{formatCurrency(getValue() as number)}</span>,
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Trade-In Items</h1>
          <p className="text-sm text-gray-500">{total} transactions</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Record Trade-In
        </Button>
      </div>

      <DataTable
        data={tradeIns}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No trade-in transactions yet."
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Trade-In" size="sm">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Device / Product *</label>
            <select
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Condition Grade *</label>
              <select
                value={form.condition_grade}
                onChange={(e) => setForm((f) => ({ ...f, condition_grade: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              >
                {['A','B','C','D','faulty'].map((g) => (
                  <option key={g} value={g}>Grade {g}{g === 'A' ? ' (Like New)' : g === 'faulty' ? ' (Faulty)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Trade-In Value *</label>
              <input
                type="number" min="0" step="0.01"
                value={form.trade_in_value}
                onChange={(e) => setForm((f) => ({ ...f, trade_in_value: Number(e.target.value) }))}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Serial Number</label>
              <input
                value={form.serial_number}
                onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">IMEI</label>
              <input
                value={form.imei}
                onChange={(e) => setForm((f) => ({ ...f, imei: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <Button
            className="w-full"
            onClick={save}
            loading={saving}
            disabled={!form.product_id || form.trade_in_value < 0}
          >
            <RefreshCw className="h-4 w-4" /> Record Trade-In & Add to Stock
          </Button>
        </div>
      </Modal>
    </div>
  )
}
