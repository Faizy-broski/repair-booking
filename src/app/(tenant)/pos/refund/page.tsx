'use client'
import { useState } from 'react'
import { Search, RotateCcw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'

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
  payment_method: string
  payment_status: string
  created_at: string
  is_refund: boolean
  sale_items: SaleItem[]
  customers: { first_name: string; last_name: string | null } | null
}

export default function RefundPage() {
  const { activeBranch, profile } = useAuthStore()

  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [sale, setSale] = useState<Sale | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [selectedQtys, setSelectedQtys] = useState<Record<string, number>>({})
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'gift_card'>('cash')
  const [refundReason, setRefundReason] = useState('')

  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)

  async function searchSale() {
    if (!invoiceSearch.trim()) return
    setSearching(true)
    setSearchError('')
    setSale(null)
    setSelectedQtys({})

    const res = await fetch(`/api/pos/sales/${invoiceSearch.trim()}`)
    if (res.ok) {
      const json = await res.json()
      const s: Sale = json.data
      if (s.is_refund) {
        setSearchError('This record is already a refund.')
      } else if (s.payment_status === 'refunded') {
        setSearchError('This sale has already been refunded.')
      } else {
        setSale(s)
        // Default: select all items at full quantity
        const qtys: Record<string, number> = {}
        s.sale_items.forEach((item) => { qtys[item.id] = item.quantity })
        setSelectedQtys(qtys)
      }
    } else {
      setSearchError('Sale not found. Check the sale ID.')
    }
    setSearching(false)
  }

  function setQty(itemId: string, qty: number) {
    const item = sale?.sale_items.find((i) => i.id === itemId)
    if (!item) return
    setSelectedQtys((q) => ({ ...q, [itemId]: Math.max(0, Math.min(qty, item.quantity)) }))
  }

  const refundItems = sale?.sale_items.filter((i) => (selectedQtys[i.id] ?? 0) > 0) ?? []
  const refundSubtotal = refundItems.reduce(
    (s, i) => s + i.unit_price * (selectedQtys[i.id] ?? 0),
    0
  )
  const refundTotal = refundSubtotal // simplified — tax proration omitted for now

  async function processRefund() {
    if (!activeBranch || !profile || !sale || refundItems.length === 0) return
    setProcessing(true)

    const payload = {
      original_sale_id: sale.id,
      branch_id: activeBranch.id,
      cashier_id: profile.id,
      customer_id: sale.customers ? undefined : null,
      subtotal: refundSubtotal,
      tax: 0,
      total: refundTotal,
      payment_method: refundMethod,
      refund_reason: refundReason || null,
      items: refundItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        name: item.name,
        quantity: selectedQtys[item.id] ?? 0,
        unit_price: item.unit_price,
        total: item.unit_price * (selectedQtys[item.id] ?? 0),
        is_service: item.is_service ?? false,
      })),
    }

    const res = await fetch('/api/pos/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setSuccess(true)
    } else {
      const err = await res.json()
      setSearchError(err.message ?? 'Refund failed.')
    }
    setProcessing(false)
  }

  if (success) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <p className="text-lg font-semibold text-green-700">Refund Processed</p>
        <p className="text-sm text-gray-500">
          {formatCurrency(refundTotal)} refunded via {refundMethod.replace('_', ' ')}
        </p>
        <Button variant="outline" onClick={() => { setSuccess(false); setSale(null); setInvoiceSearch('') }}>
          Process Another
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Process Refund</h1>
        <p className="text-sm text-gray-500">Enter a sale ID to look up the transaction</p>
      </div>

      {/* Sale lookup */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Paste sale ID..."
            value={invoiceSearch}
            onChange={(e) => setInvoiceSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchSale()}
          />
        </div>
        <Button onClick={searchSale} loading={searching}>
          <Search className="mr-2 h-4 w-4" />
          Look Up
        </Button>
      </div>

      {searchError && (
        <p className="text-sm text-red-600">{searchError}</p>
      )}

      {sale && (
        <div className="rounded-xl border border-gray-200 bg-white">
          {/* Sale summary */}
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {sale.customers
                    ? `${sale.customers.first_name} ${sale.customers.last_name ?? ''}`.trim()
                    : 'Walk-in Customer'}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(sale.created_at).toLocaleDateString()} · {sale.payment_method}
                </p>
              </div>
              <p className="text-base font-bold text-gray-900">{formatCurrency(sale.total)}</p>
            </div>
          </div>

          {/* Item selector */}
          <div className="divide-y divide-gray-50">
            {sale.sale_items.map((item) => {
              const qty = selectedQtys[item.id] ?? 0
              return (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(item.unit_price)} × {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">Qty:</span>
                    <input
                      type="number"
                      min="0"
                      max={item.quantity}
                      value={qty}
                      onChange={(e) => setQty(item.id, parseInt(e.target.value) || 0)}
                      className="h-7 w-16 rounded border border-gray-300 px-2 text-center text-sm focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Refund options */}
          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            <Input
              label="Reason (optional)"
              placeholder="e.g. Item defective"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />

            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-700">Refund Method</p>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'card', 'gift_card'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRefundMethod(m)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      refundMethod === m
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {m === 'gift_card' ? 'Gift Card' : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm text-gray-500">Refund Total</p>
                <p className="text-lg font-bold text-red-600">-{formatCurrency(refundTotal)}</p>
              </div>
              <Button
                onClick={processRefund}
                loading={processing}
                disabled={refundItems.length === 0 || refundTotal <= 0}
                className="bg-red-600 hover:bg-red-700"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Process Refund
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
