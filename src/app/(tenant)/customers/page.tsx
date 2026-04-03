'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { useRouter } from 'next/navigation'

interface CustomerRow {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  created_at: string
}

const schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function CustomersPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const fetchCustomers = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const params = new URLSearchParams({
      branch_id: activeBranch.id,
      page: String(page + 1),
      limit: '20',
    })
    if (search) params.set('search', search)
    const res = await fetch(`/api/customers?${params}`)
    const json = await res.json()
    setCustomers(json.data ?? [])
    setTotal(json.meta?.total ?? 0)
    setLoading(false)
  }, [activeBranch, page, search])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  async function onCreate(data: FormData) {
    if (!activeBranch) return
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id }),
    })
    if (res.ok) { reset(); setSheetOpen(false); fetchCustomers() }
  }

  const columns: ColumnDef<CustomerRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-gray-900">
            {row.original.first_name} {row.original.last_name ?? ''}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => (getValue() as string) || '—',
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ getValue }) => (getValue() as string) || '—',
    },
    {
      accessorKey: 'created_at',
      header: 'Added',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" onClick={() => router.push(`/customers/${row.original.id}`)}>
          View
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500">{total} customers</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <DataTable
        data={customers}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No customers yet."
      />

      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Customer">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" required error={errors.first_name?.message} {...register('first_name')} />
            <Input label="Last Name" {...register('last_name')} />
          </div>
          <Input label="Email" type="email" {...register('email')} />
          <Input label="Phone" type="tel" {...register('phone')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              {...register('address')}
            />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Add Customer</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
