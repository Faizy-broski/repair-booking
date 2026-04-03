'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Gift, Printer, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { pdf } from '@react-pdf/renderer'
import { GiftCardPdf } from '@/components/pdf/gift-card-pdf'
import type { ColumnDef } from '@tanstack/react-table'

interface GiftCardRow {
  id: string
  code: string
  initial_value: number
  balance: number
  is_active: boolean
  expires_at: string | null
  created_at: string
  customer_ids: string[] | null
  customers?: { first_name: string; last_name: string | null } | null
}

interface CustomerOption { id: string; first_name: string; last_name: string | null }

export default function GiftCardsPage() {
  const { activeBranch } = useAuthStore()
  const [giftCards, setGiftCards] = useState<GiftCardRow[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [qrCard, setQrCard] = useState<GiftCardRow | null>(null)

  // Form state
  const [formValue, setFormValue] = useState('')
  const [formExpiry, setFormExpiry] = useState('')
  const [formCustomerIds, setFormCustomerIds] = useState<string[]>([])
  const [formAllCustomers, setFormAllCustomers] = useState(true)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [custDropdownOpen, setCustDropdownOpen] = useState(false)
  const [custSearch, setCustSearch] = useState('')

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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeBranch || !formValue) return
    setFormSubmitting(true)
    const res = await fetch('/api/gift-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: activeBranch.id,
        initial_value: parseFloat(formValue),
        customer_id: formAllCustomers ? null : (formCustomerIds[0] ?? null),
        customer_ids: formAllCustomers ? [] : formCustomerIds,
        expires_at: formExpiry || null,
      }),
    })
    if (res.ok) {
      setFormValue(''); setFormExpiry(''); setFormCustomerIds([]); setFormAllCustomers(true)
      setSheetOpen(false); fetchData()
    }
    setFormSubmitting(false)
  }

  function toggleCustomer(id: string) {
    setFormCustomerIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const filteredCustomers = customers.filter(c => {
    if (!custSearch) return true
    const name = `${c.first_name} ${c.last_name ?? ''}`.toLowerCase()
    return name.includes(custSearch.toLowerCase())
  })

  async function deactivate(id: string) {
    await fetch(`/api/gift-cards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
    fetchData()
  }

  async function printGiftCard(card: GiftCardRow) {
    const customerName = card.customers
      ? `${card.customers.first_name} ${card.customers.last_name ?? ''}`.trim()
      : undefined
    const blob = await pdf(
      <GiftCardPdf
        code={card.code}
        balance={card.balance}
        initialValue={card.initial_value}
        customerName={customerName}
        expiresAt={card.expires_at ? formatDate(card.expires_at) : null}
        issuedAt={formatDate(card.created_at)}
        storeName={activeBranch?.name ?? 'RepairBooking'}
      />
    ).toBlob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
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
      accessorKey: 'customer_ids',
      header: 'Customer',
      cell: ({ row }) => {
        const ids: string[] = row.original.customer_ids ?? []
        if (ids.length === 0) return <span className="text-xs text-gray-400">All Customers</span>
        // Legacy single customer fallback
        const c = row.original.customers
        if (c && ids.length === 1) return `${c.first_name} ${c.last_name ?? ''}`
        return <span className="text-xs text-gray-600">{ids.length} customer{ids.length > 1 ? 's' : ''}</span>
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
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => printGiftCard(row.original)} className="text-gray-500 hover:text-gray-700">
            <Printer className="h-3.5 w-3.5" />
          </Button>
          {row.original.is_active && (
            <Button size="sm" variant="ghost" onClick={() => deactivate(row.original.id)} className="text-red-500 hover:text-red-700">
              Deactivate
            </Button>
          )}
        </div>
      ),
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
        <form onSubmit={onCreate} className="space-y-4">
          <Input
            label="Value (£)"
            type="number"
            step="0.01"
            required
            value={formValue}
            onChange={e => setFormValue(e.target.value)}
          />

          {/* Customer multi-select */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Customers</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setFormAllCustomers(true); setFormCustomerIds([]) }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  formAllCustomers
                    ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                All Customers
              </button>
              <button
                type="button"
                onClick={() => setFormAllCustomers(false)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  !formAllCustomers
                    ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                Specific Customers
              </button>
            </div>

            {!formAllCustomers && (
              <div className="relative">
                {/* Selected chips */}
                {formCustomerIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formCustomerIds.map(id => {
                      const c = customers.find(cu => cu.id === id)
                      if (!c) return null
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-0.5 text-xs font-medium text-brand-teal">
                          {c.first_name} {c.last_name ?? ''}
                          <button type="button" onClick={() => toggleCustomer(id)} className="hover:text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Search + dropdown */}
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={custSearch}
                  onChange={e => { setCustSearch(e.target.value); setCustDropdownOpen(true) }}
                  onFocus={() => setCustDropdownOpen(true)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
                />
                {custDropdownOpen && (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {filteredCustomers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">No customers found</p>
                    ) : filteredCustomers.map(c => {
                      const selected = formCustomerIds.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { toggleCustomer(c.id); setCustSearch('') }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${selected ? 'bg-brand-teal/5' : ''}`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-brand-teal bg-brand-teal text-white' : 'border-gray-300'}`}>
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">{c.first_name} {c.last_name ?? ''}</span>
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setCustDropdownOpen(false)}
                      className="w-full border-t border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-50"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <Input label="Expiry Date (optional)" type="date" value={formExpiry} onChange={e => setFormExpiry(e.target.value)} />
          <p className="text-xs text-gray-400">A unique code will be auto-generated</p>
          <Button type="submit" className="w-full" loading={formSubmitting} disabled={!formValue}>Issue Gift Card</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
