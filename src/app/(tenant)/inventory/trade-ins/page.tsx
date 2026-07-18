'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/shared/data-table'
import { ProductVariantPicker } from '@/components/inventory/product-variant-picker'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import type { ColumnDef } from '@tanstack/react-table'

interface TradeIn {
  id: string; trade_in_value: number; condition_grade: string
  serial_number: string | null; imei: string | null
  notes: string | null; created_at: string
  products?: { name: string } | null
  product_variants?: { name: string } | null
  customers?: { id: string; first_name: string; last_name: string | null; phone: string | null } | null
}

const GRADE_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'default'> = {
  A: 'success', B: 'success', C: 'warning', D: 'destructive', faulty: 'destructive',
}

const emptyForm = {
  product_id: '', variant_id: '', product_name: '', variant_name: '',
  condition_grade: 'B', trade_in_value: 0,
  serial_number: '', imei: '', notes: '',
}

export default function TradeInsPage() {
  const { activeBranch, profile } = useAuthStore()
  const [tradeIns,  setTradeIns]  = useState<TradeIn[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [pageSize,  setPageSize]  = useState(20)
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const tiRes = await fetch(`/api/inventory/trade-ins?branch_id=${activeBranch.id}&page=${page + 1}&limit=${pageSize}`)
    const tiJson = await tiRes.json()
    setTradeIns(tiJson.data ?? [])
    setTotal(tiJson.meta?.total ?? 0)
    setLoading(false)
  }, [activeBranch, page, pageSize])

  useEffect(() => { fetchData() }, [fetchData])

  async function save() {
    if (!activeBranch || !profile) return
    setSaving(true)
    await fetch('/api/inventory/trade-ins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: profile.business_id,
        branch_id: activeBranch.id,
        product_id: form.product_id,
        variant_id: form.variant_id || undefined,
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
          <p className="font-medium text-gray-800">
            {(getValue() as TradeIn['products'])?.name ?? '—'}
            {row.original.product_variants?.name && <span className="text-gray-500"> – {row.original.product_variants.name}</span>}
          </p>
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
        return c ? <span className="text-gray-700">{[c.first_name, c.last_name].filter(Boolean).join(' ')}</span> : <span className="text-gray-400">—</span>
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
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No trade-in transactions yet."
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Trade-In" size="sm">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Device / Product *</label>
            {form.product_id ? (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex h-9 w-full items-center justify-between rounded-lg border border-brand-teal/30 bg-brand-teal-light/10 px-3 text-sm text-left"
              >
                <span className="truncate">
                  {form.product_name}
                  {form.variant_name && <span className="text-gray-500"> – {form.variant_name}</span>}
                </span>
                <span className="shrink-0 text-xs text-brand-teal">Change</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex h-9 w-full items-center rounded-lg border border-dashed border-gray-300 px-3 text-sm text-gray-400 hover:border-brand-teal/40 hover:text-brand-teal"
              >
                Select product…
              </button>
            )}
          </div>

          <ProductVariantPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            branchId={activeBranch?.id}
            title="Select the traded-in product"
            onSelect={(product, variant) => {
              setForm((f) => ({
                ...f,
                product_id: product.id,
                variant_id: variant?.id ?? '',
                product_name: product.name,
                variant_name: variant?.name ?? '',
              }))
            }}
          />

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
