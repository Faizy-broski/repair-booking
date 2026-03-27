'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'

interface ProductRow {
  id: string
  name: string
  sku: string | null
  selling_price: number
  cost_price: number
  is_service: boolean
  categories?: { name: string } | null
  brands?: { name: string } | null
}

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  selling_price: z.coerce.number().min(0),
  cost_price: z.coerce.number().min(0).default(0),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  is_service: z.boolean().default(false),
})

type CreateFormData = z.infer<typeof createSchema>

export default function InventoryPage() {
  const { activeBranch } = useAuthStore()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
  })

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page + 1), limit: '20' })
    if (search) params.set('search', search)
    const res = await fetch(`/api/products?${params}`)
    const json = await res.json()
    setProducts(json.data ?? [])
    setTotal(json.meta?.total ?? 0)
    setLoading(false)
  }, [page, search])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  async function onCreate(data: CreateFormData) {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      reset()
      setSheetOpen(false)
      fetchProducts()
    }
  }

  const columns: ColumnDef<ProductRow>[] = [
    { accessorKey: 'name', header: 'Product Name', cell: ({ getValue, row }) => (
      <div>
        <p className="font-medium text-gray-900">{getValue() as string}</p>
        {row.original.sku && <p className="text-xs text-gray-400">SKU: {row.original.sku}</p>}
      </div>
    )},
    { accessorKey: 'categories', header: 'Category', cell: ({ getValue }) => {
      const c = getValue() as ProductRow['categories']
      return c?.name ? <Badge variant="secondary">{c.name}</Badge> : '—'
    }},
    { accessorKey: 'selling_price', header: 'Price', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'cost_price', header: 'Cost', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'is_service', header: 'Type', cell: ({ getValue }) => (
      <Badge variant={(getValue() as boolean) ? 'purple' : 'default'}>
        {(getValue() as boolean) ? 'Service' : 'Product'}
      </Badge>
    )},
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">{total} products</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <DataTable
        data={products}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No products yet. Add your first product!"
      />

      <InlineFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Add Product"
        description="Add a new product or service to your catalog"
      >
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <Input
            label="Product Name"
            placeholder="iPhone Screen Replacement"
            required
            error={errors.name?.message}
            {...register('name')}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Selling Price (£)"
              type="number"
              step="0.01"
              required
              error={errors.selling_price?.message}
              {...register('selling_price')}
            />
            <Input
              label="Cost Price (£)"
              type="number"
              step="0.01"
              {...register('cost_price')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="SKU" placeholder="Optional" {...register('sku')} />
            <Input label="Barcode" placeholder="Optional" {...register('barcode')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              {...register('description')}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('is_service')} className="rounded" />
            <span>This is a service (not a physical product)</span>
          </label>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Add Product
          </Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
