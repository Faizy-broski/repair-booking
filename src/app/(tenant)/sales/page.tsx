'use client'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, X, Download, Printer, Loader2, Trash2, RotateCcw, RefreshCw, Pencil, MoreVertical, Package, DollarSign, ArrowLeftRight, Search, Plus, Minus, ChevronRight, ChevronLeft } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { usePinPrompt } from '@/components/ui/pin-prompt'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'

// ── Types ────────────────────────────────────────────────────────────────────

interface SaleRow {
  id: string
  branch_id?: string
  customer_id: string | null
  cashier_id: string | null
  subtotal?: number
  discount?: number
  tax?: number
  total: number
  payment_method: string
  payment_status: string
  payment_splits?: { method: string; amount: number }[] | null
  is_refund: boolean
  is_exchange: boolean
  refund_reason: string | null
  original_sale_id?: string | null
  exchange_original_id: string | null
  notes: string | null
  created_at: string
  customers?: { first_name: string; last_name: string | null } | null
  profiles?: { full_name: string | null } | null
  // Ledger-only fields (present on rows from /api/pos/sales/ledger)
  record_type?: 'sale' | 'refund' | 'exchange' | 'cash_in' | 'cash_out'
  reference?: string
  purpose?: 'plain' | 'expense' | 'buyback' | null
  product_name?: string | null
}

interface ExchangeNewItem {
  product_id: string | null
  variant_id: string | null
  name: string
  quantity: number
  unit_price: number
  total: number
  is_service: boolean
}

interface SaleItem {
  id: string
  name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
  product_id: string | null
  variant_id: string | null
}

interface SaleDetail extends SaleRow {
  sale_items: SaleItem[]
  refund_records?: { id: string; is_refund: boolean; total: number; sale_items: { name: string; quantity: number }[] }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', gift_card: 'Gift Card', split: 'Split', voucher: 'Voucher',
  on_account: 'On Account', ebay: 'eBay', deliveroo: 'Deliveroo', website: 'Website',
}
const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  refunded: 'bg-red-100 text-red-800',
  partial: 'bg-orange-100 text-orange-700',
  on_account: 'bg-purple-100 text-purple-700',
  exchange: 'bg-indigo-100 text-indigo-700',
  exchange_return: 'bg-orange-100 text-orange-700',
  cash_in: 'bg-teal-100 text-teal-800',
  cash_out: 'bg-rose-100 text-rose-700',
}

function getRowBadge(row: SaleRow): { label: string; cls: string } {
  if (row.record_type === 'cash_in') return { label: 'Cash In', cls: STATUS_COLORS.cash_in }
  if (row.record_type === 'cash_out') return { label: 'Cash Out', cls: STATUS_COLORS.cash_out }
  if (row.is_exchange) return { label: 'Exchange', cls: STATUS_COLORS.exchange }
  if (row.is_refund && row.refund_reason === 'Product exchange') return { label: 'Exchange Return', cls: STATUS_COLORS.exchange_return }
  const label = getStatusLabel(row.payment_status, row.payment_method)
  return { label, cls: STATUS_COLORS[row.payment_status] ?? 'bg-gray-100 text-gray-800' }
}
const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid', refunded: 'Refunded', partial: 'Partial Refund', on_account: 'On Account',
}

function getStatusLabel(status: string, paymentMethod?: string) {
  if (status === 'partial' && paymentMethod === 'on_account') return 'Credit (Partial)'
  return STATUS_LABELS[status] ?? status
}

function customerName(c: SaleRow['customers']) {
  if (!c) return '—'
  return `${c.first_name} ${c.last_name ?? ''}`.trim()
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { activeBranch, profile, verticalTemplateSlug } = useAuthStore()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Read-only detail for cash in/out rows (data already in the ledger row — no extra fetch)
  const [cashDetailRow, setCashDetailRow] = useState<SaleRow | null>(null)

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Refund
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundQtys, setRefundQtys] = useState<Record<string, number>>({})
  const [refundReason, setRefundReason] = useState('')
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<'cash' | 'card' | 'store_credit'>('cash')
  const [refundMode, setRefundMode] = useState<'items' | 'amount'>('items')
  const [refundItemAmounts, setRefundItemAmounts] = useState<Record<string, number>>({})

  // Exchange
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [exchangeStep, setExchangeStep] = useState<1 | 2 | 3>(1)
  const [exchangeReturnQtys, setExchangeReturnQtys] = useState<Record<string, number>>({})
  const [exchangeNewItems, setExchangeNewItems] = useState<ExchangeNewItem[]>([])
  const [exchangeProductSearch, setExchangeProductSearch] = useState('')
  const [exchangeProductResults, setExchangeProductResults] = useState<any[]>([])
  const [exchangeSearching, setExchangeSearching] = useState(false)
  const [exchangePayMethod, setExchangePayMethod] = useState<'cash' | 'card' | 'on_account'>('cash')
  const [exchangeRefundMethod, setExchangeRefundMethod] = useState<'cash' | 'card' | 'store_credit'>('cash')
  const [exchangeDepositAmount, setExchangeDepositAmount] = useState('')
  const [exchangeDepositMethod, setExchangeDepositMethod] = useState<'cash' | 'card'>('cash')
  const [exchangeVariantNames, setExchangeVariantNames] = useState<Record<string, string>>({})
  const [exchangeVariantFor, setExchangeVariantFor] = useState<any | null>(null)
  const [exchangeVariants, setExchangeVariants] = useState<any[]>([])
  const [exchangeVariantsLoading, setExchangeVariantsLoading] = useState(false)
  const [pendingExchange, setPendingExchange] = useState(false)

  // Edit sale
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<{
    customer_id: string | null
    payment_method: string
    payment_status: string
    notes: string
    discount: number
    tax: number
    items: Array<{ id: string; name: string; quantity: number; unit_price: number; discount: number; total: number; product_id: string | null }>
  } | null>(null)

  // Download states
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadingDetail, setDownloadingDetail] = useState(false)

  // When Edit is clicked from the table row, fetch the detail first, then open edit modal
  const [pendingEdit, setPendingEdit] = useState(false)
  // Same pattern for Refund — detail must load before openRefund() is called
  const [pendingRefund, setPendingRefund] = useState(false)

  // Customer picker inside the Edit modal
  const [editCustomerSearch, setEditCustomerSearch] = useState('')
  const [editCustomerResults, setEditCustomerResults] = useState<{ id: string; first_name: string; last_name: string | null; phone: string | null }[]>([])
  const [editCustomerSearching, setEditCustomerSearching] = useState(false)
  const [editDropdownOpen, setEditDropdownOpen] = useState(false)
  const [editRecentCustomers, setEditRecentCustomers] = useState<{ id: string; first_name: string; last_name: string | null; phone: string | null }[]>([])
  const [editSelectedCustomerName, setEditSelectedCustomerName] = useState<string | null>(null)
  const customerInputRef = useRef<HTMLInputElement>(null)

  const canDelete = ['business_owner', 'branch_manager', 'super_admin'].includes(profile?.role ?? '')
  const isRetailTemplate = verticalTemplateSlug === 'retail-store'
  const { requestPin: requestDeletePin, PinModal: DeletePinModal } = usePinPrompt({
    verifyUrl: '/api/settings/business/verify-delete-pin',
  })
  const [deletePinRequired, setDeletePinRequired] = useState(false)

  useEffect(() => {
    if (!isRetailTemplate) return
    fetch('/api/settings/business')
      .then(r => r.json())
      .then(j => setDeletePinRequired(!!j.data?.has_delete_pin))
      .catch(() => {})
  }, [isRetailTemplate])

  async function handleDeleteSale(saleId: string) {
    if (isRetailTemplate && deletePinRequired) {
      const ok = await requestDeletePin('Enter the delete protection PIN to continue')
      if (!ok) return
    }
    setDeleteConfirmId(saleId)
  }

  // ── Fetch selected sale detail (must be declared before mutations that reference it) ──
  const { data: detail = null, isLoading: detailLoading } = useQuery<SaleDetail | null>({
    queryKey: ['sale-detail', detailId],
    queryFn: async () => {
      if (!detailId) return null
      const res = await fetch(`/api/pos/sales/${detailId}`)
      if (!res.ok) return null
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!detailId && (detailOpen || pendingEdit || pendingRefund || pendingExchange)
  })

  const deleteMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const res = await fetch(`/api/pos/sales/${saleId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete sale')
    },
    onSuccess: () => {
      toast.success('Sale deleted and inventory restored')
      setDeleteConfirmId(null)
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      // Restore variant stock visibility: invalidate product/inventory caches
      // so the product form re-fetches updated inventory after stock is restored.
      queryClient.invalidateQueries({ queryKey: ['inv-product-variants'] })
      queryClient.invalidateQueries({ queryKey: ['inv-product'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const deleteCashMovementMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pos/cash-movements/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete cash movement')
    },
    onSuccess: () => {
      toast.success('Cash movement deleted')
      setDeleteConfirmId(null)
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
    },
    onError: (err: Error) => { toast.error(err.message) },
  })

  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!detail) return
      let items: { product_id: string | null; variant_id: string | null; name: string; quantity: number; unit_price: number; total: number; is_service: boolean }[]
      let subtotal: number

      if (refundMode === 'items') {
        items = (detail.sale_items ?? [])
          .filter(i => (refundQtys[i.id] ?? 0) > 0)
          .map(i => {
            const effectiveUnitPrice = Number(i.total) / i.quantity
            return {
              product_id: i.product_id,
              variant_id: i.variant_id,
              name: i.name,
              quantity: refundQtys[i.id],
              unit_price: effectiveUnitPrice,
              total: effectiveUnitPrice * refundQtys[i.id],
              is_service: false,
            }
          })
        if (!items.length) throw new Error('Select at least one item to refund')
        subtotal = items.reduce((s, i) => s + i.total, 0)
      } else {
        const amountTotal = Object.values(refundItemAmounts).reduce((s, v) => s + (v || 0), 0)
        if (amountTotal <= 0) throw new Error('Enter a refund amount greater than zero')
        // Build one line per item that has a non-zero amount (no inventory restock)
        items = Object.entries(refundItemAmounts)
          .filter(([, amt]) => amt > 0)
          .map(([itemId, amt]) => {
            const saleItem = (detail.sale_items ?? []).find(i => i.id === itemId)
            return {
              product_id: saleItem?.product_id ?? null,
              variant_id: saleItem?.variant_id ?? null,
              name: saleItem ? `${saleItem.name} (amount refund)` : 'Amount Refund',
              quantity: 1,
              unit_price: amt,
              total: amt,
              is_service: true,
            }
          })
        subtotal = amountTotal
      }

      const res = await fetch('/api/pos/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_sale_id: detail.id,
          branch_id: detail.branch_id,
          cashier_id: profile?.id,
          customer_id: detail.customer_id ?? null,
          subtotal,
          tax: 0,
          total: subtotal,
          payment_method: refundPaymentMethod,
          refund_reason: refundReason || null,
          items,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to process refund')
    },
    onSuccess: () => {
      toast.success('Refund processed successfully')
      setRefundOpen(false)
      setRefundQtys({})
      setRefundReason('')
      setRefundPaymentMethod('cash')
      setRefundMode('items')
      setRefundItemAmounts({})
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      queryClient.invalidateQueries({ queryKey: ['sale-detail', detail?.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      // Keep product variant stock in sync after items are restocked via refund
      queryClient.invalidateQueries({ queryKey: ['inv-product-variants'] })
      queryClient.invalidateQueries({ queryKey: ['inv-product'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (err: Error) => { toast.error(err.message) },
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!detail || !editForm) return
      const res = await fetch(`/api/pos/sales/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: editForm.customer_id || null,
          payment_method: editForm.payment_method,
          payment_status: editForm.payment_status,
          notes: editForm.notes || null,
          discount: editForm.discount,
          tax: editForm.tax,
          items: editForm.items.map(i => ({
            id: i.id,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            total: i.total,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update sale')
    },
    onSuccess: () => {
      toast.success('Sale updated successfully')
      setEditOpen(false)
      setEditForm(null)
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      queryClient.invalidateQueries({ queryKey: ['sale-detail', detail?.id] })
    },
    onError: (err: Error) => { toast.error(err.message) },
  })

  async function openEdit() {
    if (!detail) return
    setEditForm({
      customer_id: detail.customer_id ?? null,
      payment_method: detail.payment_method,
      payment_status: detail.payment_status,
      notes: detail.notes ?? '',
      discount: Number(detail.discount ?? 0),
      tax: Number(detail.tax ?? 0),
      items: (detail.sale_items ?? []).map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        discount: Number(i.discount ?? 0),
        total: Number(i.total),
        product_id: (i as any).product_id ?? null,
      })),
    })
    // Pre-load recent customers so they show instantly on focus
    setEditCustomerSearch('')
    setEditCustomerResults([])
    setEditDropdownOpen(false)
    setEditSelectedCustomerName(null)
    try {
      const res = await fetch('/api/customers?limit=8&sort=created_at')
      const json = await res.json()
      setEditRecentCustomers(json.data ?? [])
    } catch { /* ignore */ }
    setEditOpen(true)
  }

  // When coming via the table Edit button (pendingEdit=true), open edit modal once data arrives
  useEffect(() => {
    if (pendingEdit && detail) {
      setPendingEdit(false)
      openEdit()
    }
  }, [pendingEdit, detail]) // eslint-disable-line react-hooks/exhaustive-deps

  // When coming via the table Refund button (pendingRefund=true), open refund modal once data arrives
  useEffect(() => {
    if (pendingRefund && detail) {
      setPendingRefund(false)
      openRefund()
    }
  }, [pendingRefund, detail]) // eslint-disable-line react-hooks/exhaustive-deps

  function editItemField(id: string, field: 'quantity' | 'unit_price' | 'discount', value: number) {
    setEditForm(prev => {
      if (!prev) return prev
      const items = prev.items.map(i => {
        if (i.id !== id) return i
        const updated = { ...i, [field]: value }
        updated.total = Math.max(0, updated.unit_price * updated.quantity - updated.discount)
        return updated
      })
      const subtotal = items.reduce((s, i) => s + i.total, 0)
      return { ...prev, items, discount: prev.discount, tax: prev.tax }
    })
  }

  function editSubtotal() {
    if (!editForm) return 0
    return editForm.items.reduce((s, i) => s + i.total, 0)
  }

  function editTotal() {
    if (!editForm) return 0
    return Math.max(0, editSubtotal() - editForm.discount + editForm.tax)
  }

  function getAlreadyRefunded(item: SaleItem): number {
    if (!detail?.refund_records) return 0
    return detail.refund_records
      .filter(r => r.is_refund)
      .flatMap(r => r.sale_items)
      .filter(s => s.name === item.name)
      .reduce((sum, s) => sum + s.quantity, 0)
  }

  function getAlreadyRefundedTotal(): number {
    return (detail?.refund_records ?? []).reduce((s, r) => s + Number(r.total), 0)
  }

  function openRefund() {
    if (!detail) return
    const initial: Record<string, number> = {}
    detail.sale_items?.forEach(i => {
      const remaining = i.quantity - getAlreadyRefunded(i)
      initial[i.id] = remaining
    })
    setRefundQtys(initial)
    setRefundReason('')
    setRefundPaymentMethod('cash')
    setRefundMode('items')
    setRefundItemAmounts({})
    setRefundOpen(true)
  }

  function openExchange() {
    if (!detail) return
    const initial: Record<string, number> = {}
    detail.sale_items?.forEach(i => {
      const remaining = i.quantity - getAlreadyRefunded(i)
      if (remaining > 0) initial[i.id] = 0
    })
    setExchangeReturnQtys(initial)
    setExchangeNewItems([])
    setExchangeProductSearch('')
    setExchangeProductResults([])
    setExchangeStep(1)
    setExchangePayMethod('cash')
    setExchangeRefundMethod('cash')
    setExchangeDepositAmount('')
    setExchangeDepositMethod('cash')
    setExchangeVariantFor(null)
    setExchangeVariants([])
    setExchangeOpen(true)
  }

  useEffect(() => {
    if (pendingExchange && detail) {
      setPendingExchange(false)
      openExchange()
    }
  }, [pendingExchange, detail]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!exchangeProductSearch.trim()) { setExchangeProductResults([]); return }
    const t = setTimeout(async () => {
      setExchangeSearching(true)
      try {
        const params = new URLSearchParams({ search: exchangeProductSearch.trim(), limit: '12', show_on_pos: 'true' })
        if (activeBranch?.id) params.set('branch_id', activeBranch.id)
        const res = await fetch(`/api/products?${params}`)
        const json = await res.json()
        setExchangeProductResults(json.data ?? [])
      } finally { setExchangeSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [exchangeProductSearch, activeBranch?.id])

  async function loadVariants(product: any) {
    setExchangeVariantFor(product)
    setExchangeVariants([])
    setExchangeVariantsLoading(true)
    try {
      const res = await fetch(`/api/products/${product.id}/variants?branch_id=${activeBranch?.id ?? ''}`)
      const json = await res.json()
      setExchangeVariants(json.data ?? [])
    } finally { setExchangeVariantsLoading(false) }
  }

  function addExchangeNewItem(product: any, variant?: any) {
    const unitPrice = variant?.selling_price ?? product.selling_price ?? 0
    const name = variant ? `${product.name} – ${variant.name}` : product.name
    const key = `${product.id}__${variant?.id ?? 'null'}`
    setExchangeNewItems(prev => {
      const existing = prev.find(i => i.product_id === product.id && i.variant_id === (variant?.id ?? null))
      if (existing) {
        return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1, total: unitPrice * (i.quantity + 1) } : i)
      }
      return [...prev, { product_id: product.id, variant_id: variant?.id ?? null, name, quantity: 1, unit_price: unitPrice, total: unitPrice, is_service: product.is_service ?? false }]
    })
    setExchangeVariantFor(null)
  }

  const exchangeMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error('No sale selected')
      const returnedItems = (detail.sale_items ?? [])
        .filter(i => (exchangeReturnQtys[i.id] ?? 0) > 0)
        .map(i => {
          const qty = exchangeReturnQtys[i.id]
          const unitPrice = Number(i.total) / i.quantity
          return { product_id: i.product_id, variant_id: i.variant_id, name: i.name, quantity: qty, unit_price: unitPrice, total: unitPrice * qty, is_service: false }
        })
      if (!returnedItems.length) throw new Error('Select at least one item to return')
      if (!exchangeNewItems.length) throw new Error('Select at least one replacement item')

      const returnedTotal = returnedItems.reduce((s, i) => s + i.total, 0)
      const newTotal = exchangeNewItems.reduce((s, i) => s + i.total, 0)
      const net = newTotal - returnedTotal

      const res = await fetch('/api/pos/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_sale_id: detail.id,
          branch_id: detail.branch_id,
          cashier_id: profile?.id,
          customer_id: detail.customer_id ?? null,
          returned_items: returnedItems,
          new_items: exchangeNewItems,
          payment_method: net > 0 ? exchangePayMethod : 'cash',
          amount_paid: exchangePayMethod === 'on_account' ? (parseFloat(exchangeDepositAmount) || 0) : 0,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Exchange failed')
      return json.data as { exchange_sale_id: string; net_difference: number }
    },
    onSuccess: (result) => {
      toast.success('Exchange processed successfully')
      setExchangeOpen(false)
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      queryClient.invalidateQueries({ queryKey: ['sale-detail', detail?.id] })
      queryClient.invalidateQueries({ queryKey: ['credits'] })
      if (result?.exchange_sale_id) {
        setTimeout(() => triggerReceiptDownload(result.exchange_sale_id, () => {}), 500)
      }
    },
    onError: (err: Error) => { toast.error(err.message) },
  })

  const { data: salesData, isLoading: loading, isFetching } = useQuery({
    queryKey: ['sales', activeBranch?.id, page, pageSize, dateFrom, dateTo, statusFilter, typeFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        branch_id: activeBranch!.id,
        page: String(page + 1),
        limit: String(pageSize),
      })
      if (dateFrom) params.set('from', `${dateFrom}T00:00:00`)
      if (dateTo) params.set('to', `${dateTo}T23:59:59`)
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/pos/sales/ledger?${params}`)
      const json = await res.json()
      return { rows: (json.data ?? []) as SaleRow[], total: json.meta?.total ?? 0 }
    },
    enabled: !!activeBranch,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  const { data: statsData } = useQuery({
    queryKey: ['sales-stats', activeBranch?.id, dateFrom, dateTo, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id })
      if (dateFrom) params.set('from', `${dateFrom}T00:00:00`)
      if (dateTo) params.set('to', `${dateTo}T23:59:59`)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/pos/sales/stats?${params}`)
      const json = await res.json()
      return json.data as { sales_count: number; revenue: number; refund_count: number; refund_amount: number; cash_total: number; card_total: number; cash_in_total: number; cash_out_total: number }
    },
    enabled: !!activeBranch,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  function refreshSales() {
    queryClient.invalidateQueries({ queryKey: ['sales'] })
    queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
  }

  // (detail query moved above mutations — see declaration near line 120)

  const sales = salesData?.rows ?? []
  const total = salesData?.total ?? 0
  const summary = {
    totalSales: statsData?.sales_count ?? 0,
    totalRevenue: statsData?.revenue ?? 0,
    totalRefunds: statsData?.refund_amount ?? 0,
    refundCount: statsData?.refund_count ?? 0,
    cashTotal: statsData?.cash_total ?? 0,
    cardTotal: statsData?.card_total ?? 0,
    cashInTotal: statsData?.cash_in_total ?? 0,
    cashOutTotal: statsData?.cash_out_total ?? 0,
  }

  function viewDetail(row: SaleRow) {
    if (row.record_type === 'cash_in' || row.record_type === 'cash_out') {
      setCashDetailRow(row)
      return
    }
    setDetailId(row.id)
    setDetailOpen(true)
  }

  // Hover over the download button starts server-side PDF generation in the background.
  // Uses redirect:'manual' so only the 302 response is received — the PDF body is NOT
  // downloaded, which means no wasted bandwidth. By click time the cache is usually warm.
  function prefetchPdf(url: string) {
    fetch(url, { redirect: 'manual' } as RequestInit).catch(() => {})
  }

  async function triggerReceiptDownload(saleId: string, setLoading: (v: boolean) => void) {
    setLoading(true)
    const slowTimer = setTimeout(() => toast.info('Generating receipt, please wait…'), 400)
    try {
      const res = await fetch(`/api/pos/sales/${saleId}/pdf`)
      if (!res.ok) { toast.error('Failed to generate receipt'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipt-${saleId.slice(-8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download receipt')
    } finally {
      clearTimeout(slowTimer)
      setLoading(false)
    }
  }

  function downloadReceipt(sale: SaleDetail, fromDetail = false) {
    triggerReceiptDownload(sale.id, fromDetail ? setDownloadingDetail : () => {})
  }

  function fetchAndDownloadReceipt(id: string) {
    triggerReceiptDownload(id, (v) => { if (!v) setDownloadingId(null); else setDownloadingId(id) })
  }

  // ── Columns ──────────────────────────────────────────────────────────────

  const columns: ColumnDef<SaleRow>[] = [
    {
      accessorKey: 'id',
      header: 'Sale #',
      cell: ({ row }) => {
        const sale = row.original
        const label = sale.reference ?? sale.id.slice(-8).toUpperCase()
        return (
          <button
            onClick={() => viewDetail(sale)}
            className="cursor-pointer font-mono text-xs text-teal-700 underline-offset-2 hover:underline"
          >
            {label}
          </button>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ getValue }) => formatDateTime(getValue() as string),
    },
    {
      accessorKey: 'customers',
      header: 'Customer',
      cell: ({ getValue }) => customerName(getValue() as SaleRow['customers']),
    },
    {
      accessorKey: 'profiles',
      header: 'Cashier',
      cell: ({ getValue }) => (getValue() as SaleRow['profiles'])?.full_name ?? '—',
    },
    {
      accessorKey: 'payment_method',
      header: 'Payment',
      cell: ({ row }) => {
        const method = row.original.payment_method
        if (method === 'split' && row.original.payment_splits?.length) {
          return row.original.payment_splits.map(s => PAYMENT_LABELS[s.method] ?? s.method).join(' + ')
        }
        return PAYMENT_LABELS[method] ?? method
      },
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const rt = row.original.record_type
        const isNegative = row.original.is_refund || rt === 'cash_out'
        const colorCls = rt === 'cash_in' ? 'text-teal-700' : isNegative ? 'text-red-600' : ''
        return (
          <span className={colorCls}>
            {isNegative ? '-' : ''}{formatCurrency(Math.abs(Number(row.original.total)))}
          </span>
        )
      },
    },
    {
      accessorKey: 'payment_status',
      header: 'Status',
      cell: ({ row }) => {
        const badge = getRowBadge(row.original)
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
            {badge.label}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const sale = row.original
        const isDownloading = downloadingId === sale.id
        const isCash = sale.record_type === 'cash_in' || sale.record_type === 'cash_out'
        return (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-200">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-[188px] overflow-hidden rounded-xl border border-gray-100 bg-white p-1 shadow-xl shadow-black/10 ring-1 ring-black/5"
              >
                {/* View Details */}
                <DropdownMenu.Item
                  onSelect={() => viewDetail(sale)}
                  className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 outline-none transition-colors hover:bg-gray-50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 transition-colors group-hover:bg-gray-200">
                    <Eye className="h-3.5 w-3.5 text-gray-500" />
                  </span>
                  <span className="font-medium">View Details</span>
                </DropdownMenu.Item>

                {/* Delete Cash Movement — only "plain" movements; expense/buyback stay tied to their linked record */}
                {isCash && canDelete && (sale.purpose === 'plain' || !sale.purpose) && (
                  <>
                    <DropdownMenu.Separator className="my-1 -mx-1 border-t border-gray-100" />
                    <DropdownMenu.Item
                      onSelect={() => handleDeleteSale(sale.id)}
                      className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-red-50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-100 transition-colors group-hover:bg-red-200">
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </span>
                      <span className="font-medium text-red-600">Delete</span>
                    </DropdownMenu.Item>
                  </>
                )}

                {!isCash && <DropdownMenu.Separator className="my-1 -mx-1 border-t border-gray-100" />}

                {/* Edit Sale */}
                {!isCash && canDelete && !sale.is_refund && (
                  <DropdownMenu.Item
                    onSelect={() => { setDetailId(sale.id); setPendingEdit(true) }}
                    className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-blue-50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-100 transition-colors group-hover:bg-blue-200">
                      <Pencil className="h-3.5 w-3.5 text-blue-600" />
                    </span>
                    <span className="font-medium text-blue-700">Edit Sale</span>
                  </DropdownMenu.Item>
                )}

                {/* Process Refund */}
                {!isCash && canDelete && !sale.is_refund && !sale.is_exchange && sale.payment_status !== 'refunded' && (
                  <DropdownMenu.Item
                    onSelect={() => { setDetailId(sale.id); setPendingRefund(true) }}
                    className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-amber-50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-100 transition-colors group-hover:bg-amber-200">
                      <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                    </span>
                    <span className="font-medium text-amber-700">Process Refund</span>
                  </DropdownMenu.Item>
                )}

                {/* Exchange */}
                {!isCash && canDelete && !sale.is_refund && !sale.is_exchange && sale.payment_status !== 'refunded' && (
                  <DropdownMenu.Item
                    onSelect={() => { setDetailId(sale.id); setPendingExchange(true) }}
                    className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-indigo-50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 transition-colors group-hover:bg-indigo-200">
                      <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600" />
                    </span>
                    <span className="font-medium text-indigo-700">Exchange Items</span>
                  </DropdownMenu.Item>
                )}
                {/* Exchange sale row — shortcut back to original sale */}
                {!isCash && canDelete && sale.is_exchange && sale.exchange_original_id && (
                  <DropdownMenu.Item
                    onSelect={() => { setDetailId(sale.exchange_original_id!); setPendingExchange(true) }}
                    className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-indigo-50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 transition-colors group-hover:bg-indigo-200">
                      <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600" />
                    </span>
                    <span className="font-medium text-indigo-700">Exchange More Items</span>
                  </DropdownMenu.Item>
                )}

                {!isCash && <DropdownMenu.Separator className="my-1 -mx-1 border-t border-gray-100" />}

                {/* Download Receipt */}
                {!isCash && (
                  <DropdownMenu.Item
                    onSelect={() => fetchAndDownloadReceipt(sale.id)}
                    onMouseEnter={() => prefetchPdf(`/api/pos/sales/${sale.id}/pdf`)}
                    disabled={isDownloading}
                    className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 outline-none transition-colors hover:bg-gray-50 disabled:opacity-40"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 transition-colors group-hover:bg-gray-200">
                      {isDownloading
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
                        : <Download className="h-3.5 w-3.5 text-gray-500" />}
                    </span>
                    <span className="font-medium">{isDownloading ? 'Generating…' : 'Download Receipt'}</span>
                  </DropdownMenu.Item>
                )}

                {/* Delete Sale */}
                {!isCash && canDelete && !sale.is_refund && (
                  <>
                    <DropdownMenu.Separator className="my-1 -mx-1 border-t border-gray-100" />
                    <DropdownMenu.Item
                      onSelect={() => handleDeleteSale(sale.id)}
                      className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-red-50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-100 transition-colors group-hover:bg-red-200">
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </span>
                      <span className="font-medium text-red-600">Delete Sale</span>
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )
      },
    },
  ]

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-sm text-gray-500">View all POS transactions</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshSales} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className={`grid grid-cols-2 gap-4 ${isRetailTemplate ? 'sm:grid-cols-4 lg:grid-cols-8' : 'sm:grid-cols-3 lg:grid-cols-6'}`}>
        <SummaryCard label="Total Sales" value={String(summary.totalSales)} />
        <SummaryCard label="Revenue" value={formatCurrency(summary.totalRevenue)} className="text-green-600" />
        <SummaryCard label="Refunds" value={String(summary.refundCount)} />
        <SummaryCard label="Refund Amount" value={formatCurrency(summary.totalRefunds)} className="text-red-600" />
        <SummaryCard label="Cash In" value={formatCurrency(summary.cashInTotal)} className="text-teal-700" />
        <SummaryCard label="Cash Out" value={formatCurrency(summary.cashOutTotal)} className="text-rose-600" />
        {isRetailTemplate && (
          <>
            <SummaryCard label="Cash Sales" value={formatCurrency(summary.cashTotal)} />
            <SummaryCard label="Card Sales" value={formatCurrency(summary.cardTotal)} />
          </>
        )}
      </div>

      {/* Quick date range */}
      <div className="flex gap-1 rounded-full border p-1 w-fit">
        {([
          { label: 'Today',      days: -2 },
          { label: 'This Month', days: 0 },
          { label: '3 Months',   days: 90 },
          { label: '6 Months',   days: 180 },
          { label: 'This Year',  days: -1 },
        ] as const).map(({ label, days }) => {
          const getRange = () => {
            const now = new Date()
            const today = now.toISOString().slice(0, 10)
            if (days === -2) return { from: today, to: today }
            if (days === -1) return { from: `${now.getFullYear()}-01-01`, to: '' }
            if (days === 0) return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: '' }
            const from = new Date(now); from.setDate(from.getDate() - days)
            return { from: from.toISOString().slice(0, 10), to: '' }
          }
          const range = getRange()
          const active = dateFrom === range.from && dateTo === range.to
          return (
            <button
              key={label}
              onClick={() => { setDateFrom(range.from); setDateTo(range.to); setPage(0) }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-teal-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Invoice # or customer name…"
              className="w-full rounded-md border px-3 py-1.5 text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => { setSearchInput(''); setSearch('') }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input type="date" className="rounded-md border px-3 py-1.5 text-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input type="date" className="rounded-md border px-3 py-1.5 text-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select className="rounded-md border px-3 py-1.5 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial Refund</option>
            <option value="on_account">On Account (Credit)</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
          <select className="rounded-md border px-3 py-1.5 text-sm" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0) }}>
            <option value="">All</option>
            <option value="sale">Sale</option>
            <option value="refund">Refund</option>
            <option value="exchange">Exchange</option>
            <option value="cash_in">Cash In</option>
            <option value="cash_out">Cash Out</option>
          </select>
        </div>
        {(dateFrom || dateTo || statusFilter || typeFilter || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter(''); setTypeFilter(''); setSearchInput(''); setSearch(''); setPage(0) }}>
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sales}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No sales found"
      />

      {/* Detail Modal */}
      <Modal open={detailOpen} onClose={() => { setDetailOpen(false) }} title="Sale Details" size="lg">
        {detailLoading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
        ) : detail ? (
          <div className="space-y-4">
            {/* Sale info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Sale #</span><br /><span className="font-mono">{detail.id.slice(-8).toUpperCase()}</span></div>
              <div><span className="text-gray-500">Date</span><br />{formatDateTime(detail.created_at)}</div>
              <div><span className="text-gray-500">Customer</span><br />{customerName(detail.customers)}</div>
              <div><span className="text-gray-500">Cashier</span><br />{detail.profiles?.full_name ?? '—'}</div>
              <div><span className="text-gray-500">Payment</span><br />{PAYMENT_LABELS[detail.payment_method] ?? detail.payment_method}</div>
              <div>
                <span className="text-gray-500">Status</span><br />
                {(() => { const b = getRowBadge(detail as unknown as SaleRow); return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span> })()}
              </div>
            </div>

            {/* Partial refund notice */}
            {!detail.is_refund && detail.payment_status === 'partial' && (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
                Some items have been refunded. Remaining items can still be refunded below.
              </div>
            )}

            {/* Split payment details */}
            {detail.payment_method === 'split' && detail.payment_splits?.length ? (
              <div className="rounded-md bg-gray-50 p-3">
                <p className="mb-1 text-xs font-medium text-gray-500">Payment Split</p>
                {detail.payment_splits.map((s, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{PAYMENT_LABELS[s.method] ?? s.method}</span>
                    <span>{formatCurrency(s.amount)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Exchange info */}
            {detail.is_exchange && (
              <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm space-y-1">
                <p className="font-medium text-indigo-700">Exchange Transaction</p>
                {detail.exchange_original_id && (
                  <button
                    className="flex items-center gap-1 text-xs font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                    onClick={() => { setDetailId(detail.exchange_original_id!) }}
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                    View original sale →
                  </button>
                )}
              </div>
            )}

            {/* Refund info + navigate to original sale */}
            {detail.is_refund && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm space-y-2">
                <p className="font-medium text-red-700">Refund Record</p>
                {detail.refund_reason && <p className="text-red-600">{detail.refund_reason}</p>}
                {detail.original_sale_id && (
                  <button
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
                    onClick={() => {
                      setDetailId(detail.original_sale_id!)
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    View original sale to process more refunds →
                  </button>
                )}
              </div>
            )}

            {/* Items table */}
            <div>
              <p className="mb-2 text-sm font-medium">Items</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-1">Item</th>
                    <th className="pb-1 text-center">Qty</th>
                    <th className="pb-1 text-right">Price</th>
                    <th className="pb-1 text-right">Discount</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.sale_items ?? []).map(item => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-1.5">{item.name}</td>
                      <td className="py-1.5 text-center">{item.quantity}</td>
                      <td className="py-1.5 text-right">{formatCurrency(Number(item.unit_price))}</td>
                      <td className="py-1.5 text-right">{Number(item.discount) > 0 ? `-${formatCurrency(Number(item.discount))}` : '—'}</td>
                      <td className="py-1.5 text-right">{formatCurrency(Number(item.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="rounded-md bg-gray-50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{detail.is_refund ? '-' : ''}{formatCurrency(Math.abs(Number(detail.subtotal)))}</span></div>
              {Number(detail.discount) > 0 && (
                <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(Math.abs(Number(detail.discount)))}</span></div>
              )}
              {Number(detail.tax) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{formatCurrency(Math.abs(Number(detail.tax)))}</span></div>
              )}
              <div className="mt-1 flex justify-between border-t pt-1 font-bold">
                <span>Total</span>
                <span className={detail.is_refund ? 'text-red-600' : ''}>{detail.is_refund ? '-' : ''}{formatCurrency(Math.abs(Number(detail.total)))}</span>
              </div>
            </div>

            {detail.notes && (
              <div className="text-sm">
                <span className="text-gray-500">Notes:</span>{' '}
                {detail.is_refund
                  ? detail.notes.replace(
                      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
                      (uuid) => `#${uuid.slice(-8).toUpperCase()}`
                    )
                  : detail.notes}
              </div>
            )}

            {canDelete && !detail.is_refund && (
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={openEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Sale
              </Button>
            )}
            {canDelete && !detail.is_refund && !detail.is_exchange && detail.payment_status !== 'refunded' && (
              <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={openRefund}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Process Refund
              </Button>
            )}
            {canDelete && !detail.is_refund && !detail.is_exchange && detail.payment_status !== 'refunded' && (
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={openExchange}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Exchange Items
              </Button>
            )}
            {/* Exchange sale — let cashier exchange more items from the original sale */}
            {canDelete && detail.is_exchange && detail.exchange_original_id && (
              <Button
                className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                onClick={() => {
                  setDetailId(detail.exchange_original_id!)
                  setPendingExchange(true)
                }}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Exchange More Items from Original Sale
              </Button>
            )}
            <Button className="w-full bg-teal-700 hover:bg-teal-800 text-white" onClick={() => downloadReceipt(detail, true)} disabled={downloadingDetail}>
              {downloadingDetail
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Printer className="mr-2 h-4 w-4" />}
              {downloadingDetail ? 'Generating PDF…' : 'Download Receipt'}
            </Button>
          </div>
        ) : (
          <p className="py-8 text-center text-gray-400">Sale not found</p>
        )}
      </Modal>

      {/* Refund modal */}
      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="Process Refund" size="md">
        {detail && (() => {
          const maxRefundableAmount = Math.max(0, Number(detail.total) - getAlreadyRefundedTotal())
          const itemsRefundTotal = (detail.sale_items ?? []).reduce((s, i) => s + (Number(i.total) / i.quantity) * (refundQtys[i.id] ?? 0), 0)
          const isItemsDisabled = refundMode === 'items' && Object.values(refundQtys).every(v => v === 0)
          const amountModeTotal = Object.values(refundItemAmounts).reduce((s, v) => s + (v || 0), 0)
          const isAmountDisabled = refundMode === 'amount' && (amountModeTotal <= 0 || amountModeTotal > maxRefundableAmount)
          return (
            <div className="space-y-4">
              {/* Mode toggle */}
              <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm">
                <button
                  onClick={() => setRefundMode('items')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-semibold transition-all ${refundMode === 'items' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Package className="h-3.5 w-3.5" /> Return Items
                </button>
                <button
                  onClick={() => setRefundMode('amount')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-semibold transition-all ${refundMode === 'amount' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <DollarSign className="h-3.5 w-3.5" /> Refund Amount
                </button>
              </div>

              {refundMode === 'items' ? (
                <>
                  <p className="text-sm text-gray-500">Select items and quantities to return. Inventory will be restocked.</p>
                  {/* Item qty selectors */}
                  <div className="divide-y rounded-md border">
                    {(detail.sale_items ?? []).map(item => {
                      const alreadyRefunded = getAlreadyRefunded(item)
                      const remaining = item.quantity - alreadyRefunded
                      if (remaining <= 0) return (
                        <div key={item.id} className="flex items-center justify-between px-3 py-2 opacity-40">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate line-through">{item.name}</p>
                            <p className="text-xs text-red-500">Already refunded</p>
                          </div>
                        </div>
                      )
                      return (
                        <div key={item.id} className="flex items-center justify-between px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              {formatCurrency(Number(item.total) / item.quantity)} × {item.quantity}
                              {Number(item.discount) > 0 && <span className="ml-1 text-green-600">(-{formatCurrency(Number(item.discount))} disc)</span>}
                              {alreadyRefunded > 0 && <span className="ml-1 text-orange-500">({alreadyRefunded} already refunded)</span>}
                            </p>
                          </div>
                          <div className="ml-3 flex items-center gap-2">
                            <button
                              className="flex h-6 w-6 items-center justify-center rounded border text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                              onClick={() => setRefundQtys(q => ({ ...q, [item.id]: Math.max(0, (q[item.id] ?? 0) - 1) }))}
                              disabled={(refundQtys[item.id] ?? 0) <= 0}
                            >−</button>
                            <span className="w-6 text-center text-sm font-medium">{refundQtys[item.id] ?? 0}</span>
                            <button
                              className="flex h-6 w-6 items-center justify-center rounded border text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                              onClick={() => setRefundQtys(q => ({ ...q, [item.id]: Math.min(remaining, (q[item.id] ?? 0) + 1) }))}
                              disabled={(refundQtys[item.id] ?? 0) >= remaining}
                            >+</button>
                          </div>
                          <div className="ml-3 w-16 text-right text-sm font-medium">
                            {formatCurrency((Number(item.total) / item.quantity) * (refundQtys[item.id] ?? 0))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Refund total */}
                  <div className="flex justify-between rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold">
                    <span>Refund Total</span>
                    <span className="text-orange-700">{formatCurrency(itemsRefundTotal)}</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Enter the amount to refund per item. Stock will <strong>not</strong> be restocked.</p>
                  <div className="divide-y rounded-md border">
                    {(detail.sale_items ?? []).map(item => {
                      const itemMax = Number(item.total)
                      const itemAmt = refundItemAmounts[item.id] ?? 0
                      const currencySymbol = formatCurrency(0).replace(/[\d.,\s]/g, '').trim() || '€'
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              {formatCurrency(Number(item.unit_price))} × {item.quantity}
                              {' · '}<span className="text-gray-400">max {formatCurrency(itemMax)}</span>
                            </p>
                          </div>
                          <div className="relative w-28 shrink-0">
                            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-gray-400 text-sm">{currencySymbol}</span>
                            <input
                              type="number"
                              min={0}
                              max={itemMax}
                              step={0.01}
                              className={`w-full rounded-md border py-1.5 pl-6 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${itemAmt > itemMax ? 'border-red-400' : ''}`}
                              placeholder="0.00"
                              value={itemAmt || ''}
                              onChange={e => {
                                const val = Math.max(0, Number(e.target.value))
                                setRefundItemAmounts(prev => ({ ...prev, [item.id]: Math.min(itemMax, val) }))
                              }}
                            />
                          </div>
                          <div className="w-16 shrink-0 text-right text-sm font-semibold text-blue-700">
                            {itemAmt > 0 ? formatCurrency(itemAmt) : <span className="text-gray-300">—</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {(() => {
                    const amountTotal = Object.values(refundItemAmounts).reduce((s, v) => s + (v || 0), 0)
                    return (
                      <div className="flex justify-between rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold">
                        <span>Refund Total</span>
                        <span className={amountTotal > maxRefundableAmount ? 'text-red-600' : 'text-orange-700'}>
                          {formatCurrency(amountTotal)}
                          {amountTotal > maxRefundableAmount && <span className="ml-1 text-xs font-normal">exceeds max</span>}
                        </span>
                      </div>
                    )
                  })()}
                </>
              )}

              {/* Reason */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Reason (optional)</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Customer changed mind, defective item…"
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                />
              </div>

              {/* Return payment method */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Return Via</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={refundPaymentMethod}
                  onChange={e => setRefundPaymentMethod(e.target.value as 'cash' | 'card' | 'store_credit')}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="store_credit">Store Credit</option>
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setRefundOpen(false)} disabled={refundMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => refundMutation.mutate()}
                  disabled={refundMutation.isPending || isItemsDisabled || isAmountDisabled}
                >
                  {refundMutation.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <RotateCcw className="mr-2 h-4 w-4" />}
                  {refundMutation.isPending ? 'Processing…' : 'Confirm Refund'}
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Edit Sale modal */}
      <Modal open={editOpen} onClose={() => { setEditOpen(false); setEditForm(null) }} title="Edit Sale" size="lg">
        {editForm && detail && (
          <div className="space-y-5">
            {/* Warning for partially refunded sales (not credit) */}
            {detail.payment_status === 'partial' && detail.payment_method !== 'on_account' && (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
                This sale has partial refunds. Editing quantities will adjust inventory; already-refunded quantities cannot be reduced below what was refunded.
              </div>
            )}

            {/* Customer picker — dropdown portalled to body to escape modal overflow */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Customer</label>
              {editForm.customer_id ? (
                <div className="flex items-center justify-between rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm">
                  <span className="font-medium text-blue-800">
                    {editSelectedCustomerName
                      ?? (customerName(detail?.customers) !== '—' ? customerName(detail?.customers) : editForm.customer_id?.slice(-8).toUpperCase())}
                  </span>
                  <button
                    type="button"
                    className="ml-2 text-blue-400 hover:text-red-500 transition-colors"
                    onClick={() => {
                      setEditForm(f => f ? { ...f, customer_id: null } : f)
                      setEditSelectedCustomerName(null)
                      setEditCustomerSearch('')
                      setEditCustomerResults([])
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={customerInputRef}
                    type="text"
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Search customer by name or phone…"
                    value={editCustomerSearch}
                    onFocus={() => setEditDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setEditDropdownOpen(false), 150)}
                    onChange={async e => {
                      const q = e.target.value
                      setEditCustomerSearch(q)
                      setEditDropdownOpen(true)
                      if (!q.trim()) { setEditCustomerResults([]); return }
                      setEditCustomerSearching(true)
                      try {
                        const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=8`)
                        const json = await res.json()
                        setEditCustomerResults(json.data ?? [])
                      } finally {
                        setEditCustomerSearching(false)
                      }
                    }}
                  />
                  {editCustomerSearching && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 mt-1 ml-auto" />
                  )}
                  {editDropdownOpen && (() => {
                    const listToShow = editCustomerSearch.trim() ? editCustomerResults : editRecentCustomers
                    if (!listToShow.length) return null
                    return (
                      <ul
                        className="mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto"
                        onMouseDown={e => e.preventDefault()}
                      >
                        {!editCustomerSearch.trim() && (
                          <li className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border-b">
                            Recent Customers
                          </li>
                        )}
                        {listToShow.map(c => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                              onClick={() => {
                                const name = `${c.first_name} ${c.last_name ?? ''}`.trim()
                                setEditForm(f => f ? { ...f, customer_id: c.id } : f)
                                setEditSelectedCustomerName(name)
                                setEditCustomerSearch('')
                                setEditCustomerResults([])
                                setEditDropdownOpen(false)
                              }}
                            >
                              <span className="font-medium text-gray-800">{c.first_name} {c.last_name ?? ''}</span>
                              {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Payment Method</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.payment_method}
                  onChange={e => setEditForm(f => f ? { ...f, payment_method: e.target.value } : f)}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="gift_card">Gift Card</option>
                  <option value="split">Split</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Payment Status</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.payment_status}
                  onChange={e => setEditForm(f => f ? { ...f, payment_status: e.target.value } : f)}
                >
                  <option value="paid">Paid</option>
                  {/* Refunded is intentionally not selectable here — use the Refund action
                      so a proper refund record is created instead of just relabeling this sale. */}
                  {/* on_account / partial are computed by the system — not manually settable */}
                  {(editForm.payment_status === 'partial' || editForm.payment_status === 'on_account') && (
                    <option value={editForm.payment_status} disabled>
                      {getStatusLabel(editForm.payment_status, detail.payment_method)} (system-managed)
                    </option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Optional notes…"
                value={editForm.notes}
                onChange={e => setEditForm(f => f ? { ...f, notes: e.target.value } : f)}
              />
            </div>

            {/* Items */}
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-700">Items</p>
              <div className="rounded-md border divide-y">
                {editForm.items.map(item => {
                  const alreadyRefunded = getAlreadyRefunded({ id: item.id, name: item.name, quantity: item.quantity, unit_price: item.unit_price, discount: item.discount, total: item.total })
                  const minQty = Math.max(1, alreadyRefunded)
                  return (
                    <div key={item.id} className="px-3 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.product_id && (
                          <span className="text-xs text-gray-400">Inventory tracked</span>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="mb-0.5 block text-xs text-gray-500">Qty</label>
                          <div className="flex items-center gap-1">
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded border text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                              onClick={() => editItemField(item.id, 'quantity', Math.max(minQty, item.quantity - 1))}
                              disabled={item.quantity <= minQty}
                            >−</button>
                            <input
                              type="number"
                              min={minQty}
                              className="w-12 rounded border px-1 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={item.quantity}
                              onChange={e => editItemField(item.id, 'quantity', Math.max(minQty, Number(e.target.value) || 1))}
                            />
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded border text-gray-500 hover:bg-gray-50"
                              onClick={() => editItemField(item.id, 'quantity', item.quantity + 1)}
                            >+</button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-xs text-gray-500">Unit Price</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={item.unit_price}
                            onChange={e => editItemField(item.id, 'unit_price', Math.max(0, Number(e.target.value) || 0))}
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-xs text-gray-500">Item Disc.</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={item.discount}
                            onChange={e => editItemField(item.id, 'discount', Math.max(0, Number(e.target.value) || 0))}
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-xs text-gray-500">Line Total</label>
                          <p className="py-1 text-sm font-medium">{formatCurrency(item.total)}</p>
                        </div>
                      </div>
                      {alreadyRefunded > 0 && (
                        <p className="text-xs text-orange-500">{alreadyRefunded} unit(s) already refunded — minimum qty is {minQty}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sale-level adjustments */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Sale Discount</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.discount}
                  onChange={e => setEditForm(f => f ? { ...f, discount: Math.max(0, Number(e.target.value) || 0) } : f)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tax</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.tax}
                  onChange={e => setEditForm(f => f ? { ...f, tax: Math.max(0, Number(e.target.value) || 0) } : f)}
                />
              </div>
            </div>

            {/* Totals preview */}
            <div className="rounded-md bg-gray-50 p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span><span>{formatCurrency(editSubtotal())}</span>
              </div>
              {editForm.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span><span>-{formatCurrency(editForm.discount)}</span>
                </div>
              )}
              {editForm.tax > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Tax</span><span>+{formatCurrency(editForm.tax)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-bold">
                <span>New Total</span><span>{formatCurrency(editTotal())}</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setEditOpen(false); setEditForm(null) }} disabled={editMutation.isPending}>
                Cancel
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => editMutation.mutate()}
                disabled={editMutation.isPending}
              >
                {editMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Pencil className="mr-2 h-4 w-4" />}
                {editMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cash In / Cash Out detail modal — read-only, data comes straight from the table row */}
      <Modal
        open={!!cashDetailRow}
        onClose={() => setCashDetailRow(null)}
        title={cashDetailRow?.record_type === 'cash_in' ? 'Cash In Details' : 'Cash Out Details'}
        size="sm"
      >
        {cashDetailRow && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cashDetailRow.record_type === 'cash_in' ? 'bg-teal-100 text-teal-700' : 'bg-rose-100 text-rose-600'}`}>
                <DollarSign className="h-5 w-5" />
              </span>
              <div>
                <p className={`text-xl font-bold ${cashDetailRow.record_type === 'cash_in' ? 'text-teal-700' : 'text-rose-600'}`}>
                  {cashDetailRow.record_type === 'cash_out' ? '-' : ''}{formatCurrency(Math.abs(Number(cashDetailRow.total)))}
                </p>
                <p className="text-xs text-gray-500 font-mono">{cashDetailRow.reference}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Date</span><br />{formatDateTime(cashDetailRow.created_at)}</div>
              <div><span className="text-gray-500">Cashier</span><br />{cashDetailRow.profiles?.full_name ?? '—'}</div>
              <div><span className="text-gray-500">Method</span><br />{PAYMENT_LABELS[cashDetailRow.payment_method] ?? cashDetailRow.payment_method}</div>
              <div>
                <span className="text-gray-500">Purpose</span><br />
                {cashDetailRow.purpose === 'expense' ? 'Expense' : cashDetailRow.purpose === 'buyback' ? 'Buyback' : 'Plain'}
              </div>
              {cashDetailRow.purpose === 'buyback' && (
                <div className="col-span-2">
                  <span className="text-gray-500">Product</span><br />
                  {cashDetailRow.product_name ?? '—'}
                </div>
              )}
            </div>
            {cashDetailRow.notes && (
              <div className="rounded-md bg-gray-50 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-gray-500">Notes</p>
                <p className="text-gray-700">{cashDetailRow.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete confirmation modal */}
      {(() => {
        const row = sales.find(s => s.id === deleteConfirmId)
        const isCash = row?.record_type === 'cash_in' || row?.record_type === 'cash_out'
        const mutation = isCash ? deleteCashMovementMutation : deleteMutation
        return (
          <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} title={isCash ? 'Delete Cash Movement' : 'Delete Sale'} size="sm">
            <div className="space-y-4">
              {isCash ? (
                <p className="text-sm text-gray-600">
                  This will permanently delete this {row?.record_type === 'cash_in' ? 'Cash In' : 'Cash Out'} record. This action cannot be undone.
                </p>
              ) : row?.payment_status === 'partial' ? (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  <p className="font-semibold mb-1">This sale has partial refunds.</p>
                  <p>Deleting it will also delete all associated refund records. Only the unrefunded inventory will be restored. This cannot be undone.</p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  This will permanently delete the sale and restore inventory quantities. This action cannot be undone.
                </p>
              )}
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={mutation.isPending}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => mutation.mutate(deleteConfirmId!)}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Trash2 className="mr-2 h-4 w-4" />}
                  {mutation.isPending ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Delete PIN modal (retail template only) */}
      <DeletePinModal />

      {/* ── Exchange Modal ─────────────────────────────────────────────────────── */}
      <Modal open={exchangeOpen} onClose={() => setExchangeOpen(false)} title="Exchange Items" size="2xl">
        {detail && (() => {
          const returnedTotal = (detail.sale_items ?? []).reduce((s, i) => s + (Number(i.total) / i.quantity) * (exchangeReturnQtys[i.id] ?? 0), 0)
          const newTotal = exchangeNewItems.reduce((s, i) => s + i.total, 0)
          const net = newTotal - returnedTotal
          const hasReturns = Object.values(exchangeReturnQtys).some(v => v > 0)
          const hasNew = exchangeNewItems.length > 0

          return (
            <div className="space-y-4">
              {/* Stepper */}
              <div className="flex items-center gap-0 rounded-xl border border-gray-200 bg-gray-50 p-0.5 text-sm">
                {(['Return Items', 'Replacement', 'Settlement'] as const).map((label, idx) => {
                  const step = (idx + 1) as 1 | 2 | 3
                  const active = exchangeStep === step
                  const done = exchangeStep > step
                  return (
                    <div key={label} className="flex flex-1 items-center">
                      <button
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-semibold transition-all
                          ${active ? 'bg-indigo-600 text-white shadow-sm' : done ? 'text-indigo-600' : 'text-gray-400'}`}
                        onClick={() => { if (done || active) setExchangeStep(step) }}
                        disabled={step === 2 && !hasReturns || step === 3 && !hasNew}
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold
                          ${active ? 'bg-white/20' : done ? 'bg-indigo-100' : 'bg-gray-200'}`}>
                          {step}
                        </span>
                        {label}
                      </button>
                      {idx < 2 && <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" />}
                    </div>
                  )
                })}
              </div>

              {/* ── Step 1: Return Items ─────────────────────────────────────────── */}
              {exchangeStep === 1 && (
                <>
                  <p className="text-sm text-gray-500">Select items and quantities to return. Inventory will be restocked.</p>
                  <div className="divide-y rounded-md border max-h-72 overflow-y-auto">
                    {(detail.sale_items ?? []).map(item => {
                      const alreadyRefunded = getAlreadyRefunded(item)
                      const remaining = item.quantity - alreadyRefunded
                      if (remaining <= 0) return (
                        <div key={item.id} className="flex items-center px-3 py-2 opacity-40">
                          <p className="flex-1 text-sm line-through truncate">{item.name}</p>
                          <span className="text-xs text-red-500">Fully returned</span>
                        </div>
                      )
                      const qty = exchangeReturnQtys[item.id] ?? 0
                      const unitPrice = Number(item.total) / item.quantity
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{item.name}</p>
                              {item.variant_id && !item.name.includes('–') && (
                                <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-mono text-indigo-500 border border-indigo-100">
                                  VAR-{item.variant_id.slice(-6).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">
                              {formatCurrency(unitPrice)} × {item.quantity}
                              {alreadyRefunded > 0 && <span className="ml-1 text-orange-500">({alreadyRefunded} already returned)</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button className="flex h-6 w-6 items-center justify-center rounded border text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                              onClick={() => setExchangeReturnQtys(q => ({ ...q, [item.id]: Math.max(0, (q[item.id] ?? 0) - 1) }))}
                              disabled={qty <= 0}>
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-sm font-medium">{qty}</span>
                            <button className="flex h-6 w-6 items-center justify-center rounded border text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                              onClick={() => setExchangeReturnQtys(q => ({ ...q, [item.id]: Math.min(remaining, (q[item.id] ?? 0) + 1) }))}
                              disabled={qty >= remaining}>
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="w-16 text-right text-sm font-semibold text-indigo-700">
                            {qty > 0 ? formatCurrency(unitPrice * qty) : <span className="text-gray-300">—</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-indigo-50 px-3 py-2 text-sm font-semibold">
                    <span>Credit from return</span>
                    <span className="text-indigo-700">{formatCurrency(returnedTotal)}</span>
                  </div>
                  <div className="flex justify-end">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setExchangeStep(2)} disabled={!hasReturns}>
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}

              {/* ── Step 2: Select Replacement ───────────────────────────────────── */}
              {exchangeStep === 2 && (
                <>
                  {/* Variant picker overlay */}
                  {exchangeVariantFor ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setExchangeVariantFor(null)} className="text-gray-400 hover:text-gray-600">
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <p className="text-sm font-semibold">{exchangeVariantFor.name} — Select variant</p>
                      </div>
                      {exchangeVariantsLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-indigo-500" /></div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                          {exchangeVariants.map((v: any) => (
                            <button key={v.id} onClick={() => addExchangeNewItem(exchangeVariantFor, v)}
                              className="flex flex-col items-start rounded-lg border p-2.5 text-left text-sm hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                              <span className="font-medium">{v.name}</span>
                              <span className="text-xs text-gray-500">{formatCurrency(v.selling_price ?? exchangeVariantFor.selling_price)}</span>
                              {v.stock != null && <span className={`text-[10px] ${v.stock <= 0 ? 'text-red-500' : 'text-gray-400'}`}>{v.stock <= 0 ? 'Out of stock' : `${v.stock} in stock`}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Product search */}
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          className="w-full rounded-md border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          placeholder="Search products to add as replacement…"
                          value={exchangeProductSearch}
                          onChange={e => setExchangeProductSearch(e.target.value)}
                          autoFocus
                        />
                        {exchangeSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
                      </div>

                      {/* Results grid */}
                      {exchangeProductResults.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto">
                          {exchangeProductResults.map((p: any) => (
                            <button key={p.id}
                              onClick={() => {
                                if (p.has_variants) { loadVariants(p) }
                                else addExchangeNewItem(p)
                              }}
                              className="flex flex-col items-start rounded-lg border p-2.5 text-left text-sm hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                              <span className="font-medium truncate w-full">{p.name}</span>
                              <span className="text-xs text-gray-500">{formatCurrency(p.selling_price ?? 0)}</span>
                              {p.has_variants && <span className="text-[10px] text-indigo-500">Select variant →</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {!exchangeSearching && exchangeProductSearch && exchangeProductResults.length === 0 && (
                        <p className="py-4 text-center text-sm text-gray-400">No products found</p>
                      )}

                      {/* Selected new items */}
                      {exchangeNewItems.length > 0 && (
                        <>
                          <div className="border-t pt-3">
                            <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Selected replacements</p>
                            <div className="divide-y rounded-md border">
                              {exchangeNewItems.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 px-3 py-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{item.name}</p>
                                    <p className="text-xs text-gray-500">{formatCurrency(item.unit_price)}</p>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button className="flex h-5 w-5 items-center justify-center rounded border text-gray-400 hover:bg-gray-50 disabled:opacity-30"
                                      onClick={() => setExchangeNewItems(prev => prev.map((i, n) => n === idx && i.quantity > 1 ? { ...i, quantity: i.quantity - 1, total: i.unit_price * (i.quantity - 1) } : i))}
                                      disabled={item.quantity <= 1}>
                                      <Minus className="h-2.5 w-2.5" />
                                    </button>
                                    <span className="w-4 text-center text-xs font-medium">{item.quantity}</span>
                                    <button className="flex h-5 w-5 items-center justify-center rounded border text-gray-400 hover:bg-gray-50"
                                      onClick={() => setExchangeNewItems(prev => prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1, total: i.unit_price * (i.quantity + 1) } : i))}>
                                      <Plus className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                  <span className="w-14 text-right text-sm font-semibold">{formatCurrency(item.total)}</span>
                                  <button className="text-gray-300 hover:text-red-400 transition-colors"
                                    onClick={() => setExchangeNewItems(prev => prev.filter((_, n) => n !== idx))}>
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between rounded-md bg-indigo-50 px-3 py-2 text-sm font-semibold">
                            <span>New items total</span>
                            <span className="text-indigo-700">{formatCurrency(newTotal)}</span>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setExchangeStep(1)}>
                      <ChevronLeft className="mr-1 h-4 w-4" /> Back
                    </Button>
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setExchangeStep(3)} disabled={!hasNew}>
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}

              {/* ── Step 3: Settlement ──────────────────────────────────────────── */}
              {exchangeStep === 3 && (
                <>
                  {/* Summary card */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Return credit</span>
                      <span className="font-semibold text-green-700">− {formatCurrency(returnedTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">New items</span>
                      <span className="font-semibold text-blue-700">+ {formatCurrency(newTotal)}</span>
                    </div>
                    <div className="border-t pt-2 mt-1 flex justify-between text-base font-bold">
                      <span>{net > 0 ? 'Customer pays' : net < 0 ? 'Customer receives' : 'No payment needed'}</span>
                      <span className={net > 0 ? 'text-red-600' : net < 0 ? 'text-green-700' : 'text-gray-500'}>
                        {net === 0 ? '—' : formatCurrency(Math.abs(net))}
                      </span>
                    </div>
                  </div>

                  {/* Payment method (if customer pays more) */}
                  {net > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer pays via</p>
                      <div className="flex gap-2">
                        {(['cash', 'card', 'on_account'] as const).map(m => (
                          <button key={m}
                            onClick={() => setExchangePayMethod(m)}
                            className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition-all
                              ${exchangePayMethod === m ? m === 'on_account' ? 'bg-purple-600 text-white border-purple-600' : 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : 'Credit'}
                          </button>
                        ))}
                      </div>
                      {exchangePayMethod === 'on_account' && (
                        <div className="mt-3 space-y-3 rounded-xl border border-purple-100 bg-purple-50/60 p-3">
                          <p className="text-xs text-purple-600">Customer pays part now, rest goes to credit balance.</p>

                          {/* Deposit amount */}
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-500">Deposit amount (optional)</label>
                            <div className="relative">
                              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
                                {formatCurrency(0).replace(/[\d.,\s]/g, '').trim() || '€'}
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={net}
                                step={0.01}
                                placeholder="0.00"
                                className="w-full rounded-lg border border-purple-200 bg-white py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                                value={exchangeDepositAmount}
                                onChange={e => {
                                  const v = Math.min(parseFloat(e.target.value) || 0, net)
                                  setExchangeDepositAmount(v > 0 ? String(v) : e.target.value)
                                }}
                              />
                            </div>
                          </div>

                          {/* Deposit payment method */}
                          {parseFloat(exchangeDepositAmount) > 0 && (
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-gray-500">Deposit paid via</label>
                              <div className="flex gap-2">
                                {(['cash', 'card'] as const).map(m => (
                                  <button key={m} onClick={() => setExchangeDepositMethod(m)}
                                    className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold transition-all
                                      ${exchangeDepositMethod === m ? 'bg-purple-600 text-white border-purple-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                                    {m === 'cash' ? 'Cash' : 'Card'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Balance preview */}
                          <div className="flex justify-between border-t border-purple-100 pt-2 text-sm">
                            <span className="text-gray-500">Outstanding balance</span>
                            <span className="font-bold text-purple-700">
                              {formatCurrency(Math.max(0, net - (parseFloat(exchangeDepositAmount) || 0)))}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Refund method (if customer gets money back) */}
                  {net < 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer refund via</p>
                      <div className="flex gap-2">
                        {(['cash', 'card', 'store_credit'] as const).map(m => (
                          <button key={m}
                            onClick={() => setExchangeRefundMethod(m)}
                            className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition-all
                              ${exchangeRefundMethod === m ? 'bg-green-600 text-white border-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : 'Store Credit'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {net === 0 && (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 border border-green-200 py-2.5 text-sm font-semibold text-green-700">
                      No payment required — straight exchange
                    </div>
                  )}

                  <div className="flex justify-between gap-3">
                    <Button variant="outline" onClick={() => setExchangeStep(2)} disabled={exchangeMutation.isPending}>
                      <ChevronLeft className="mr-1 h-4 w-4" /> Back
                    </Button>
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => exchangeMutation.mutate()}
                      disabled={exchangeMutation.isPending}
                    >
                      {exchangeMutation.isPending
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
                        : <><ArrowLeftRight className="mr-2 h-4 w-4" /> Confirm Exchange</>}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

function SummaryCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${className ?? ''}`}>{value}</p>
    </div>
  )
}
