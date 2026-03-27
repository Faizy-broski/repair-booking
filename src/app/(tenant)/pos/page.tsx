'use client'
import { useState, useEffect, useRef } from 'react'
import { ShoppingCart, Search, Plus, Minus, Trash2, CreditCard, Banknote, Gift, User, UserPlus, X, SplitSquareHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { usePosStore } from '@/store/pos.store'
import type { PaymentSplit } from '@/store/pos.store'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import type { Product, Customer } from '@/types/database'

export default function PosPage() {
  const { activeBranch, profile } = useAuthStore()
  const pos = usePosStore()

  // Product search
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Payment
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [customerSearching, setCustomerSearching] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  // Quick-add customer modal
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [newCustomerSaving, setNewCustomerSaving] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  })

  // Fetch products when product search changes
  useEffect(() => {
    async function fetchProducts() {
      setLoading(true)
      const params = new URLSearchParams({ limit: '100' })
      if (search) params.set('search', search)
      const res = await fetch(`/api/products?${params}`)
      const json = await res.json()
      setProducts(json.data ?? [])
      setLoading(false)
    }
    fetchProducts()
  }, [search])

  // Debounced customer search
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomerResults([])
      setCustomerDropdownOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      setCustomerSearching(true)
      const params = new URLSearchParams({ search: customerSearch, limit: '8' })
      const res = await fetch(`/api/customers?${params}`)
      const json = await res.json()
      setCustomerResults(json.data ?? [])
      setCustomerDropdownOpen(true)
      setCustomerSearching(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [customerSearch])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function attachCustomer(customer: Customer) {
    pos.setCustomer(customer)
    setCustomerSearch('')
    setCustomerDropdownOpen(false)
    setCustomerResults([])
  }

  async function saveNewCustomer() {
    if (!newCustomerForm.first_name.trim()) return
    setNewCustomerSaving(true)
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCustomerForm),
    })
    if (res.ok) {
      const json = await res.json()
      attachCustomer(json.data)
      setNewCustomerOpen(false)
      setNewCustomerForm({ first_name: '', last_name: '', email: '', phone: '' })
    }
    setNewCustomerSaving(false)
  }

  // Split payment local state (amount per method)
  const [splits, setSplits] = useState<Record<string, string>>({ cash: '', card: '', gift_card: '' })

  const splitTotal = Object.values(splits).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const splitRemaining = Math.max(0, pos.total() - splitTotal)
  const splitValid =
    pos.paymentMethod !== 'split' ||
    (Math.abs(splitTotal - pos.total()) < 0.01 &&
      Object.values(splits).some((v) => parseFloat(v) > 0))

  function handlePaymentMethodChange(method: 'cash' | 'card' | 'gift_card' | 'split') {
    pos.setPaymentMethod(method)
    if (method !== 'split') {
      setSplits({ cash: '', card: '', gift_card: '' })
      pos.setPaymentSplits([])
    }
  }

  async function processPayment() {
    if (!activeBranch || !profile) return
    setProcessing(true)

    const paymentSplits: PaymentSplit[] =
      pos.paymentMethod === 'split'
        ? (Object.entries(splits)
            .filter(([, v]) => parseFloat(v) > 0)
            .map(([method, amount]) => ({ method: method as PaymentSplit['method'], amount: parseFloat(amount) })))
        : []

    const payload = {
      branch_id: activeBranch.id,
      cashier_id: profile.id,
      customer_id: pos.customer?.id ?? null,
      subtotal: pos.subtotal(),
      discount: pos.discount,
      tax: pos.taxAmount(),
      total: pos.total(),
      payment_method: pos.paymentMethod,
      payment_splits: paymentSplits.length > 0 ? paymentSplits : undefined,
      gift_card_id: pos.giftCardId,
      gift_card_amount: pos.giftCardAmount || undefined,
      items: pos.cart.map((item) => ({
        product_id: item.product.id,
        variant_id: item.variant?.id ?? null,
        name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount,
        total: (item.unitPrice - item.discount) * item.quantity,
        is_service: item.product.is_service,
      })),
    }

    const res = await fetch('/api/pos/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setSuccess(true)
      pos.clearCart()
      setTimeout(() => {
        setSuccess(false)
        setPaymentOpen(false)
      }, 2000)
    }
    setProcessing(false)
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-4 overflow-hidden">
      {/* Left: Product Grid */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search products or scan barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
                ))
              : filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => pos.addToCart(product)}
                    className="flex flex-col items-start rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-blue-400 hover:shadow-sm transition-all"
                  >
                    <span className="text-sm font-medium text-gray-900 line-clamp-2">{product.name}</span>
                    <span className="mt-auto pt-2 text-base font-bold text-blue-600">
                      {formatCurrency(product.selling_price)}
                    </span>
                  </button>
                ))}
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="flex w-80 shrink-0 flex-col rounded-xl border border-gray-200 bg-white">
        {/* Cart header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-gray-500" />
            <span className="font-medium text-gray-900">Cart</span>
            {pos.itemCount() > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{pos.itemCount()}</span>
            )}
          </div>
          {pos.cart.length > 0 && (
            <button onClick={pos.clearCart} className="text-xs text-gray-400 hover:text-red-500">
              Clear
            </button>
          )}
        </div>

        {/* Customer attach */}
        <div className="border-b border-gray-100 px-4 py-3" ref={customerRef}>
          {pos.customer ? (
            <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <User className="h-4 w-4 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-blue-900">
                    {pos.customer.first_name} {pos.customer.last_name ?? ''}
                  </p>
                  {pos.customer.phone && (
                    <p className="truncate text-xs text-blue-600">{pos.customer.phone}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => pos.setCustomer(null)}
                className="ml-2 shrink-0 text-blue-400 hover:text-blue-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search customer..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onFocus={() => customerResults.length > 0 && setCustomerDropdownOpen(true)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
              />
              {customerDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
                  {customerSearching ? (
                    <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>
                  ) : customerResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400">No customers found</div>
                  ) : (
                    customerResults.map((c) => (
                      <button
                        key={c.id}
                        onMouseDown={() => attachCustomer(c)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
                      >
                        <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">
                            {c.first_name} {c.last_name ?? ''}
                          </p>
                          {c.phone && <p className="truncate text-gray-500">{c.phone}</p>}
                        </div>
                      </button>
                    ))
                  )}
                  <button
                    onMouseDown={() => {
                      setCustomerDropdownOpen(false)
                      setNewCustomerForm((f) => ({ ...f, first_name: customerSearch }))
                      setNewCustomerOpen(true)
                    }}
                    className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add new customer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {pos.cart.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              Add products to cart
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {pos.cart.map((item) => (
                <div key={`${item.product.id}-${item.variant?.id}`} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-gray-900">{item.product.name}</p>
                      {item.variant && <p className="text-xs text-gray-400">{item.variant.name}</p>}
                      <p className="text-xs font-medium text-blue-600">{formatCurrency(item.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => pos.updateQuantity(item.product.id, item.variant?.id ?? null, item.quantity - 1)}
                        className="h-6 w-6 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => pos.updateQuantity(item.product.id, item.variant?.id ?? null, item.quantity + 1)}
                        className="h-6 w-6 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => pos.removeFromCart(item.product.id, item.variant?.id ?? null)}
                        className="ml-1 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Per-line discount */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Disc £</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={item.discount || ''}
                      onChange={(e) =>
                        pos.setItemDiscount(
                          item.product.id,
                          item.variant?.id ?? null,
                          Math.min(parseFloat(e.target.value) || 0, item.unitPrice)
                        )
                      }
                      className="h-6 w-20 rounded border border-gray-200 px-1.5 text-xs focus:border-blue-400 focus:outline-none"
                    />
                    {item.discount > 0 && (
                      <span className="text-xs text-green-600">
                        = {formatCurrency((item.unitPrice - item.discount) * item.quantity)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span>{formatCurrency(pos.subtotal())}</span>
          </div>
          {/* Global discount input */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Discount £</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={pos.discount || ''}
              onChange={(e) => pos.setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
              className="h-7 w-24 rounded border border-gray-200 px-2 text-right text-sm text-green-600 focus:border-blue-400 focus:outline-none"
            />
          </div>
          {pos.taxRate > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tax ({pos.taxRate}%)</span>
              <span>{formatCurrency(pos.taxAmount())}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
            <span>Total</span>
            <span>{formatCurrency(pos.total())}</span>
          </div>
        </div>

        <div className="px-4 pb-4">
          <Button
            className="w-full"
            size="lg"
            disabled={pos.cart.length === 0}
            onClick={() => setPaymentOpen(true)}
          >
            Charge {formatCurrency(pos.total())}
          </Button>
        </div>
      </div>

      {/* Payment Modal */}
      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Complete Payment"
        size="sm"
      >
        {success ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <span className="text-2xl">✓</span>
            </div>
            <p className="font-semibold text-green-700">Payment Successful!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pos.customer && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <User className="h-4 w-4 text-gray-400" />
                <span>{pos.customer.first_name} {pos.customer.last_name ?? ''}</span>
              </div>
            )}
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="flex justify-between text-lg font-bold">
                <span>Total Due</span>
                <span className="text-blue-600">{formatCurrency(pos.total())}</span>
              </div>
            </div>

            {/* Payment method selector */}
            <div className="grid grid-cols-4 gap-2">
              {(['cash', 'card', 'gift_card', 'split'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => handlePaymentMethodChange(method)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
                    pos.paymentMethod === method
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {method === 'cash' && <Banknote className="h-4 w-4" />}
                  {method === 'card' && <CreditCard className="h-4 w-4" />}
                  {method === 'gift_card' && <Gift className="h-4 w-4" />}
                  {method === 'split' && <SplitSquareHorizontal className="h-4 w-4" />}
                  {method === 'gift_card' ? 'Gift' : method === 'split' ? 'Split' : method.charAt(0).toUpperCase() + method.slice(1)}
                </button>
              ))}
            </div>

            {/* Split payment inputs */}
            {pos.paymentMethod === 'split' && (
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                {(['cash', 'card', 'gift_card'] as const).map((method) => (
                  <div key={method} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-gray-500 capitalize">
                      {method === 'gift_card' ? 'Gift Card' : method.charAt(0).toUpperCase() + method.slice(1)}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={splits[method]}
                      onChange={(e) => setSplits((s) => ({ ...s, [method]: e.target.value }))}
                      className="h-8 flex-1 rounded-md border border-gray-300 px-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                ))}
                <div className={`flex justify-between pt-1 text-xs font-medium ${splitRemaining > 0.005 ? 'text-red-600' : 'text-green-600'}`}>
                  <span>Remaining</span>
                  <span>{formatCurrency(splitRemaining)}</span>
                </div>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              loading={processing}
              disabled={!splitValid}
              onClick={processPayment}
            >
              Confirm Payment
            </Button>
          </div>
        )}
      </Modal>

      {/* Quick-add Customer Modal */}
      <Modal
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        title="New Customer"
        size="sm"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name"
              required
              value={newCustomerForm.first_name}
              onChange={(e) => setNewCustomerForm((f) => ({ ...f, first_name: e.target.value }))}
            />
            <Input
              label="Last Name"
              value={newCustomerForm.last_name}
              onChange={(e) => setNewCustomerForm((f) => ({ ...f, last_name: e.target.value }))}
            />
          </div>
          <Input
            label="Phone"
            type="tel"
            value={newCustomerForm.phone}
            onChange={(e) => setNewCustomerForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            value={newCustomerForm.email}
            onChange={(e) => setNewCustomerForm((f) => ({ ...f, email: e.target.value }))}
          />
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setNewCustomerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={newCustomerSaving}
              disabled={!newCustomerForm.first_name.trim()}
              onClick={saveNewCustomer}
            >
              Add & Attach
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
