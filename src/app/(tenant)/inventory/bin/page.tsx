'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcw, Archive, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { confirmToast } from '@/lib/confirm-toast'
import { InventoryNav } from '@/components/inventory/inventory-nav'
import type { ColumnDef } from '@tanstack/react-table'

interface BinItemRow {
  id: string
  name: string
  sku: string | null
  quantity: number
  unit_cost: number
  reason: string | null
  status: 'binned' | 'restored'
  binned_at: string
  restored_at: string | null
  products?: { name: string; image_url: string | null } | null
  product_variants?: { name: string } | null
}

export default function BinPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<'binned' | 'restored'>('binned')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const { data: items = [], isLoading } = useQuery<BinItemRow[]>({
    queryKey: ['bin-items', activeBranch?.id, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id, status: statusFilter })
      const res = await fetch(`/api/inventory/bin?${params}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  async function handleRestore(item: BinItemRow) {
    const ok = await confirmToast(
      `Restore ${item.quantity} unit(s) of "${item.name}" back into active inventory?`,
      'Restore'
    )
    if (!ok) return
    setRestoringId(item.id)
    try {
      const res = await fetch(`/api/inventory/bin/${item.id}/restore?branch_id=${activeBranch!.id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to restore item')
      toast.success('Item restored to inventory')
      queryClient.invalidateQueries({ queryKey: ['bin-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      queryClient.invalidateQueries({ queryKey: ['pos-variants'] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRestoringId(null)
    }
  }

  const totalLoss = items.reduce((sum, i) => sum + i.quantity * Number(i.unit_cost ?? 0), 0)

  const columns: ColumnDef<BinItemRow>[] = [
    { id: 'name', header: 'Item', cell: ({ row }) => (
      <div>
        <p className="text-sm font-medium text-gray-900">{row.original.name}</p>
        {row.original.sku && <p className="text-xs text-gray-400">{row.original.sku}</p>}
      </div>
    )},
    { accessorKey: 'quantity', header: 'Qty', cell: ({ getValue }) => (
      <span className="text-sm font-medium">{getValue() as number}</span>
    )},
    { accessorKey: 'unit_cost', header: 'Unit Cost', cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)) },
    { id: 'total_loss', header: 'Total Loss', cell: ({ row }) => (
      <span className="font-semibold text-red-600">
        {formatCurrency(row.original.quantity * Number(row.original.unit_cost ?? 0))}
      </span>
    )},
    { accessorKey: 'reason', header: 'Reason', cell: ({ getValue }) => (
      <span className="text-sm text-gray-600">{(getValue() as string | null) ?? '—'}</span>
    )},
    { id: 'date', header: statusFilter === 'binned' ? 'Binned On' : 'Restored On', cell: ({ row }) => (
      formatDate(statusFilter === 'binned' ? row.original.binned_at : (row.original.restored_at ?? row.original.binned_at))
    )},
    ...(statusFilter === 'binned' ? [{
      id: 'actions', header: '', cell: ({ row }: { row: { original: BinItemRow } }) => (
        <Button
          size="sm"
          variant="outline"
          loading={restoringId === row.original.id}
          onClick={() => handleRestore(row.original)}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restore
        </Button>
      ),
    } as ColumnDef<BinItemRow>] : [{
      id: 'status', header: '', cell: () => <Badge variant="default">Restored</Badge>,
    } as ColumnDef<BinItemRow>]),
  ]

  return (
    <div className="space-y-4">
      <InventoryNav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 shrink-0 text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          </Button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <Archive className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bin</h1>
            <p className="text-sm text-gray-500">Items written off as a 100% loss — removed from active inventory</p>
          </div>
        </div>
        {statusFilter === 'binned' && items.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2">
            <p className="text-xs font-medium text-red-500">Total Loss in Bin</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(totalLoss)}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {(['binned', 'restored'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s ? 'bg-brand-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'binned' ? 'In Bin' : 'Restored History'}
          </button>
        ))}
      </div>

      <DataTable
        data={items}
        columns={columns}
        isLoading={isLoading}
        emptyMessage={statusFilter === 'binned' ? 'The Bin is empty.' : 'No restored items yet.'}
      />
    </div>
  )
}
