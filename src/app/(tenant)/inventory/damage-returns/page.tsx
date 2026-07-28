'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Undo2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
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
}

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  draft: 'default', shipped: 'warning', resolved: 'success', cancelled: 'destructive',
}

const STATUS_FILTERS = ['all', 'draft', 'shipped', 'resolved', 'cancelled'] as const

export default function DamageReturnsPage() {
  const { activeBranch } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all')

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

  const columns: ColumnDef<SupplierReturnRow>[] = [
    { id: 'return_number', header: 'Return #', cell: ({ row }) => (
      <span className="font-mono text-sm font-medium text-gray-900">{row.original.return_number}</span>
    )},
    { id: 'supplier', header: 'Supplier', cell: ({ row }) => (
      <span className="text-sm text-gray-700">{row.original.suppliers?.name ?? '—'}</span>
    )},
    { id: 'po', header: 'Linked PO', cell: ({ row }) => (
      row.original.purchase_orders?.po_number
        ? <span className="font-mono text-xs text-gray-600">{row.original.purchase_orders.po_number}</span>
        : <span className="text-sm text-gray-400">—</span>
    )},
    { accessorKey: 'total_value', header: 'Total Value', cell: ({ getValue }) => (
      <span className="font-semibold text-gray-900">{formatCurrency(Number(getValue() ?? 0))}</span>
    )},
    { id: 'status', header: 'Status', cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status] ?? 'default'}>{row.original.status}</Badge>
    )},
    { id: 'created_at', header: 'Created', cell: ({ row }) => (
      <span className="text-sm text-gray-500">{formatDate(row.original.created_at)}</span>
    )},
  ]

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex overflow-x-auto gap-1 border-b border-gray-200 pb-3 no-scrollbar">
        {[
          { label: 'Products',        href: '/inventory' },
          { label: 'Purchase Orders', href: '/inventory/purchase-orders' },
          { label: 'Suppliers',       href: '/inventory/suppliers' },
          { label: 'Bin',             href: '/inventory/bin' },
          { label: 'Damage Returns',  href: '/inventory/damage-returns' },
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === href ? 'bg-brand-teal text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
            <Undo2 className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Damage Returns</h1>
            <p className="text-sm text-gray-500">Return damaged stock to suppliers and track resolution</p>
          </div>
        </div>
        <Button size="sm" onClick={() => router.push('/inventory/damage-returns/new')}>
          <Plus className="h-4 w-4" /> New Damage Return
        </Button>
      </div>

      <div className="flex gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              statusFilter === s ? 'bg-brand-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <DataTable
        data={returns}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="No damage returns found."
        onRowClick={(row) => router.push(`/inventory/damage-returns/${row.id}`)}
      />
    </div>
  )
}
