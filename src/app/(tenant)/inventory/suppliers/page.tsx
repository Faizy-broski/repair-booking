'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { confirmToast } from '@/lib/confirm-toast'
import {
  Plus, Pencil, Trash2, Truck, Search, Loader2, CreditCard,
  RefreshCw, Banknote, CheckCircle2, AlertCircle,
  Mail, Phone, MapPin, Users, ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/shared/data-table'
import { InventoryNav } from '@/components/inventory/inventory-nav'

// ── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string; name: string; contact_person: string | null
  email: string | null; phone: string | null; city: string | null; country: string | null
  payment_terms_days: number; currency: string; is_active: boolean
}

interface PayablePO {
  id: string
  po_number: string
  created_at: string
  total: number
  amount_paid: number
  payment_status: string
  supplier_id: string
  suppliers?: { name: string } | null
}

const emptyForm = {
  name: '', contact_person: '', email: '', phone: '', mobile: '',
  address: '', city: '', country: '', tax_id: '', notes: '',
  payment_terms_days: 30, currency: 'GBP', is_active: true,
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-orange-100 text-orange-700',
  unpaid: 'bg-purple-100 text-purple-700',
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partial',
  unpaid: 'Unpaid',
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [view, setView] = useState<'suppliers' | 'credit'>(
    searchParams.get('view') === 'credit' ? 'credit' : 'suppliers'
  )

  // ── Suppliers view state ──────────────────────────────────────────────────
  const [search,    setSearch]    = useState('')
  const [modal,     setModal]     = useState<{ open: boolean; editing: Supplier | null }>({ open: false, editing: null })
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-list', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch('/api/suppliers')
      return (await res.json()).data ?? []
    },
    enabled: !!activeBranch,
    staleTime: 5 * 60_000,
  })

  const filtered = suppliers.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  )

  function openModal(editing: Supplier | null = null) {
    setForm(editing ? { ...emptyForm, ...editing, email: editing.email ?? '', phone: editing.phone ?? '', contact_person: editing.contact_person ?? '', city: editing.city ?? '' } : emptyForm)
    setModal({ open: true, editing })
  }

  async function save() {
    setSaving(true)
    const { editing } = modal
    const url    = editing ? `/api/suppliers/${editing.id}` : '/api/suppliers'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, email: form.email || null }),
    })
    setModal({ open: false, editing: null })
    queryClient.invalidateQueries({ queryKey: ['suppliers-list', activeBranch?.id] })
    setSaving(false)
  }

  async function deleteSupplier(id: string) {
    if (!await confirmToast('Delete this supplier?', 'Delete')) return
    await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['suppliers-list', activeBranch?.id] })
  }

  // ── Credit view state ─────────────────────────────────────────────────────
  const [showAll, setShowAll] = useState(false)
  const [paymentPO, setPaymentPO] = useState<PayablePO | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other'>('bank_transfer')

  const { data: purchaseOrders = [], isLoading: creditLoading, isFetching: creditFetching, refetch: refetchCredit } = useQuery<PayablePO[]>({
    queryKey: ['supplier-credits', activeBranch?.id, showAll],
    queryFn: async () => {
      if (!activeBranch?.id) return []
      const params = new URLSearchParams({ branch_id: activeBranch.id, limit: '200' })
      if (!showAll) params.set('outstanding_only', 'true')
      else params.set('status', 'received')
      const res = await fetch(`/api/purchase-orders?${params}`)
      if (!res.ok) return []
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!activeBranch?.id && view === 'credit',
    staleTime: 30_000,
  })

  const outstandingPOs = purchaseOrders.filter(p => p.payment_status !== 'paid')
  const uniqueSuppliersOnCredit = new Set(outstandingPOs.map(p => p.supplier_id).filter(Boolean)).size
  const totalOutstanding = outstandingPOs.reduce((sum, p) => sum + (Number(p.total) - Number(p.amount_paid)), 0)
  const totalCleared = purchaseOrders.filter(p => p.payment_status === 'paid').reduce((sum, p) => sum + Number(p.total), 0)

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentPO) return
      const amount = parseFloat(paymentAmount)
      if (!amount || amount <= 0) throw new Error('Enter a valid amount')
      const outstanding = Number(paymentPO.total) - Number(paymentPO.amount_paid)
      if (amount > outstanding + 0.01) throw new Error(`Cannot exceed outstanding balance of ${formatCurrency(outstanding)}`)
      const res = await fetch(`/api/purchase-orders/${paymentPO.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: paymentMethod }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to record payment')
    },
    onSuccess: () => {
      toast.success('Payment recorded successfully')
      setPaymentPO(null)
      setPaymentAmount('')
      setPaymentMethod('bank_transfer')
      queryClient.invalidateQueries({ queryKey: ['supplier-credits'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const creditColumns: ColumnDef<PayablePO>[] = [
    {
      header: 'Supplier',
      cell: ({ row }) => (
        <Link
          href={`/inventory/suppliers/${row.original.supplier_id}?tab=payments`}
          className="font-medium text-purple-700 hover:underline"
        >
          {row.original.suppliers?.name ?? '—'}
        </Link>
      ),
    },
    {
      header: 'PO #',
      cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.po_number}</span>,
    },
    {
      header: 'Date',
      cell: ({ row }) => <span className="text-sm text-gray-600">{formatDate(row.original.created_at)}</span>,
    },
    {
      header: 'Total',
      cell: ({ row }) => <span className="font-semibold">{formatCurrency(Number(row.original.total))}</span>,
    },
    {
      header: 'Paid',
      cell: ({ row }) => (
        <span className={row.original.amount_paid > 0 ? 'font-medium text-green-700' : 'text-gray-400'}>
          {formatCurrency(Number(row.original.amount_paid))}
        </span>
      ),
    },
    {
      header: 'Outstanding',
      cell: ({ row }) => {
        const owed = Number(row.original.total) - Number(row.original.amount_paid)
        return (
          <span className={owed > 0 ? 'font-bold text-red-600' : 'font-medium text-green-600'}>
            {formatCurrency(Math.max(0, owed))}
          </span>
        )
      },
    },
    {
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.payment_status
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-700'}`}>
            {STATUS_LABELS[s] ?? s}
          </span>
        )
      },
    },
    {
      header: 'Actions',
      cell: ({ row }) => {
        const po = row.original
        return po.payment_status !== 'paid' ? (
          <button
            onClick={() => { setPaymentPO(po); setPaymentAmount(''); setPaymentMethod('bank_transfer') }}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
          >
            <Banknote className="h-3.5 w-3.5" /> Record Payment
          </button>
        ) : null
      },
    },
  ]

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <InventoryNav />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Suppliers</h1>
            <p className="text-sm text-gray-500">
              {view === 'suppliers' ? `${suppliers.length} suppliers` : 'Received purchase orders and outstanding balances owed to suppliers'}
            </p>
          </div>
        </div>
        {view === 'suppliers' ? (
          <Button onClick={() => openModal()}>
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        ) : (
          <button
            onClick={() => refetchCredit()}
            disabled={creditFetching}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${creditFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('suppliers')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            view === 'suppliers'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          <Users className="h-4 w-4" /> Suppliers
        </button>
        <button
          onClick={() => setView('credit')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            view === 'credit'
              ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
              : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
          }`}
        >
          <CreditCard className="h-4 w-4" /> Supplier Credit
        </button>
      </div>

      {view === 'suppliers' && (
        <>
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suppliers..."
              className="h-9 w-full rounded-lg border border-gray-300 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16">
              <Truck className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No suppliers found.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-xl border border-outline-variant/50 bg-white shadow-sm">
              <table className="w-full min-w-[980px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[11%]" />
                  <col className="w-[16%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="bg-primary">
                    <th className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white">Supplier</th>
                    <th className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white">Name</th>
                    <th className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white">Email</th>
                    <th className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white">Phone</th>
                    <th className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white">City</th>
                    <th className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white">Country</th>
                    <th className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white">Terms</th>
                    <th className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white">Currency</th>
                    <th className="px-4 py-3 text-right text-[13px] font-bold uppercase tracking-wider text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr
                      key={s.id}
                      onClick={() => router.push(`/inventory/suppliers/${s.id}?tab=payments`)}
                      className={`group cursor-pointer border-t border-gray-100 transition-colors hover:bg-blue-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="truncate font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{s.name}</span>
                            {!s.is_active && <Badge variant="default">Inactive</Badge>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs">
                        {s.contact_person
                          ? <span className="truncate font-medium text-gray-700">{s.contact_person}</span>
                          : <span className="italic text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-gray-500">
                        {s.email
                          ? <span className="flex min-w-0 items-center gap-1"><Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{s.email}</span></span>
                          : <span className="italic text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-gray-500">
                        {s.phone
                          ? <span className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" /> {s.phone}</span>
                          : <span className="italic text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-gray-500">
                        {s.city
                          ? <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" /> {s.city}</span>
                          : <span className="italic text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-gray-500">
                        {s.country
                          ? <span className="truncate">{s.country}</span>
                          : <span className="italic text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="font-bold text-gray-700">Net {s.payment_terms_days}d</span>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-gray-500">{s.currency}</td>
                      <td className="px-4 py-3 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openModal(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteSupplier(s.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === 'credit' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <Truck className="h-5 w-5 text-purple-600" />
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-500">Suppliers on Credit</p>
                  <p className="text-2xl font-bold text-gray-900">{uniqueSuppliersOnCredit}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-500">Total Outstanding</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-500">Fully Cleared</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalCleared)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter toggle */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm">
              <button
                onClick={() => setShowAll(false)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${!showAll ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Outstanding
              </button>
              <button
                onClick={() => setShowAll(true)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${showAll ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                All Received POs
              </button>
            </div>
          </div>

          {/* Table */}
          {creditLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : purchaseOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16">
              <CreditCard className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">
                {showAll ? 'No received purchase orders found' : 'No outstanding supplier balances'}
              </p>
              <p className="mt-1 text-xs text-gray-400">Purchase orders appear here once goods are received</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              <DataTable columns={creditColumns} data={purchaseOrders} />
            </div>
          )}
        </>
      )}

      {/* Supplier CRUD Modal */}
      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        title={modal.editing ? 'Edit Supplier' : 'New Supplier'}
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="Company Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Input label="Contact Person" value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} />
          </div>

          <div className="col-span-2">
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>

          <Input label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          <Input label="Country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />

          <Input label="Payment Terms (days)" type="number" min="0" value={form.payment_terms_days} onChange={(e) => setForm((f) => ({ ...f, payment_terms_days: Number(e.target.value) }))} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
            >
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="AED">AED</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
            />
          </div>

          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal" />
              Active Supplier
            </label>
          </div>

          <div className="col-span-2 pt-2">
            <Button className="w-full" onClick={save} loading={saving} disabled={!form.name.trim()}>Save Supplier</Button>
          </div>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        open={!!paymentPO}
        onClose={() => { if (!recordPaymentMutation.isPending) setPaymentPO(null) }}
        title="Record Payment"
        size="sm"
      >
        {paymentPO && (() => {
          const outstanding = Math.max(0, Number(paymentPO.total) - Number(paymentPO.amount_paid))
          return (
            <div className="space-y-4">
              <div className="rounded-lg bg-purple-50 px-4 py-3 text-sm">
                <p className="font-semibold text-purple-900">{paymentPO.suppliers?.name ?? '—'} · {paymentPO.po_number}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-purple-600">PO Total</p>
                    <p className="font-bold text-purple-900">{formatCurrency(Number(paymentPO.total))}</p>
                  </div>
                  <div>
                    <p className="text-purple-600">Already Paid</p>
                    <p className="font-bold text-green-700">{formatCurrency(Number(paymentPO.amount_paid))}</p>
                  </div>
                  <div>
                    <p className="text-purple-600">Outstanding</p>
                    <p className="font-bold text-red-600">{formatCurrency(outstanding)}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Amount to record <span className="font-normal text-gray-400">(max {formatCurrency(outstanding)})</span>
                </label>
                <input
                  type="number"
                  min={0.01}
                  max={outstanding}
                  step={0.01}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Paid via</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'card', 'bank_transfer', 'cheque', 'other'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${paymentMethod === m ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      {m.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {parseFloat(paymentAmount) > 0 && (
                <div className="flex justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                  <span className="text-gray-600">Remaining after this payment</span>
                  <span className={`font-semibold ${outstanding - parseFloat(paymentAmount) <= 0.01 ? 'text-green-600' : 'text-amber-700'}`}>
                    {formatCurrency(Math.max(0, outstanding - (parseFloat(paymentAmount) || 0)))}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setPaymentPO(null)}
                  disabled={recordPaymentMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => recordPaymentMutation.mutate()}
                  disabled={recordPaymentMutation.isPending || !paymentAmount || parseFloat(paymentAmount) <= 0}
                >
                  {recordPaymentMutation.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Banknote className="mr-2 h-4 w-4" />}
                  {recordPaymentMutation.isPending ? 'Recording…' : 'Record Payment'}
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
