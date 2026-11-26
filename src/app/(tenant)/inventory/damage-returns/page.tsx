'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus, Search, PackageX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { InventoryNav } from '@/components/inventory/inventory-nav'
import { PageHeader, FilterPills } from '@/components/shared/page-header'
import type { ColumnDef } from '@tanstack/react-table'

interface SupplierReturnRow {
  id: string
  return_number: string
  status: 'draft' | 'shipped' | 'resolved' | 'cancelled'
  total_value: number
  created_at: string
  po_id: string | null
  suppliers?: { name: string } | null
  purchase_orders?: { po_number: string } | null
  supplier_return_items?: { name: string | null; sku: string | null }[] | null
}

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  draft: 'default', shipped: 'warning', resolved: 'success', cancelled: 'destructive',
}

const STATUS_FILTERS = ['all', 'draft', 'shipped', 'resolved', 'cancelled'] as const

export default function DamageReturnsPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all')
  const [search, setSearch] = useState('')

  const { data: returns = [], isLoading } = useQuery<SupplierReturnRow[]>({
    queryKey: ['supplier-returns', activeBranch?.id, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id, limit: '100' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/supplier-returns?${params}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
  })

  const term = search.trim().toLowerCase()
  const visibleReturns = term
    ? returns.filter((r) =>
        [
          r.return_number,
          r.suppliers?.name,
          r.purchase_orders?.po_number,
          ...(r.supplier_return_items ?? []).flatMap((i) => [i.name, i.sku]),
        ].some((v) => v?.toLowerCase().includes(term))
      )
    : returns

  const columns: ColumnDef<SupplierReturnRow>[] = [
    { id: 'return_number', header: 'Return #', cell: ({ row }) => (
      <span className="font-mono text-sm font-medium text-on-surface">{row.original.return_number}</span>
    )},
    { id: 'supplier', header: 'Supplier', cell: ({ row }) => (
      <span className="text-sm text-on-surface-variant">{row.original.suppliers?.name ?? '—'}</span>
    )},
    { id: 'po', header: 'Linked PO', cell: ({ row }) => (
      row.original.purchase_orders?.po_number
        ? <span className="font-mono text-xs text-on-surface-variant">{row.original.purchase_orders.po_number}</span>
        : <span className="text-sm text-outline">—</span>
    )},
    { accessorKey: 'total_value', header: 'Total Value', cell: ({ getValue }) => (
      <span className="font-semibold text-on-surface">{formatCurrency(Number(getValue() ?? 0))}</span>
    )},
    { id: 'status', header: 'Status', cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status] ?? 'default'}>{row.original.status}</Badge>
    )},
    { id: 'created_at', header: 'Created', cell: ({ row }) => (
      <span className="text-sm text-on-surface-variant">{formatDate(row.original.created_at)}</span>
    )},
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: '/inventory', label: 'Back to Inventory' }}
        title="Damage Returns"
        description="Return damaged stock to suppliers and track resolution."
        actions={
          <Button onClick={() => router.push('/inventory/damage-returns/new')}>
            <Plus className="h-4 w-4" /> New Damage Return
          </Button>
        }
      />

      <InventoryNav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills
          options={STATUS_FILTERS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product, SKU, return #, supplier or PO…"
            className="h-10 w-full rounded-full border border-outline-variant pl-10 pr-4 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <DataTable
        data={visibleReturns}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="No damage returns found."
        emptyIcon={<PackageX />}
        onRowClick={(row) => router.push(`/inventory/damage-returns/${row.id}`)}
      />
    </div>
  )
}
