'use client'
import { useState, useEffect } from 'react'
import { Search, CheckCircle2, ChevronLeft, RotateCcw, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { useRouter, useSearchParams } from 'next/navigation'

interface SaleItem {
  id: string
  product_id: string | null
  variant_id: string | null
  name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
  is_service?: boolean
}

interface Sale {
  id: string
  total: number
  subtotal: number
  tax: number
  discount: number
  payment_method: string
  payment_status: string
  created_at: string
  is_refund: boolean
  sale_items: SaleItem[]
  customers: { first_name: string; last_name: string | null } | null
}

export default function RefundPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeBranch, profile } = useAuthStore()

  const [invoiceSearch, setInvoiceSearch] = useState(searchParams.get('sale_id') ?? '')
  const [sale, setSale] = useState<Sale | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  // Per-item state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [refundQtys, setRefundQtys] = useState<Record<string, number>>({})
  const [refundPrices, setRefundPrices] = useState<Record<string, number>>({})

  // Restocking fee
  const [restockEnabled, setRestockEnabled] = useState(false)
  const [restockType, setRestockType] = useState<'$' | '%'>('$')
  const [restockAmount, setRestockAmount] = useState('')

  // Refund method + reason
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'gift_card'>('cash')
  const [refundReason, setRefundReason] = useState('')

  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState<{ total: number; method: string } | null>(null)

  // Auto-search if sale_id provided in URL
  useEffect(() => {
    const id = searchParams.get('sale_id')
    if (id) { setInvoiceSearch(id); doSearch(id) }
  }, []) // eslint-disable-line

  async function doSearch(id?: string) {
    const q = (id ?? invoiceSearch).trim()
    if (!q) return
    setSearching(true)
    setSearchError('')
    setSale(null)
    setSelectedIds(new Set())
    setRefundQtys({})
    setRefundPrices({})
    setRestockEnabled(false)
    setRestockAmount('')

    const res = await fetch(`/api/pos/sales/${q}`)
    if (res.ok) {
      const json = await res.json()
      const s: Sale = json.data
      if (s.is_refund) {
        setSearchError('This record is already a refund.')
      } else if (s.payment_status === 'refunded') {
        setSearchError('This sale has already been fully refunded.')
      } else {
        setSale(s)
        const ids = new Set(s.sale_items.map((i) => i.id))
        const qtys: Record<string, number> = {}
        const prices: Record<string, number> = {}
        s.sale_items.forEach((i) => { qtys[i.id] = i.quantity; prices[i.id] = i.unit_price })
        setSelectedIds(ids)
        setRefundQtys(qtys)
        setRefundPrices(prices)
      }
    } else {
      setSearchError('Sale not found. Check the sale ID or invoice number.')
    }
    setSearching(false)
  }

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (!sale) return
    if (selectedIds.size === sale.sale_items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(sale.sale_items.map((i) => i.id)))
  }

  // ── Calculations ─────────────────────────────────────────────────────────────

  const selectedItems = sale?.sale_items.filter((i) => selectedIds.has(i.id)) ?? []

  const refundSubtotal = selectedItems.reduce((s, i) => {
    const qty = refundQtys[i.id] ?? i.quantity
    const price = refundPrices[i.id] ?? i.unit_price
    return s + price * qty
  }, 0)

  // Prorate tax proportionally
  const origTaxRate = sale && sale.subtotal > 0 ? sale.tax / sale.subtotal : 0
  const refundTax = refundSubtotal * origTaxRate

  const origDiscount = sale?.discount ?? 0
  const origSubtotal = sale?.subtotal ?? 0
  const discountRate = origSubtotal > 0 ? origDiscount / origSubtotal : 0
  const refundDiscount = refundSubtotal * discountRate

  const restockFee = (() => {
    if (!restockEnabled || !restockAmount) return 0
    const amt = parseFloat(restockAmount) || 0
    return restockType === '%' ? (refundSubtotal * amt) / 100 : amt
  })()

  const refundTotal = -(refundSubtotal - refundDiscount + refundTax - restockFee)

  // ── Process Refund ────────────────────────────────────────────────────────────

  async function processRefund() {
    if (!activeBranch || !profile || !sale || selectedItems.length === 0) return
    setProcessing(true)

    const payload = {
      original_sale_id: sale.id,
      branch_id: activeBranch.id,
      cashier_id: profile.id,
      customer_id: null,
      subtotal: -(refundSubtotal - refundDiscount),
      discount: refundDiscount,
      tax: -refundTax,
      total: refundTotal,
      payment_method: refundMethod,
      refund_reason: refundReason || null,
      restocking_fee: restockFee > 0 ? restockFee : null,
      items: selectedItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        name: item.name,
        quantity: -(refundQtys[item.id] ?? item.quantity),
        unit_price: refundPrices[item.id] ?? item.unit_price,
        discount: (refundPrices[item.id] ?? item.unit_price) * discountRate,
        total: -((refundPrices[item.id] ?? item.unit_price) * (refundQtys[item.id] ?? item.quantity)),
        is_service: item.is_service ?? false,
      })),
    }

    const res = await fetch('/api/pos/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setSuccess({ total: Math.abs(refundTotal), method: refundMethod })
    } else {
      const err = await res.json()
      setSearchError(err.message ?? 'Refund failed. Please try again.')
    }
    setProcessing(false)
  }

  // ── Success state ─────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <p className="text-xl font-bold text-green-700">Refund Processed</p>
        <p className="text-sm text-gray-500">
          {formatCurrency(success.total)} refunded via {success.method.replace('_', ' ')}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setSuccess(null); setSale(null); setInvoiceSearch('') }}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Process Another
          </Button>
          <Button className="bg-brand-teal hover:bg-brand-teal-dark" onClick={() => router.push('/pos')}>
            Back to POS
          </Button>
        </div>
      </div>
    )
  }

  // ── Main layout ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Process Refund</h1>
          <p className="text-xs text-gray-500">Search by Sale ID or Invoice number to begin</p>
        </div>
      </div>

      {/* Sale lookup */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Enter sale ID or invoice number..."
            value={invoiceSearch}
            onChange={(e) => setInvoiceSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-brand-teal focus:outline-none"
          />
        </div>
        <Button className="bg-brand-teal hover:bg-brand-teal-dark" onClick={() => doSearch()} loading={searching}>
          Look Up
        </Button>
      </div>

      {searchError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {searchError}
        </div>
      )}

      {/* Refund form */}
      {sale && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

          {/* Invoice header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
            <div>
              <p className="font-bold text-gray-900">
                Invoice #{sale.id.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-xs text-gray-500">
                {sale.customers
                  ? `${sale.customers.first_name} ${sale.customers.last_name ?? ''}`.trim()
                  : 'Walk-in Customer'}
                {' · '}{new Date(sale.created_at).toLocaleDateString()} · {sale.payment_method}
              </p>
            </div>
            <p className="text-base font-bold text-gray-900">{formatCurrency(sale.total)}</p>
          </div>

          {/* Restocking fee toggle */}
          <div className="flex items-center gap-6 border-b border-gray-100 px-6 py-3">
            <p className="text-sm font-medium text-gray-700">Would you like to charge a restocking fee?</p>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input type="radio" checked={restockEnabled} onChange={() => setRestockEnabled(true)} className="accent-[var(--brand-teal)]" />
                Yes
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input type="radio" checked={!restockEnabled} onChange={() => setRestockEnabled(false)} className="accent-[var(--brand-teal)]" />
                No
              </label>
            </div>
          </div>

          {/* Items table */}
          <div>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === sale.sale_items.length}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 accent-[var(--brand-teal)]"
                    />
                  </th>
                  <th className="px-2 py-3 text-left w-16">QTY</th>
                  <th className="px-2 py-3 text-left">Item Name</th>
                  <th className="px-2 py-3 text-right w-28">Price</th>
                  <th className="px-2 py-3 text-right w-24">Tax</th>
                  <th className="px-2 py-3 text-right w-28">Total</th>
                  <th className="px-2 py-3 text-right w-32">Refund Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sale.sale_items.map((item) => {
                  const isSelected = selectedIds.has(item.id)
                  const qty = refundQtys[item.id] ?? item.quantity
                  const price = refundPrices[item.id] ?? item.unit_price
                  const itemTax = price * qty * origTaxRate
                  const refundAmt = -(price * qty - price * qty * discountRate + itemTax)

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${isSelected ? 'bg-red-50' : 'bg-white opacity-60'}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(item.id)}
                          className="h-4 w-4 rounded border-gray-300 accent-[var(--brand-teal)]"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={qty}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(parseInt(e.target.value) || 0, item.quantity))
                            setRefundQtys((r) => ({ ...r, [item.id]: v }))
                            if (v === 0) setSelectedIds((s) => { const n = new Set(s); n.delete(item.id); return n })
                            else if (v > 0) setSelectedIds((s) => new Set([...s, item.id]))
                          }}
                          className="h-8 w-14 rounded border border-gray-200 text-center text-sm focus:border-brand-teal focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-400">Disc = {formatCurrency(item.discount * qty)}</p>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={item.unit_price}
                          step={0.01}
                          value={price}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(parseFloat(e.target.value) || 0, item.unit_price))
                            setRefundPrices((r) => ({ ...r, [item.id]: v }))
                          }}
                          className="h-8 w-24 rounded border border-gray-200 px-2 text-right text-sm focus:border-brand-teal focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-3 text-right text-gray-500">{formatCurrency(itemTax)}</td>
                      <td className="px-2 py-3 text-right font-medium text-gray-900">{formatCurrency(price * qty)}</td>
                      <td className="px-2 py-3 text-right font-semibold text-red-600">{formatCurrency(refundAmt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Restocking fee row */}
            {restockEnabled && (
              <div className="flex items-center gap-3 border-t border-gray-100 px-6 py-3">
                <input
                  type="checkbox" checked readOnly
                  className="h-4 w-4 rounded border-gray-300 accent-[var(--brand-teal)]"
                />
                <span className="text-sm font-medium text-gray-700">Charge Restocking Fee</span>
                <input
                  type="number" min={0} step={0.01} placeholder="0.00"
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(e.target.value)}
                  className="h-8 w-24 rounded border border-gray-200 px-2 text-right text-sm focus:border-brand-teal focus:outline-none"
                />
                <div className="flex overflow-hidden rounded border border-gray-200">
                  <button
                    onClick={() => setRestockType('$')}
                    className={`px-2.5 py-1 text-xs font-medium ${restockType === '$' ? 'bg-brand-teal text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >$</button>
                  <button
                    onClick={() => setRestockType('%')}
                    className={`px-2.5 py-1 text-xs font-medium border-l border-gray-200 ${restockType === '%' ? 'bg-brand-teal text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >%</button>
                </div>
                {restockFee > 0 && (
                  <span className="text-xs text-gray-500">= {formatCurrency(restockFee)}</span>
                )}
              </div>
            )}
          </div>

          {/* Summary + options */}
          <div className="grid grid-cols-2 gap-6 border-t border-gray-100 px-6 py-5">

            {/* Left: Refund method + reason */}
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Refund Method</p>
                <div className="flex gap-2">
                  {(['cash', 'card', 'gift_card'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setRefundMethod(m)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                        refundMethod === m ? 'border-brand-teal bg-brand-teal-light text-brand-teal' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {m === 'gift_card' ? 'Gift Card' : m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                label="Reason for refund (optional)"
                placeholder="e.g. Item defective, customer not satisfied"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
              {selectedItems.length === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Select at least one item to process a refund
                </div>
              )}
            </div>

            {/* Right: Summary */}
            <div className="rounded-xl bg-gray-50 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Total Items</span><span>{selectedItems.reduce((s, i) => s + (refundQtys[i.id] ?? i.quantity), 0)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Sub Total</span><span>{formatCurrency(-refundSubtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Discount</span><span>{formatCurrency(refundDiscount)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Tax</span><span>{formatCurrency(-refundTax)}</span>
              </div>
              {restockFee > 0 && (
                <div className="flex justify-between text-brand-teal">
                  <span>Restocking Fee</span><span>+{formatCurrency(restockFee)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
                <span>Total</span><span className="text-red-600">{formatCurrency(refundTotal)}</span>
              </div>
              <Button
                className="mt-2 w-full bg-green-600 hover:bg-green-700"
                size="lg"
                loading={processing}
                disabled={selectedItems.length === 0}
                onClick={processRefund}
              >
                Proceed
              </Button>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
