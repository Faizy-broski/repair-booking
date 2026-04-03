'use client'
import { useState, useEffect } from 'react'
import { Search, ShieldAlert, ShieldCheck, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { formatDate } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

interface BusinessRow {
  id: string
  name: string
  subdomain: string
  email: string | null
  is_active: boolean
  created_at: string
  subscriptions?: Array<{ status: string; plans?: { name: string } | null }> | null
}

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch_() {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page + 1), limit: '20' })
      if (search) params.set('search', search)
      const res = await fetch(`/api/businesses?${params}`)
      const json = await res.json()
      setBusinesses(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
      setLoading(false)
    }
    fetch_()
  }, [page, search])

  async function toggleSuspend(biz: BusinessRow) {
    await fetch(`/api/businesses/${biz.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !biz.is_active }),
    })
    setBusinesses((b) => b.map((x) => x.id === biz.id ? { ...x, is_active: !biz.is_active } : x))
  }

  const columns: ColumnDef<BusinessRow>[] = [
    {
      accessorKey: 'name',
      header: 'Business',
      cell: ({ getValue, row }) => (
        <div>
          <p className="font-medium text-gray-900">{getValue() as string}</p>
          <p className="text-xs text-gray-400 font-mono">{row.original.subdomain}.repairbooking.co.uk</p>
        </div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => (getValue() as string) || '—',
    },
    {
      accessorKey: 'subscriptions',
      header: 'Plan',
      cell: ({ getValue }) => {
        const subs = getValue() as BusinessRow['subscriptions']
        const sub = subs?.[0]
        return sub ? (
          <div>
            <p className="text-sm text-gray-700">{sub.plans?.name ?? '—'}</p>
            <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'trialing' ? 'warning' : 'destructive'} className="text-[10px]">
              {sub.status}
            </Badge>
          </div>
        ) : '—'
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ getValue }) => (
        <Badge variant={(getValue() as boolean) ? 'success' : 'destructive'}>
          {(getValue() as boolean) ? 'Active' : 'Suspended'}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Joined',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleSuspend(row.original)}
            className={row.original.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
          >
            {row.original.is_active ? (
              <><ShieldAlert className="h-3.5 w-3.5" /> Suspend</>
            ) : (
              <><ShieldCheck className="h-3.5 w-3.5" /> Activate</>
            )}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
          <p className="text-sm text-gray-500">{total} registered businesses</p>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search businesses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <DataTable
        data={businesses}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No businesses found."
      />
    </div>
  )
}
