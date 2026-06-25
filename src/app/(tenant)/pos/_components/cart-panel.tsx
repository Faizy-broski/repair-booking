'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Minus, Trash2, UserPlus, X, AlertTriangle,
  Gift, Phone, Mail, ExternalLink, CheckCircle2, DollarSign,
  Banknote, SplitSquareHorizontal, Check, ChevronUp, ChevronDown, CreditCard, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { usePosStore } from '@/store/pos.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { AsyncEmployeeSelect } from '@/components/shared/async-employee-select'
import type { PaymentSplit } from '@/store/pos.store'
import { formatCurrency, formatDateTime, getCurrencySymbol } from '@/lib/utils'
import { pdf } from '@react-pdf/renderer'
import { SaleReceiptPdf } from '@/components/pdf/sale-receipt-pdf'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Customer, Product } from '@/types/database'
import type { ProductWithStock } from '../_types'
import { ScannerModal } from '@/components/scanner/scanner-modal'
import { useBarcodeLookup, type ProductWithStock as ScannedProduct } from '@/hooks/use-barcode-lookup'

interface Props {
  mobileView: 'browse' | 'cart'
}

function DiscountInput({ value, max, onChange, className }: { value: number; max: number; onChange: (v: number) => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const externalValue = useRef(value)

  // Only push external value changes into the DOM when the input is not focused
  useEffect(() => {
    if (externalValue.current !== value) {
      externalValue.current = value
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.value = value === 0 ? '' : String(value)
      }
    }
  }, [value])

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      defaultValue={value === 0 ? '' : String(value)}
      placeholder="0"
      onChange={e => {
        const raw = e.target.value
        if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
          const num = parseFloat(raw)
          if (!isNaN(num)) onChange(Math.min(num, max))
          else if (raw === '') onChange(0)
        } else {
          // Reject invalid character — restore previous valid value in DOM
          e.target.value = e.target.value.slice(0, -1)
        }
      }}
      onBlur={e => {
        const num = Math.min(parseFloat(e.target.value) || 0, max)
        e.target.value = num === 0 ? '' : String(num)
        onChange(num)
        externalValue.current = num
      }}
      className={className}
    />
  )
}

export function CartPanel({ mobileView }: Props) {
  const router = useRouter()
  const { activeBranch, profile, verticalTemplateSlug, currency } = useAuthStore()
  const pos = usePosStore()
  const queryClient = useQueryClient()
  const { isModuleEnabled } = useModuleConfigStore()
  // "Served By" + per-sale commission entry is specific to the retail-store
  // vertical template, independent of any module's enabled/disabled state.
  const isRetailTemplate = verticalTemplateSlug === 'retail-store'

  // ── Customer state ─────────────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch]         = useState('')
  const [customerResults, setCustomerResults]       = useState<Customer[]>([])
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [customerSearching, setCustomerSearching]   = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)
  const [newCustomerOpen, setNewCustomerOpen]       = useState(false)
  const [newCustomerSaving, setNewCustomerSaving]   = useState(false)
  const [newCustomerForm, setNewCustomerForm]       = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [outstandingBalance, setOutstandingBalance] = useState(0)
  const [outstandingOpen, setOutstandingOpen]       = useState(false)

  // ── Payment state ──────────────────────────────────────────────────────────
  const [paymentOpen, setPaymentOpen]       = useState(false)
  const [processing, setProcessing]         = useState(false)
  const [success, setSuccess]               = useState(false)
  const [splits, setSplits]                 = useState<Record<string, string>>({ cash: '', card: '' })
  const [cashTendered, setCashTendered]     = useState('')
  const [discountType, setDiscountType]     = useState<'fixed' | 'percent'>('fixed')

  // ── Gift card state ────────────────────────────────────────────────────────
  const [gcCode, setGcCode]           = useState('')
  const [gcLooking, setGcLooking]     = useState(false)
  const [gcError, setGcError]         = useState('')
  const [gcModalOpen, setGcModalOpen] = useState(false)

  // ── Checkout panel collapsed/expanded (mobile) ────────────────────────────
  const [showFullTotals, setShowFullTotals] = useState(false)

  // ── Served by employee + per-sale commission (retail-store only) ───────────
  const [servedByEmployeeId, setServedByEmployeeId] = useState('')
  const [commissionAmount, setCommissionAmount] = useState('')
  const [commissionType, setCommissionType] = useState<'flat' | 'percentage'>('flat')

  const { data: invoiceSettings = null } = useQuery({
    queryKey: ['invoice-settings', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/settings/invoice?branch_id=${activeBranch!.id}`)
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 0,
  })

  // ── Computed totals ────────────────────────────────────────────────────────
  const subtotal        = pos.subtotal()
  const grossSubtotal   = pos.cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const itemDiscTotal   = pos.cart.reduce((s, i) => s + i.discount * i.quantity, 0)
  const discountAmt     = discountType === 'percent' ? subtotal * (pos.discount / 100) : pos.discount
  const totalDiscount   = itemDiscTotal + discountAmt
  const taxAmt          = (subtotal - discountAmt) * (pos.taxRate / 100)
  const total           = Math.max(0, subtotal - discountAmt + taxAmt)
  const totalDue        = Math.max(0, total - pos.giftCardAmount - pos.storeCreditAmount - pos.loyaltyPointsAmount)
  const splitTotal      = Object.values(splits).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const splitRemaining  = Math.max(0, totalDue - splitTotal)
  const splitValid      = pos.paymentMethod !== 'split' ||
    (Math.abs(splitTotal - totalDue) < 0.01 && Object.values(splits).some(v => parseFloat(v) > 0))

  // ── Customer search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); setCustomerDropdownOpen(false); return }
    const t = setTimeout(async () => {
      setCustomerSearching(true)
      const res = await fetch(`/api/customers?search=${encodeURIComponent(customerSearch)}&limit=8`)
      const j = await res.json()
      setCustomerResults(j.data ?? [])
      setCustomerDropdownOpen(true)
      setCustomerSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  useEffect(() => {
    function h(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node))
        setCustomerDropdownOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function attachCustomer(c: Customer) {
    pos.setCustomer(c)
    setCustomerSearch(''); setCustomerDropdownOpen(false); setCustomerResults([])
    const res = await fetch(`/api/invoices?customer_id=${c.id}&status=unpaid&limit=50`)
    if (res.ok) {
      const j = await res.json()
      const bal = (j.data ?? []).reduce((s: number, inv: any) => s + (inv.total - (inv.amount_paid ?? 0)), 0)
      if (bal > 0.01) { setOutstandingBalance(bal); setOutstandingOpen(true) }
      else setOutstandingBalance(0)
    }
  }

  async function saveNewCustomer() {
    if (!newCustomerForm.first_name.trim()) return
    setNewCustomerSaving(true)
    const res = await fetch('/api/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCustomerForm),
    })
    if (res.ok) {
      const j = await res.json()
      await attachCustomer(j.data)
      setNewCustomerOpen(false)
      setNewCustomerForm({ first_name: '', last_name: '', email: '', phone: '' })
    }
    setNewCustomerSaving(false)
  }

  // ── Gift card ──────────────────────────────────────────────────────────────
  async function lookupGiftCard() {
    if (!gcCode.trim() || !activeBranch) return
    setGcLooking(true); setGcError('')
    const params = new URLSearchParams({ code: gcCode, branch_id: activeBranch.id })
    if (pos.customer?.id) params.set('customer_id', pos.customer.id)
    const res = await fetch(`/api/gift-cards?${params}`)
    const j = await res.json()
    const card = j.data
    if (!card || card.balance <= 0) {
      setGcError('Gift card not found, has no balance, or not valid for this customer')
      setGcLooking(false); return
    }
    pos.setGiftCard(card.id, Math.min(card.balance, total))
    pos.setPaymentMethod('gift_card')
    setGcCode(''); setGcLooking(false)
  }

  // ── Receipt helper ─────────────────────────────────────────────────────────
  async function printReceipt(saleId: string, paymentMethod: string, paymentSplits?: PaymentSplit[], paymentStatus?: string, amountPaid?: number) {
    try {
      const customerName = pos.customer
        ? `${pos.customer.first_name} ${pos.customer.last_name ?? ''}`.trim()
        : 'Walk-In Customer'
      const cartSnapshot = pos.cart.map(item => ({
        name: item.variant ? `${item.product.name} – ${item.variant.name}` : item.product.name,
        quantity: item.quantity, unit_price: item.unitPrice, discount: item.discount,
        total: (item.unitPrice - item.discount) * item.quantity,
      }))
      const blob = await pdf(
        <SaleReceiptPdf
          saleId={saleId}
          date={formatDateTime(new Date().toISOString())}
          customerName={customerName}
          cashierName={profile?.full_name ?? '—'}
          paymentMethod={paymentMethod}
          paymentStatus={paymentStatus ?? 'paid'}
          amountPaid={amountPaid}
          items={cartSnapshot}
          subtotal={subtotal} discount={discountAmt} tax={taxAmt} total={total}
          paymentSplits={paymentSplits?.map(s => ({ method: s.method, amount: s.amount }))}
          branchName={activeBranch?.name}
          branchAddress={activeBranch?.address ?? undefined}
          branchPhone={activeBranch?.phone ?? undefined}
          branchEmail={activeBranch?.email ?? undefined}
          logoUrl={(activeBranch as any)?.logo_url ?? undefined}
          currency={currency}
          taxRate={pos.taxRate > 0 ? pos.taxRate : undefined}
          settings={invoiceSettings ?? undefined}
        />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const win = window.open(url)
      if (win) win.addEventListener('load', () => win.print())
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch { /* receipt print is best-effort */ }
  }

  // ── Process payment (full / split / gift card) ─────────────────────────────
  async function processPayment() {
    if (!activeBranch || !profile) return
    setProcessing(true)

    const cartSnapshot = [...pos.cart]
    const paymentMethod = pos.paymentMethod
    const paymentSplits: PaymentSplit[] = paymentMethod === 'split'
      ? Object.entries(splits).filter(([, v]) => parseFloat(v) > 0)
          .map(([method, amount]) => ({ method: method as PaymentSplit['method'], amount: parseFloat(amount) }))
      : []

    const payload = {
      branch_id: activeBranch.id, cashier_id: profile.id,
      customer_id: pos.customer?.id ?? null,
      subtotal, discount: discountAmt, tax: taxAmt, total,
      payment_method: paymentMethod,
      payment_splits: paymentSplits.length > 0 ? paymentSplits : undefined,
      gift_card_id: pos.giftCardId, gift_card_amount: pos.giftCardAmount || undefined,
      served_by_employee_id: servedByEmployeeId || null,
      commission_amount: servedByEmployeeId && commissionAmount ? parseFloat(commissionAmount) : null,
      commission_type: servedByEmployeeId && commissionAmount ? commissionType : null,
      items: pos.cart.map(item => ({
        product_id: item.product.id, variant_id: item.variant?.id ?? null,
        name: item.variant ? `${item.product.name} – ${item.variant.name}` : item.product.name,
        quantity: item.quantity, unit_price: item.unitPrice,
        discount: item.discount, total: (item.unitPrice - item.discount) * item.quantity,
        is_service: item.product.is_service,
      })),
    }

    // Optimistic update: clear cart and show success before server responds
    setSuccess(true)
    pos.clearCart()
    setCashTendered('')

    const res = await fetch('/api/pos/sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const saleJson = await res.json()
      setServedByEmployeeId(''); setCommissionAmount(''); setCommissionType('flat')
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      await printReceipt(saleJson.data?.sale_id ?? 'unknown', paymentMethod, paymentSplits)
      setTimeout(() => { setSuccess(false); setPaymentOpen(false) }, 2500)
    } else {
      // Rollback: restore cart and hide success screen
      pos.restoreCart(cartSnapshot)
      setSuccess(false)
      const errJson = await res.json().catch(() => ({}))
      const msg = errJson?.error?.message ?? errJson?.message ?? 'Payment failed. Please try again.'
      toast.error(msg)
      setServedByEmployeeId(''); setCommissionAmount(''); setCommissionType('flat')
    }
    setProcessing(false)
  }

  // ── Cash payment shortcut ──────────────────────────────────────────────────
  async function processCashPayment() {
    if (!activeBranch || !profile || pos.cart.length === 0) return
    setProcessing(true)

    const cartSnapshot = [...pos.cart]
    const itemsPayload = pos.cart.map(item => ({
      product_id: item.product.id, variant_id: item.variant?.id ?? null,
      name: item.product.name, quantity: item.quantity, unit_price: item.unitPrice,
      discount: item.discount, total: (item.unitPrice - item.discount) * item.quantity,
      is_service: item.product.is_service,
    }))

    // Optimistic update: clear cart and show success before server responds
    setSuccess(true)
    pos.clearCart()
    setCashTendered('')

    const res = await fetch('/api/pos/sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: activeBranch.id, cashier_id: profile.id,
        customer_id: pos.customer?.id ?? null,
        subtotal, discount: discountAmt, tax: taxAmt, total,
        payment_method: 'cash',
        served_by_employee_id: servedByEmployeeId || null,
        commission_amount: servedByEmployeeId && commissionAmount ? parseFloat(commissionAmount) : null,
        commission_type: servedByEmployeeId && commissionAmount ? commissionType : null,
        items: itemsPayload,
      }),
    })

    if (res.ok) {
      const saleJson = await res.json()
      setServedByEmployeeId(''); setCommissionAmount(''); setCommissionType('flat')
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      await printReceipt(saleJson.data?.sale_id ?? 'unknown', 'cash')
      setTimeout(() => setSuccess(false), 2500)
    } else {
      // Rollback: restore cart and hide success screen
      pos.restoreCart(cartSnapshot)
      setSuccess(false)
      const errJson = await res.json().catch(() => ({}))
      const msg = errJson?.error?.message ?? errJson?.message ?? 'Payment failed. Please try again.'
      toast.error(msg)
      setServedByEmployeeId(''); setCommissionAmount(''); setCommissionType('flat')
    }
    setProcessing(false)
  }

  // ── Credit (on-account) payment state ─────────────────────────────────────
  const [creditOpen, setCreditOpen] = useState(false)
  const [creditDepositAmount, setCreditDepositAmount] = useState('')
  const [creditDepositMethod, setCreditDepositMethod] = useState<'cash' | 'card'>('cash')
  const [creditIsEmployee, setCreditIsEmployee] = useState(false)
  const [creditEmployeeId, setCreditEmployeeId] = useState('')
  const [creditEmployeeName, setCreditEmployeeName] = useState('')
  const [creditCustomerSearch, setCreditCustomerSearch] = useState('')
  const [creditCustomerResults, setCreditCustomerResults] = useState<Customer[]>([])
  const [creditCustomerSearching, setCreditCustomerSearching] = useState(false)

  useEffect(() => {
    if (!creditCustomerSearch.trim()) { setCreditCustomerResults([]); return }
    const t = setTimeout(async () => {
      setCreditCustomerSearching(true)
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(creditCustomerSearch)}&limit=6`)
        const json = await res.json()
        setCreditCustomerResults((json.data ?? []) as Customer[])
      } finally { setCreditCustomerSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [creditCustomerSearch])

  async function processCreditPayment() {
    if (!activeBranch || !profile || pos.cart.length === 0) return
    if (!creditIsEmployee && !pos.customer) return
    if (creditIsEmployee && !creditEmployeeId) { toast.error('Select an employee'); return }
    const deposit = Math.max(0, parseFloat(creditDepositAmount) || 0)
    setProcessing(true)

    const cartSnapshot = [...pos.cart]
    const itemsPayload = pos.cart.map(item => ({
      product_id: item.product.id, variant_id: item.variant?.id ?? null,
      name: item.variant ? `${item.product.name} – ${item.variant.name}` : item.product.name,
      quantity: item.quantity, unit_price: item.unitPrice,
      discount: item.discount, total: (item.unitPrice - item.discount) * item.quantity,
      is_service: item.product.is_service,
    }))

    setCreditOpen(false)
    setSuccess(true)
    pos.clearCart()
    setCreditDepositAmount('')

    const res = await fetch('/api/pos/sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: activeBranch.id, cashier_id: profile.id,
        customer_id: creditIsEmployee ? null : pos.customer?.id,
        employee_id: creditIsEmployee ? creditEmployeeId || null : null,
        subtotal, discount: discountAmt, tax: taxAmt, total,
        payment_method: 'on_account',
        amount_paid: deposit,
        payment_splits: deposit > 0 ? [{ method: creditDepositMethod, amount: deposit }] : [],
        served_by_employee_id: servedByEmployeeId || null,
        commission_amount: servedByEmployeeId && commissionAmount ? parseFloat(commissionAmount) : null,
        commission_type: servedByEmployeeId && commissionAmount ? commissionType : null,
        items: itemsPayload,
      }),
    })

    if (res.ok) {
      const saleJson = await res.json()
      setServedByEmployeeId(''); setCommissionAmount(''); setCommissionType('flat')
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      queryClient.invalidateQueries({ queryKey: ['credits'] })
      const creditStatus = deposit <= 0 ? 'on_account' : deposit >= total ? 'paid' : 'partial'
      const depositSplits = deposit > 0 ? [{ method: creditDepositMethod as PaymentSplit['method'], amount: deposit }] : undefined
      await printReceipt(saleJson.data?.sale_id ?? 'unknown', 'on_account', depositSplits, creditStatus, deposit)
      setTimeout(() => { setSuccess(false) }, 2500)
    } else {
      pos.restoreCart(cartSnapshot)
      setSuccess(false)
      setCreditOpen(true)
      const errJson = await res.json().catch(() => ({}))
      toast.error(errJson?.error?.message ?? 'Payment failed. Please try again.')
      setServedByEmployeeId(''); setCommissionAmount(''); setCommissionType('flat')
    }
    setProcessing(false)
  }

  // ── Scanner modal state ────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerDefaultState, setScannerDefaultState] = useState<'scanning' | 'not_found' | 'found'>('scanning')
  const [scannerDefaultBarcode, setScannerDefaultBarcode] = useState<string | undefined>()
  const [scannerDefaultProduct, setScannerDefaultProduct] = useState<ScannedProduct | null>(null)

  const { lookup } = useBarcodeLookup(activeBranch?.id ?? null)

  // ── Barcode scan ───────────────────────────────────────────────────────────
  async function handleBarcodeScan(val: string) {
    if (!val) return
    const res = await lookup(val)
    if (res.status === 'found' && res.product) {
      if (res.matchedVariant) {
        pos.addToCart(res.product as any, res.matchedVariant as any)
        return
      }
      setScannerDefaultState('found')
      setScannerDefaultBarcode(val)
      setScannerDefaultProduct(res.product)
      setScannerOpen(true)
    } else if (res.status === 'not_found') {
      setScannerDefaultState('not_found')
      setScannerDefaultBarcode(val)
      setScannerDefaultProduct(null)
      setScannerOpen(true)
    }
  }

  return (
    <div className={`flex-col border-r border-gray-200 bg-white overflow-hidden lg:flex lg:w-[35%] lg:min-w-[300px] lg:max-w-[460px] lg:shrink-0 ${mobileView === 'cart' ? 'flex w-full' : 'hidden'}`}>

      {/* Re-open ticket shortcut */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-1.5">
        <button
          onClick={() => router.push('/repairs')}
          className="shrink-0 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 whitespace-nowrap"
        >
          Re-open in POS
        </button>
      </div>

      {/* Customer section */}
      <div className="border-b border-gray-100 px-3 py-2" ref={customerRef}>
        {pos.customer ? (
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-white">
                  {pos.customer.first_name?.[0]?.toUpperCase()}{pos.customer.last_name?.[0]?.toUpperCase() ?? ''}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900 text-sm">{pos.customer.first_name} {pos.customer.last_name ?? ''}</p>
                  {outstandingBalance > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                      <AlertTriangle className="h-3 w-3" /> Outstanding {formatCurrency(outstandingBalance)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 ml-1">
                <button onClick={() => router.push(`/customers/${pos.customer!.id}`)} className="rounded p-1 text-gray-400 hover:text-brand-teal">
                  <ExternalLink className="h-3 w-3" />
                </button>
                <button onClick={() => pos.setCustomer(null)} className="rounded p-1 text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
              {pos.customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{pos.customer.phone}</span>}
              {pos.customer.email && <span className="flex items-center gap-1 min-w-0"><Mail className="h-3 w-3" /><span className="truncate">{pos.customer.email}</span></span>}
              <button onClick={() => router.push(`/invoices?customer_id=${pos.customer!.id}`)} className="flex items-center gap-0.5 text-blue-500 hover:underline">
                History <ExternalLink className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" placeholder="Search customer by name, phone, email..."
                  value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  onFocus={() => customerResults.length > 0 && setCustomerDropdownOpen(true)}
                  className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-2 text-sm focus:border-brand-teal focus:bg-white focus:outline-none"
                />
              </div>
              <button
                onClick={() => { setNewCustomerForm(f => ({ ...f, first_name: customerSearch })); setNewCustomerOpen(true) }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal text-white hover:bg-brand-teal-dark"
                title="Add new customer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {customerDropdownOpen && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-gray-200 bg-white shadow-xl">
                {customerSearching ? (
                  <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>
                ) : customerResults.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">No results</div>
                ) : customerResults.map(c => (
                  <button key={c.id} onMouseDown={() => attachCustomer(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-teal-light text-sm font-bold text-brand-teal">
                      {c.first_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{c.first_name} {c.last_name ?? ''}</p>
                      {c.phone && <p className="text-sm text-gray-500">{c.phone}</p>}
                    </div>
                  </button>
                ))}
                <button
                  onMouseDown={() => { setCustomerDropdownOpen(false); setNewCustomerOpen(true) }}
                  className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-xs font-medium text-brand-teal hover:bg-brand-teal-light"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add new customer
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barcode scan */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Enter item name, SKU or scan barcode"
            className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-2 text-base focus:border-brand-teal focus:bg-white focus:outline-none"
            onKeyDown={async e => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value.trim()
                await handleBarcodeScan(val)
                ;(e.target as HTMLInputElement).value = ''
              }
            }}
          />
        </div>
      </div>

      {/* Cart table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pos.cart.length === 0 ? (
          <div className="flex h-full items-center justify-center text-base text-gray-400">No items added yet</div>
        ) : (
          <table className="w-full table-fixed text-base">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-[88px] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">QTY</th>
                <th className="px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item</th>
                <th className="w-[78px] px-2 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Disc</th>
                <th className="w-[80px] px-2 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Total</th>
                <th className="w-[32px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pos.cart.map(item => {
                const lineTotal = (item.unitPrice - item.discount) * item.quantity
                return (
                  <tr key={`${item.product.id}-${item.variant?.id}`} className="bg-white hover:bg-gray-50">
                    <td className="px-2 py-2.5 align-middle">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => pos.updateQuantity(item.product.id, item.variant?.id ?? null, item.quantity - 1)} className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md bg-red-100 hover:bg-red-200 text-red-600 transition-colors">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 sm:w-7 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                        <button onClick={() => pos.updateQuantity(item.product.id, item.variant?.id ?? null, item.quantity + 1)} className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md bg-green-100 hover:bg-green-200 text-green-600 transition-colors">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 align-middle overflow-hidden">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {item.product.name}
                        {item.variant && <span className="font-normal text-indigo-600"> · {item.variant.name}</span>}
                      </p>
                      {(item.variant?.sku ?? item.product.sku) && (
                        <p className="text-gray-400 text-xs truncate">#{item.variant?.sku ?? item.product.sku}</p>
                      )}
                      <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice)}</p>
                    </td>
                    <td className="px-2 py-2.5 align-middle">
                      <DiscountInput
                        value={item.discount}
                        max={item.unitPrice}
                        onChange={v => pos.setItemDiscount(item.product.id, item.variant?.id ?? null, v)}
                        className="h-8 sm:h-9 w-full rounded-md border border-gray-300 px-1.5 text-right text-sm font-medium text-green-600 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
                      />
                    </td>
                    <td className="px-2 py-2.5 align-middle text-right font-bold text-gray-900 text-xs">{formatCurrency(lineTotal)}</td>
                    <td className="px-2 py-2.5 align-middle">
                      <button onClick={() => pos.removeFromCart(item.product.id, item.variant?.id ?? null)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Checkout panel — collapsible on mobile */}
      <div className="shrink-0 border-t-2 border-gray-200 bg-gray-50 overflow-y-auto max-h-[55vh] lg:max-h-[50vh]">

        {/* Expanded details (Discount, Gift Card, Sub Total breakdown) */}
        {showFullTotals && (
          <div className="px-4 pt-3 pb-2 space-y-2">
            <div className="flex justify-between text-sm text-gray-500"><span>Total Items</span><span className="font-semibold text-gray-700">{pos.itemCount()}</span></div>
            <div className="flex justify-between text-sm text-gray-600"><span>Sub Total</span><span className="font-medium text-gray-800">{formatCurrency(grossSubtotal)}</span></div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-600">Discount</span>
                <div className="flex overflow-hidden rounded border border-gray-200">
                  <button onClick={() => setDiscountType('fixed')}   className={`px-2 py-0.5 text-sm font-medium ${discountType === 'fixed'   ? 'bg-brand-teal text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>£</button>
                  <button onClick={() => setDiscountType('percent')} className={`px-2 py-0.5 text-sm font-medium ${discountType === 'percent' ? 'bg-brand-teal text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>%</button>
                </div>
              </div>
              <input
                type="number" min="0" step="0.01" placeholder="0"
                value={pos.discount || ''}
                onChange={e => pos.setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-8 w-24 rounded border border-gray-200 px-2 text-right text-sm text-green-700 focus:border-brand-teal focus:outline-none"
              />
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm font-medium text-green-600"><span>Discount Applied</span><span>-{formatCurrency(totalDiscount)}</span></div>
            )}
            {/* Gift card */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex shrink-0 items-center gap-1.5">
                <Gift className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Gift Card</span>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 justify-end">
                <input
                  type="text" placeholder="Enter code"
                  value={gcCode}
                  onChange={e => { setGcCode(e.target.value); setGcError('') }}
                  className="h-8 min-w-0 flex-1 max-w-[120px] rounded border border-gray-200 px-2 text-right text-sm text-purple-700 focus:border-purple-400 focus:outline-none"
                />
                <button
                  onClick={() => pos.cart.length > 0 && setGcModalOpen(true)}
                  disabled={!gcCode.trim() || pos.cart.length === 0}
                  className="h-8 shrink-0 rounded bg-purple-600 px-3 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
            {gcError && <p className="text-xs text-red-500">{gcError}</p>}
            {pos.taxRate > 0 && (
              <div className="flex justify-between text-sm text-gray-500"><span>Tax ({pos.taxRate}%)</span><span>{formatCurrency(taxAmt)}</span></div>
            )}
          </div>
        )}

        {/* Always-visible total bar + toggle */}
        <button
          onClick={() => setShowFullTotals(v => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-gray-100 transition-colors"
        >
          <span className="text-base font-bold text-gray-900">Total</span>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">{formatCurrency(total)}</span>
            {showFullTotals
              ? <ChevronDown className="h-4 w-4 text-gray-500" />
              : <ChevronUp className="h-4 w-4 text-gray-500" />
            }
          </div>
        </button>

        {/* Served By employee selector + per-sale commission (retail-store only) */}
        {activeBranch && isRetailTemplate && isModuleEnabled('employees') && (
          <div className="border-t border-gray-100 bg-white px-4 py-2 space-y-2">
            <AsyncEmployeeSelect
              branchId={activeBranch.id}
              value={servedByEmployeeId}
              onChange={setServedByEmployeeId}
              label="Served By"
              placeholder="Select employee (optional)..."
              openUpward
            />
            {servedByEmployeeId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commission for this sale</label>
                <div className="flex gap-2">
                  <div className="flex rounded-lg border border-gray-200 p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCommissionType('flat')}
                      className={`rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${commissionType === 'flat' ? 'bg-brand-teal text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {getCurrencySymbol(currency)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommissionType('percentage')}
                      className={`rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${commissionType === 'percentage' ? 'bg-brand-teal text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder={commissionType === 'percentage' ? 'e.g. 5' : '0.00'}
                    value={commissionAmount}
                    onChange={e => setCommissionAmount(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                  {commissionType === 'percentage' && commissionAmount && (
                    <span className="shrink-0 text-xs text-gray-500 whitespace-nowrap">
                      = {formatCurrency((parseFloat(commissionAmount) || 0) / 100 * total)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment buttons */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2.5">
        <div className="flex gap-1.5">
          <button
            onClick={() => { pos.setPaymentMethod('split'); setSplits({ cash: '', card: '' }); pos.cart.length > 0 && setPaymentOpen(true) }}
            disabled={pos.cart.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-[#1a3c40] bg-[#1a3c40] py-2.5 text-sm font-bold text-white hover:bg-[#15332e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <SplitSquareHorizontal className="h-4 w-4 shrink-0" /> Multiple Pay
          </button>
          <button
            onClick={processCashPayment}
            disabled={pos.cart.length === 0 || processing}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Banknote className="h-4 w-4 shrink-0" /> Cash
          </button>
          <button
            onClick={() => { if (pos.cart.length > 0 && !processing) setCreditOpen(true) }}
            disabled={pos.cart.length === 0 || processing}
            title="Sell on credit — customer or employee"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-purple-600 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CreditCard className="h-4 w-4 shrink-0" /> Credit
          </button>
          <button
            onClick={() => { pos.clearCart(); setServedByEmployeeId(''); setCommissionAmount(''); setCommissionType('flat') }}
            disabled={pos.cart.length === 0}
            className="flex items-center justify-center rounded-lg bg-red-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!pos.customer && pos.cart.length > 0 && (
          <p className="mt-1 text-center text-xs text-gray-400">Select a customer to enable Credit payment</p>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Credit (On-Account) Payment Modal */}
      <Modal open={creditOpen} onClose={() => { if (!processing) { setCreditOpen(false); setCreditIsEmployee(false); setCreditEmployeeId(''); setCreditEmployeeName(''); setCreditCustomerSearch(''); setCreditCustomerResults([]) } }} title="Credit Payment" size="sm">
        <div className="space-y-4">
          {/* Customer vs Employee toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            <button
              onClick={() => { setCreditIsEmployee(false); setCreditEmployeeId(''); setCreditEmployeeName('') }}
              className={`flex-1 py-2 transition-colors ${!creditIsEmployee ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Customer Credit
            </button>
            <button
              onClick={() => setCreditIsEmployee(true)}
              className={`flex-1 py-2 transition-colors ${creditIsEmployee ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Employee Purchase
            </button>
          </div>

          {/* Who is buying */}
          {creditIsEmployee ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Employee</label>
              <AsyncEmployeeSelect
                value={creditEmployeeId}
                onChange={id => setCreditEmployeeId(id)}
                onEmployeeChange={emp => setCreditEmployeeName(emp ? `${emp.first_name} ${emp.last_name ?? ''}`.trim() : '')}
                branchId={activeBranch?.id ?? ''}
                placeholder="Search employee…"
              />
            </div>
          ) : pos.customer ? (
            <div className="flex items-center justify-between rounded-lg bg-purple-50 px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-purple-900">{pos.customer.first_name} {pos.customer.last_name ?? ''}</p>
                <p className="mt-0.5 text-purple-700">Sale Total: <span className="font-bold">{formatCurrency(total)}</span></p>
              </div>
              <button onClick={() => { pos.setCustomer(null); setCreditCustomerSearch(''); setCreditCustomerResults([]) }}
                className="text-xs text-purple-400 hover:text-purple-700 underline">Change</button>
            </div>
          ) : (
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-gray-600">Customer</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customer by name…"
                  className="w-full rounded-lg border py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  value={creditCustomerSearch}
                  onChange={e => setCreditCustomerSearch(e.target.value)}
                  autoFocus
                />
                {creditCustomerSearching && (
                  <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
                )}
              </div>
              {creditCustomerResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                  {creditCustomerResults.map(c => (
                    <button key={c.id}
                      onClick={() => { pos.setCustomer(c); setCreditCustomerSearch(''); setCreditCustomerResults([]) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-purple-50">
                      <span className="font-medium">{c.first_name} {c.last_name ?? ''}</span>
                      {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Summary strip */}
          {creditIsEmployee && creditEmployeeId && (
            <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm">
              <p className="font-semibold text-indigo-900">{creditEmployeeName}</p>
              <p className="mt-0.5 text-indigo-700">Sale Total: <span className="font-bold">{formatCurrency(total)}</span></p>
            </div>
          )}

          {/* Deposit input */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Deposit paid now <span className="font-normal text-gray-400">(enter 0 for full credit)</span>
            </label>
            <input
              type="number" min={0} max={total} step={0.01}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0.00"
              value={creditDepositAmount}
              onChange={e => setCreditDepositAmount(e.target.value)}
            />
          </div>

          {parseFloat(creditDepositAmount) > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Deposit paid via</label>
              <div className="flex gap-2">
                {(['cash', 'card'] as const).map(m => (
                  <button key={m} onClick={() => setCreditDepositMethod(m)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${creditDepositMethod === m ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md bg-amber-50 px-4 py-2.5 text-sm">
            <span className="font-medium text-amber-800">{creditIsEmployee ? 'Employee' : 'Customer'} will owe</span>
            <span className="font-bold text-amber-700">{formatCurrency(Math.max(0, total - (parseFloat(creditDepositAmount) || 0)))}</span>
          </div>

          <p className="text-xs text-gray-400">
            {creditIsEmployee
              ? 'Amount tracked under employee profile and deductible from payroll.'
              : 'Payment can be recorded later from the Customer Credit page.'}
          </p>

          <div className="flex justify-end gap-3">
            <button onClick={() => { setCreditOpen(false); setCreditIsEmployee(false); setCreditEmployeeId(''); setCreditEmployeeName(''); setCreditCustomerSearch(''); setCreditCustomerResults([]) }} disabled={processing}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              Cancel
            </button>
            <button onClick={processCreditPayment} disabled={processing || (creditIsEmployee ? !creditEmployeeId : !pos.customer)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-40 ${creditIsEmployee ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
              <CreditCard className="h-4 w-4" />
              {processing ? 'Processing…' : 'Confirm Credit Sale'}
            </button>
          </div>
        </div>
      </Modal>

      {/* New Customer Modal */}
      <Modal open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} title="Create New Customer" size="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" required value={newCustomerForm.first_name} onChange={e => setNewCustomerForm(f => ({ ...f, first_name: e.target.value }))} />
            <Input label="Last Name" value={newCustomerForm.last_name} onChange={e => setNewCustomerForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <Input label="Mobile" type="tel" value={newCustomerForm.phone} onChange={e => setNewCustomerForm(f => ({ ...f, phone: e.target.value }))} />
          <Input label="Email Address" type="email" value={newCustomerForm.email} onChange={e => setNewCustomerForm(f => ({ ...f, email: e.target.value }))} />
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setNewCustomerOpen(false)}>Cancel</Button>
            <Button className="flex-1 bg-brand-teal hover:bg-brand-teal-dark" loading={newCustomerSaving} disabled={!newCustomerForm.first_name.trim()} onClick={saveNewCustomer}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Outstanding Balance */}
      <Modal open={outstandingOpen} onClose={() => setOutstandingOpen(false)} title="" size="sm">
        <div className="py-2">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-gray-500" />
              <button
                onClick={() => { setOutstandingOpen(false); router.push(`/invoices?customer_id=${pos.customer?.id}&status=unpaid`) }}
                className="font-semibold text-blue-600 underline"
              >
                Outstanding Balance
              </button>
              <ExternalLink className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <span className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-bold text-white">
              {formatCurrency(outstandingBalance)}
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Unsettled dues from previous transactions. Click &apos;Outstanding Balance&apos; to check due invoices.
          </p>
        </div>
      </Modal>

      {/* Split Payment Modal */}
      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          {success ? (
            <div className="rounded-2xl bg-white px-16 py-14 text-center shadow-2xl">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-9 w-9 text-green-600" />
              </div>
              <p className="text-xl font-bold text-green-700">Payment Successful!</p>
              <p className="mt-1 text-sm text-gray-500">Receipt has been processed.</p>
            </div>
          ) : (
            <div className="flex w-[600px] max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">Split Payment</h3>
                  <button onClick={() => setPaymentOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex flex-1 flex-col gap-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Split Amounts</p>
                  {(['cash', 'card'] as const).map(m => (
                    <div key={m} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-sm text-gray-600 capitalize font-medium">{m.charAt(0).toUpperCase() + m.slice(1)}</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={splits[m]} onChange={e => setSplits(s => ({ ...s, [m]: e.target.value }))}
                        className="h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                      />
                    </div>
                  ))}
                  <div className={`flex justify-between rounded-lg px-3 py-2 text-sm font-medium ${splitRemaining > 0.005 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    <span>Remaining</span><span>{formatCurrency(splitRemaining)}</span>
                  </div>
                </div>
              </div>
              <div className="flex w-64 shrink-0 flex-col border-l border-gray-100 p-5">
                <div className="flex-1 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-500"><span>Total Items</span><span>{pos.itemCount()}</span></div>
                  <div className="flex justify-between text-gray-500"><span>Sub Total</span><span>{formatCurrency(grossSubtotal)}</span></div>
                  {totalDiscount > 0 && (
                    <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(totalDiscount)}</span></div>
                  )}
                  <div className="flex justify-between text-gray-500"><span>Tax</span><span>{formatCurrency(taxAmt)}</span></div>
                  <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
                    <span>TOTAL</span><span>{formatCurrency(totalDue)}</span>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Button className="w-full bg-brand-teal hover:bg-brand-teal-dark" loading={processing} disabled={!splitValid} onClick={processPayment}>Confirm</Button>
                  <button
                    onClick={() => setSplits({ cash: '', card: totalDue.toFixed(2) })}
                    className="w-full rounded-lg border-2 border-brand-teal bg-brand-teal/10 py-2 text-sm font-semibold text-brand-teal hover:bg-brand-teal/20 transition-colors"
                  >
                    Full Payment
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cash Payment Success Overlay */}
      {success && !paymentOpen && !gcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-white px-16 py-14 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <p className="text-xl font-bold text-green-700">Payment Successful!</p>
            <p className="mt-1 text-sm text-gray-500">Receipt has been sent to print.</p>
          </div>
        </div>
      )}

      {/* Scanner Modal — triggered when barcode input is focused during HID scan */}
      <ScannerModal
        open={scannerOpen}
        onClose={() => { setScannerOpen(false); setScannerDefaultState('scanning'); setScannerDefaultBarcode(undefined); setScannerDefaultProduct(null) }}
        mode="pos"
        branchId={activeBranch?.id ?? null}
        defaultState={scannerDefaultState}
        defaultBarcode={scannerDefaultBarcode}
        defaultProduct={scannerDefaultProduct}
        onProductCreated={() => { queryClient.invalidateQueries({ queryKey: ['pos-products'] }) }}
        onAddToCart={(scanned: ScannedProduct) => {
          const product = scanned as unknown as ProductWithStock
          pos.addToCart(product as unknown as Product)
          toast.success(`${product.name} added to cart`)
          setScannerOpen(false)
        }}
      />

      {/* Gift Card Modal */}
      {gcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          {success ? (
            <div className="rounded-2xl bg-white px-16 py-14 text-center shadow-2xl">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-9 w-9 text-green-600" />
              </div>
              <p className="text-xl font-bold text-green-700">Payment Successful!</p>
              <p className="mt-1 text-sm text-gray-500">Receipt has been processed.</p>
            </div>
          ) : (
            <div className="w-[420px] rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-purple-600" />
                  <h3 className="font-bold text-gray-900">Gift Card Payment</h3>
                </div>
                <button onClick={() => { setGcModalOpen(false); pos.clearGiftCard() }} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-lg bg-gray-50 px-4 py-3 flex justify-between text-sm font-medium text-gray-700">
                  <span>Total Due</span>
                  <span className="font-bold text-gray-900">{formatCurrency(totalDue)}</span>
                </div>
                {!pos.giftCardId ? (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gift Card Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text" placeholder="Enter gift card code"
                        value={gcCode}
                        onChange={e => { setGcCode(e.target.value); setGcError('') }}
                        onKeyDown={e => e.key === 'Enter' && lookupGiftCard()}
                        className="h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm focus:border-purple-500 focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={lookupGiftCard}
                        disabled={!gcCode.trim() || gcLooking}
                        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
                      >
                        {gcLooking ? 'Checking…' : 'Apply'}
                      </button>
                    </div>
                    {gcError && <p className="text-xs text-red-600">{gcError}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Gift Card Applied</p>
                        <p className="text-lg font-bold text-purple-800">-{formatCurrency(pos.giftCardAmount)}</p>
                      </div>
                      <button onClick={() => { pos.clearGiftCard(); setGcCode(''); setGcError('') }} className="text-purple-400 hover:text-purple-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {totalDue - pos.giftCardAmount > 0.005 && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 flex justify-between text-sm">
                        <span className="text-amber-700 font-medium">Remaining to Pay</span>
                        <span className="font-bold text-amber-800">{formatCurrency(totalDue - pos.giftCardAmount)}</span>
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={async () => { await processPayment(); setGcModalOpen(false) }}
                  disabled={!pos.giftCardId || processing}
                  className="w-full rounded-lg bg-purple-600 py-3 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? 'Processing…' : 'Confirm Gift Card Payment'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
