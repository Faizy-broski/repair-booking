'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'

interface GiftCardRow {
  id: string
  code: string
  initial_value: number
  balance: number
  is_active: boolean
  expires_at: string | null
  created_at: string
  customers?: { first_name: string; last_name: string | null } | null
}

interface CustomerOption { id: string; first_name: string; last_name: string | null }

const schema = z.object({
  initial_value: z.coerce.number().positive('Amount must be positive'),
  customer_id: z.string().uuid().optional().or(z.literal('')),
  expires_at: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function GiftCardsPage() {
  const { activeBranch } = useAuthStore()
  const [giftCards, setGiftCards] = useState<GiftCardRow[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [qrCard, setQrCard] = useState<GiftCardRow | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const [gcRes, custRes] = await Promise.all([
      fetch(`/api/gift-cards?branch_id=${activeBranch.id}`),
      fetch(`/api/customers?branch_id=${activeBranch.id}&limit=100`),
    ])
    const [gcJson, custJson] = await Promise.all([gcRes.json(), custRes.json()])
    setGiftCards(gcJson.data ?? [])
    setCustomers(custJson.data ?? [])
    setLoading(false)
  }, [activeBranch])

  useEffect(() => { fetchData() }, [fetchData])

  async function onCreate(data: FormData) {
    if (!activeBranch) return
    const res = await fetch('/api/gift-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        branch_id: activeBranch.id,
        customer_id: data.customer_id || null,
        expires_at: data.expires_at || null,
      }),
    })
    if (res.ok) { reset(); setSheetOpen(false); fetchData() }
  }

  async function deactivate(id: string) {
    await fetch(`/api/gift-cards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
    fetchData()
  }

  const columns: ColumnDef<GiftCardRow>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ getValue, row }) => (
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-purple-500" />
          <button
            onClick={() => setQrCard(row.original)}
            className="font-mono font-semibold text-blue-600 hover:underline"
          >
            {getValue() as string}
          </button>
        </div>
      ),
    },
    {
      accessorKey: 'customers',
      header: 'Customer',
      cell: ({ getValue }) => {
        const c = getValue() as GiftCardRow['customers']
        return c ? `${c.first_name} ${c.last_name ?? ''}` : '—'
      },
    },
    {
      accessorKey: 'initial_value',
      header: 'Initial Value',
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      accessorKey: 'balance',
      header: 'Balance',
      cell: ({ getValue, row }) => {
        const balance = getValue() as number
        const pct = (balance / row.original.initial_value) * 100
        return (
          <div>
            <span className={`font-semibold ${balance === 0 ? 'text-gray-400' : 'text-green-600'}`}>
              {formatCurrency(balance)}
            </span>
            <div className="mt-0.5 h-1 w-16 rounded-full bg-gray-100">
              <div className="h-1 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ getValue }) => (
        <Badge variant={(getValue() as boolean) ? 'success' : 'destructive'}>
          {(getValue() as boolean) ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      accessorKey: 'expires_at',
      header: 'Expires',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? formatDate(v) : 'No expiry'
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => row.original.is_active ? (
        <Button size="sm" variant="ghost" onClick={() => deactivate(row.original.id)} className="text-red-500 hover:text-red-700">
          Deactivate
        </Button>
      ) : null,
    },
  ]

  const totalBalance = giftCards.filter((g) => g.is_active).reduce((s, g) => s + g.balance, 0)
  const activeCount = giftCards.filter((g) => g.is_active).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gift Cards</h1>
          <p className="text-sm text-gray-500">{activeCount} active · {formatCurrency(totalBalance)} outstanding</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> Issue Gift Card
        </Button>
      </div>

      <DataTable
        data={giftCards}
        columns={columns}
        isLoading={loading}
        emptyMessage="No gift cards issued yet."
      />

      {/* QR Modal */}
      {qrCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setQrCard(null)}>
          <div className="rounded-xl bg-white p-8 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <Gift className="mx-auto mb-3 h-8 w-8 text-purple-500" />
            <p className="text-lg font-bold text-gray-900">{qrCard.code}</p>
            <p className="text-sm text-gray-500">Balance: {formatCurrency(qrCard.balance)}</p>
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-400">QR code generation requires the qrcode package</p>
              <p className="mt-1 font-mono text-xs text-gray-600">{qrCard.code}</p>
            </div>
            <Button className="mt-4" onClick={() => setQrCard(null)}>Close</Button>
          </div>
        </div>
      )}

      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Issue Gift Card">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <Input
            label="Value (£)"
            type="number"
            step="0.01"
            required
            error={errors.initial_value?.message}
            {...register('initial_value')}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Customer (optional)</label>
            <select
              {...register('customer_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">No customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ''}</option>
              ))}
            </select>
          </div>
          <Input label="Expiry Date (optional)" type="date" {...register('expires_at')} />
          <p className="text-xs text-gray-400">A unique code will be auto-generated</p>
          <Button type="submit" className="w-full" loading={isSubmitting}>Issue Gift Card</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
