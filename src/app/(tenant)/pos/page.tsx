'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Plus, Minus, Trash2, User, UserPlus, X, Lock, Unlock,
  AlertTriangle, ChevronRight, Wrench, ShoppingBag,
  Gift, Package, Ticket, FileText, ClipboardList, ShieldCheck,
  MoreHorizontal, Banknote, CreditCard, SplitSquareHorizontal,
  Phone, Mail, ExternalLink, CheckCircle2, DollarSign, Tag,
  ChevronLeft, ArrowRight, ArrowLeft, Camera, Check, Layers
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { usePosStore } from '@/store/pos.store'
import type { PaymentSplit } from '@/store/pos.store'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { pdf } from '@react-pdf/renderer'
import { SaleReceiptPdf } from '@/components/pdf/sale-receipt-pdf'
import { usePinPrompt } from '@/components/ui/pin-prompt'
import type { Product, Customer } from '@/types/database'
import { CustomFieldRenderer, useCustomFieldDefs } from '@/components/shared/custom-field-renderer'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type PosTab = 'repairs' | 'products'
type RepairLevel = 'categories' | 'brands' | 'devices' | 'problems' | 'details'

interface ServiceCategory  { id: string; name: string; image_url?: string | null; slug: string }
interface ServiceBrand { id: string; name: string; logo_url?: string | null }
interface ServiceDevice    { id: string; name: string; image_url?: string | null; manufacturer_id: string }
interface ServiceProblem   { id: string; name: string; price: number; cost: number; warranty_days: number }
interface ProductVariant { id: string; name: string; sku: string | null; selling_price: number; cost_price: number | null; attributes: Record<string, string> }
type ProductWithStock = Product & { on_hand?: number; has_variants?: boolean; variant_count?: number }
interface RegisterSession { id: string; status: 'open' | 'closed'; opening_float: number; opened_at: string; cashier_id: string }
interface Employee { id: string; full_name: string }

interface RepairDetailsForm {
  imei_type: 'Serial' | 'IMEI'
  serial_number: string
  lock_type: 'passcode' | 'pattern'
  passcode: string
  repair_charges: number
  charge_deposit: boolean
  deposit_amount: number
  is_rush: boolean
  assigned_to: string
  due_date: string
  status: string
  physical_location: string
  task_type: string
  problem_warranties: Record<string, string>
}

const WARRANTY_OPTIONS = ['No Warranty', '30 Days', '60 Days', '90 Days', '6 Months', '1 Year', '2 Years']
const REPAIR_STATUS_OPTIONS = [
  { value: 'waiting_for_inspection', label: 'Waiting for Inspection' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_for_parts', label: 'Waiting for Parts' },
  { value: 'repaired', label: 'Repaired' },
  { value: 'picked_up', label: 'Picked Up' },
]
const TASK_TYPE_OPTIONS = ['In-Store', 'Mail-In', 'Pick-Up']

const TABS: { key: PosTab; label: string; icon: React.ReactNode }[] = [
  { key: 'repairs',       label: 'Repairs',        icon: <Wrench className="h-4 w-4" /> },
  { key: 'products',      label: 'Products',       icon: <ShoppingBag className="h-4 w-4" /> },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function PosPage() {
  const router = useRouter()
  const { activeBranch, profile } = useAuthStore()
  const pos = usePosStore()
  const { requestPin, PinModal } = usePinPrompt()

  // Tab
  const [activeTab, setActiveTab] = useState<PosTab>('repairs')

  // Register session
  const [session, setSession] = useState<RegisterSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [openRegisterModal, setOpenRegisterModal] = useState(false)
  const [closeRegisterModal, setCloseRegisterModal] = useState(false)
  const [openingFloat, setOpeningFloat] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [sessionProcessing, setSessionProcessing] = useState(false)
  const [zReport, setZReport] = useState<Record<string, unknown> | null>(null)
  // Denomination counting
  const [openingDenoms, setOpeningDenoms] = useState<Record<string, number>>({})
  const [closingDenoms, setClosingDenoms] = useState<Record<string, number>>({})
  const [openingNote, setOpeningNote] = useState('')
  const [closingNote, setClosingNote] = useState('')
  const [prevClosingBalance, setPrevClosingBalance] = useState<number | null>(null)
  // Cash In/Out modal
  const [cashMovementOpen, setCashMovementOpen] = useState(false)
  const [cashMovementType, setCashMovementType] = useState<'cash_in' | 'cash_out'>('cash_in')
  const [cashMovementAmount, setCashMovementAmount] = useState('')
  const [cashMovementNotes, setCashMovementNotes] = useState('')
  const [cashMovementSaving, setCashMovementSaving] = useState(false)
  // Join shift
  const [joinShiftOpen, setJoinShiftOpen] = useState(false)
  const [existingSession, setExistingSession] = useState<RegisterSession | null>(null)

  // Customer
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [customerSearching, setCustomerSearching] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [newCustomerSaving, setNewCustomerSaving] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [outstandingBalance, setOutstandingBalance] = useState(0)
  const [outstandingOpen, setOutstandingOpen] = useState(false)

  // Ticket re-open scan
  const [ticketScan, setTicketScan] = useState('')

  // Products tab
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [productsLoading, setProductsLoading] = useState(false)

  // ── Repairs wizard state ──────────────────────────────────────────────────────
  const [repairLevel, setRepairLevel] = useState<RepairLevel>('categories')
  const [repairCategory, setRepairCategory] = useState<ServiceCategory | null>(null)
  const [repairBrand, setRepairBrand] = useState<ServiceBrand | null>(null)
  const [repairDevice, setRepairDevice] = useState<ServiceDevice | null>(null)
  const [repairSearch, setRepairSearch] = useState('')
  const [repairItems, setRepairItems] = useState<any[]>([])
  const [repairLoading, setRepairLoading] = useState(false)
  // Problems step
  const [selectedProblems, setSelectedProblems] = useState<ServiceProblem[]>([])
  // Parts (kept for repair payload)
  const [selectedParts, setSelectedParts] = useState<{ product: ProductWithStock; qty: number }[]>([])
  // Details step
  const [employees, setEmployees] = useState<Employee[]>([])
  const [repairDetails, setRepairDetails] = useState<RepairDetailsForm>({
    imei_type: 'Serial', serial_number: '', lock_type: 'passcode', passcode: '',
    repair_charges: 0, charge_deposit: false, deposit_amount: 0,
    is_rush: false, assigned_to: '', due_date: '', status: 'waiting_for_inspection',
    physical_location: '', task_type: 'In-Store', problem_warranties: {},
  })
  const [confirmingRepair, setConfirmingRepair] = useState(false)
  const [repairDetailsMenuOpen, setRepairDetailsMenuOpen] = useState(false)
  const [repairCustomFields, setRepairCustomFields] = useState<Record<string, unknown>>({})
  // Custom field defs scoped to the selected repair category
  const { defs: repairCustomFieldDefs } = useCustomFieldDefs('repairs', repairCategory?.name ?? undefined)

  // Misc item
  const [miscName, setMiscName] = useState('')
  const [miscPrice, setMiscPrice] = useState('')

  // Gift card
  const [gcCode, setGcCode] = useState('')
  const [gcLooking, setGcLooking] = useState(false)
  const [gcError, setGcError] = useState('')
  const [gcModalOpen, setGcModalOpen] = useState(false)

  // Products tab view
  type ProductsView = 'by_products' | 'by_parts' | 'custom_item'
  const [productsView, setProductsView] = useState<ProductsView>('by_products')

  // Hierarchy drill-down: Device Type → Brand → Model → Products
  type CatLevel = 'device_types' | 'brands' | 'models' | 'products'
  const [catLevel, setCatLevel] = useState<CatLevel>('device_types')
  const [catBreadcrumb, setCatBreadcrumb] = useState<{ level: CatLevel; id: string; name: string }[]>([])
  const [catItems, setCatItems] = useState<{ id: string; name: string }[]>([])
  const [catItemsLoading, setCatItemsLoading] = useState(false)
  const [categoryProducts, setCategoryProducts] = useState<ProductWithStock[]>([])
  const [categoryProductsLoading, setCategoryProductsLoading] = useState(false)

  // Part Items drill-down: Device Type → Brand → Model → Part Types
  type PartLevel = 'device_types' | 'brands' | 'models' | 'part_types' | 'parts'
  const [partLevel, setPartLevel] = useState<PartLevel>('device_types')
  const [partBreadcrumb, setPartBreadcrumb] = useState<{ level: PartLevel; id: string; name: string }[]>([])
  const [partItems, setPartItems] = useState<{ id: string; name: string }[]>([])
  const [partItemsLoading, setPartItemsLoading] = useState(false)
  const [partProducts, setPartProducts] = useState<ProductWithStock[]>([])
  const [partProductsLoading, setPartProductsLoading] = useState(false)
  // Advanced search
  const [advSearchOpen, setAdvSearchOpen] = useState(false)
  const [advSearchName, setAdvSearchName] = useState('')
  const [advSearchSku, setAdvSearchSku] = useState('')
  const [advSearchCatIds, setAdvSearchCatIds] = useState<Set<string>>(new Set())
  const [advSearchResults, setAdvSearchResults] = useState<ProductWithStock[]>([])
  const [advSearching, setAdvSearching] = useState(false)
  const [allCats, setAllCats] = useState<{ id: string; name: string; parent_id: string | null }[]>([])

  // Warranty Claim modal
  const [warrantyOpen, setWarrantyOpen] = useState(false)
  const [warrantyForm, setWarrantyForm] = useState({ imei: '', partSerial: '', invoiceId: '', ticketId: '', customerName: '', customerMobile: '' })
  const [warrantyResults, setWarrantyResults] = useState<any[]>([])
  const [warrantySearching, setWarrantySearching] = useState(false)
  const [warrantyActionsOpen, setWarrantyActionsOpen] = useState<string | null>(null)
  const [warrantyClaimModal, setWarrantyClaimModal] = useState<{ repairId: string; item: any } | null>(null)
  const [warrantyClaimReason, setWarrantyClaimReason] = useState('')
  const [warrantyClaimSubmitting, setWarrantyClaimSubmitting] = useState(false)

  // Variant selection modal
  const [variantProduct, setVariantProduct] = useState<ProductWithStock | null>(null)
  const [variantList, setVariantList] = useState<ProductVariant[]>([])
  const [variantLoading, setVariantLoading] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)

  // Mobile view toggle
  const [mobileView, setMobileView] = useState<'browse' | 'cart'>('browse')

  // Payment
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [splits, setSplits] = useState<Record<string, string>>({ cash: '', card: '' })
  const [cashTendered, setCashTendered] = useState('')
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed')

  // ── Register ──────────────────────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    if (!activeBranch) return
    setSessionLoading(true)
    const [sessionRes, prevRes] = await Promise.all([
      fetch(`/api/pos/session?branch_id=${activeBranch.id}`),
      fetch(`/api/reports?branch_id=${activeBranch.id}&type=sessions&from=${new Date(Date.now() - 7 * 86400000).toISOString()}&to=${new Date().toISOString()}`),
    ])
    if (sessionRes.ok) {
      const j = await sessionRes.json()
      const s = j.data ?? null
      setExistingSession(s)
      // Only grant POS access if the current user opened this session or has joined it
      if (s && profile) {
        const members: Array<{ profile_id: string }> = s.register_session_members ?? []
        const isMember = s.cashier_id === profile.id || members.some(m => m.profile_id === profile.id)
        setSession(isMember ? s : null)
        if (!isMember) setJoinShiftOpen(true)
      } else {
        setSession(s)
      }
    }
    if (prevRes.ok) {
      const j = await prevRes.json()
      const sessions = j.data ?? []
      // Most recent closed session
      const lastClosed = sessions.find((s: any) => s.status === 'closed')
      setPrevClosingBalance(lastClosed?.closing_cash ?? null)
    }
    setSessionLoading(false)
  }, [activeBranch])

  useEffect(() => { fetchSession() }, [fetchSession])

  const DENOMINATIONS = [
    { label: '£50', value: 50 }, { label: '£20', value: 20 }, { label: '£10', value: 10 },
    { label: '£5', value: 5 }, { label: '£2', value: 2 }, { label: '£1', value: 1 },
    { label: '50p', value: 0.50 }, { label: '20p', value: 0.20 }, { label: '10p', value: 0.10 },
    { label: '5p', value: 0.05 }, { label: '2p', value: 0.02 }, { label: '1p', value: 0.01 },
  ]

  function denomTotal(denoms: Record<string, number>) {
    return DENOMINATIONS.reduce((sum, d) => sum + (denoms[String(d.value)] ?? 0) * d.value, 0)
  }

  async function handleOpenRegister() {
    if (!activeBranch) return
    setSessionProcessing(true)
    const total = denomTotal(openingDenoms)
    const res = await fetch('/api/pos/session/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opening_float: total || parseFloat(openingFloat) || 0,
        branch_id: activeBranch.id,
        opening_note: openingNote || undefined,
        opening_denominations: openingDenoms,
      }),
    })
    if (res.ok) {
      const j = await res.json()
      const returned = j.data ?? null
      // If the API returned an already-open session owned by someone else, show Join Shift
      if (returned && returned.cashier_id !== profile?.id) {
        setExistingSession(returned)
        setJoinShiftOpen(true)
      } else {
        await fetchSession()
        setOpeningFloat('')
        setOpeningDenoms({})
        setOpeningNote('')
      }
    }
    setSessionProcessing(false)
  }

  async function handleJoinShift() {
    if (!existingSession) return
    setSessionProcessing(true)
    const res = await fetch('/api/pos/session/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: existingSession.id }),
    })
    if (res.ok) { setJoinShiftOpen(false); await fetchSession() }
    setSessionProcessing(false)
  }

  async function handleCashMovement() {
    if (!session || !cashMovementAmount) return
    setCashMovementSaving(true)
    const res = await fetch('/api/pos/session/movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        type: cashMovementType,
        amount: parseFloat(cashMovementAmount),
        notes: cashMovementNotes || undefined,
      }),
    })
    if (res.ok) {
      setCashMovementOpen(false)
      setCashMovementAmount('')
      setCashMovementNotes('')
    }
    setCashMovementSaving(false)
  }

  async function handleCloseRegister() {
    if (!session) return
    setSessionProcessing(true)
    const total = denomTotal(closingDenoms)
    const res = await fetch('/api/pos/session/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        closing_cash: total || parseFloat(closingCash) || 0,
        closing_note: closingNote || undefined,
      }),
    })
    if (res.ok) {
      const j = await res.json()
      setZReport(j.data ?? null)
      setSession(null)
      setClosingCash('')
      setClosingDenoms({})
      setClosingNote('')
    }
    setSessionProcessing(false)
  }

  // ── Customer ──────────────────────────────────────────────────────────────────

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
    setCustomerSearch('')
    setCustomerDropdownOpen(false)
    setCustomerResults([])
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

  // ── Products Tab ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'products') return
    setProductsLoading(true)
    const params = new URLSearchParams({ limit: '200', show_on_pos: 'true' })
    if (activeBranch) params.set('branch_id', activeBranch.id)
    if (productSearch) params.set('search', productSearch)
    fetch(`/api/products?${params}`)
      .then(r => r.json())
      .then(j => { setProducts(j.data ?? []); setProductsLoading(false) })
  }, [activeTab, productSearch, activeBranch])

  // ── Variant selection ─────────────────────────────────────────────────────────

  async function openVariantSelect(product: ProductWithStock) {
    setVariantProduct(product)
    setSelectedVariantId(null)
    setVariantLoading(true)
    setVariantList([])
    const res = await fetch(`/api/products/${product.id}/variants`)
    const j = await res.json()
    setVariantList(j.data ?? [])
    setVariantLoading(false)
  }

  function addVariantToCart() {
    if (!variantProduct || !selectedVariantId) return
    const variant = variantList.find(v => v.id === selectedVariantId)
    if (variant) {
      pos.addToCart(variantProduct, variant as any)
    }
    setVariantProduct(null)
    setSelectedVariantId(null)
  }

  // ── Products Hierarchy Drill-down ────────────────────────────────────────────

  async function loadCatLevel(level: CatLevel, parentId?: string) {
    setCatItemsLoading(true)
    setCategoryProducts([])
    setCatLevel(level)
    try {
      if (level === 'device_types') {
        const res = await fetch('/api/categories?limit=200')
        const j = await res.json()
        setCatItems((j.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })))
      } else if (level === 'brands' && parentId) {
        const res = await fetch(`/api/brands?category_id=${parentId}`)
        const j = await res.json()
        setCatItems((j.data ?? []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })))
      } else if (level === 'models' && parentId) {
        const res = await fetch(`/api/services/devices?brand_id=${parentId}`)
        const j = await res.json()
        setCatItems((j.data ?? []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })))
      } else if (level === 'products' && parentId && activeBranch) {
        setCatItems([])
        setCategoryProductsLoading(true)
        const pp = new URLSearchParams({ limit: '100', show_on_pos: 'true', model_id: parentId, branch_id: activeBranch.id, item_type: 'product' })
        const pr = await fetch(`/api/products?${pp}`)
        const pj = await pr.json()
        setCategoryProducts(pj.data ?? [])
        setCategoryProductsLoading(false)
      }
    } catch { /* ignore */ }
    setCatItemsLoading(false)
  }

  function selectCatItem(item: { id: string; name: string }) {
    const nextLevel: Record<CatLevel, CatLevel> = { device_types: 'brands', brands: 'models', models: 'products', products: 'products' }
    const next = nextLevel[catLevel]
    setCatBreadcrumb(prev => [...prev, { level: catLevel, id: item.id, name: item.name }])
    loadCatLevel(next, item.id)
  }

  function navigateCatBreadcrumb(idx: number) {
    const crumb = catBreadcrumb[idx]
    const newBreadcrumb = catBreadcrumb.slice(0, idx)
    setCatBreadcrumb(newBreadcrumb)
    const nextLevel: Record<CatLevel, CatLevel> = { device_types: 'brands', brands: 'models', models: 'products', products: 'products' }
    loadCatLevel(nextLevel[crumb.level], crumb.id)
  }

  function resetCatBrowse() {
    setCatBreadcrumb([])
    loadCatLevel('device_types')
  }

  async function fetchAllCats() {
    const res = await fetch('/api/categories?limit=200')
    const j = await res.json()
    setAllCats(j.data ?? [])
  }

  // ── Part Items Hierarchy Drill-down ─────────────────────────────────────────

  async function loadPartLevel(level: PartLevel, parentId?: string) {
    setPartItemsLoading(true)
    setPartLevel(level)
    setPartProducts([])
    try {
      if (level === 'device_types') {
        const res = await fetch('/api/categories?limit=200')
        const j = await res.json()
        setPartItems((j.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })))
      } else if (level === 'brands' && parentId) {
        const res = await fetch(`/api/brands?category_id=${parentId}`)
        const j = await res.json()
        setPartItems((j.data ?? []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })))
      } else if (level === 'models' && parentId) {
        const res = await fetch(`/api/services/devices?brand_id=${parentId}`)
        const j = await res.json()
        setPartItems((j.data ?? []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })))
      } else if (level === 'part_types' && parentId) {
        const res = await fetch(`/api/part-types?device_id=${parentId}`)
        const j = await res.json()
        setPartItems((j.data ?? []).map((pt: { id: string; name: string }) => ({ id: pt.id, name: pt.name })))
      } else if (level === 'parts' && parentId && activeBranch) {
        setPartItems([])
        setPartProductsLoading(true)
        // parentId here is the part_type name
        const pp = new URLSearchParams({ limit: '100', show_on_pos: 'true', item_type: 'part', part_type: parentId, branch_id: activeBranch.id })
        const pr = await fetch(`/api/products?${pp}`)
        const pj = await pr.json()
        setPartProducts(pj.data ?? [])
        setPartProductsLoading(false)
      }
    } catch { /* ignore */ }
    setPartItemsLoading(false)
  }

  function selectPartItem(item: { id: string; name: string }) {
    const nextLevel: Record<PartLevel, PartLevel> = { device_types: 'brands', brands: 'models', models: 'part_types', part_types: 'parts', parts: 'parts' }
    const next = nextLevel[partLevel]
    setPartBreadcrumb(prev => [...prev, { level: partLevel, id: item.id, name: item.name }])
    // For part_types, pass the name (not id) since products.part_type stores the name
    if (partLevel === 'part_types') {
      loadPartLevel(next, item.name)
    } else {
      loadPartLevel(next, item.id)
    }
  }

  function navigatePartBreadcrumb(idx: number) {
    const crumb = partBreadcrumb[idx]
    const newBreadcrumb = partBreadcrumb.slice(0, idx)
    setPartBreadcrumb(newBreadcrumb)
    const nextLevel: Record<PartLevel, PartLevel> = { device_types: 'brands', brands: 'models', models: 'part_types', part_types: 'parts', parts: 'parts' }
    if (crumb.level === 'part_types') {
      loadPartLevel(nextLevel[crumb.level], crumb.name)
    } else {
      loadPartLevel(nextLevel[crumb.level], crumb.id)
    }
  }

  function resetPartBrowse() {
    setPartBreadcrumb([])
    loadPartLevel('device_types')
  }

  // ── Advanced Search ───────────────────────────────────────────────────────────

  async function runAdvSearch() {
    setAdvSearching(true)
    const params = new URLSearchParams({ limit: '100', show_on_pos: 'true' })
    if (activeBranch) params.set('branch_id', activeBranch.id)
    if (advSearchName.trim()) params.set('search', advSearchName.trim())
    else if (advSearchSku.trim()) params.set('search', advSearchSku.trim())
    const res = await fetch(`/api/products?${params}`)
    const j = await res.json()
    let results: ProductWithStock[] = j.data ?? []
    if (advSearchCatIds.size > 0) {
      results = results.filter(p => p.category_id && advSearchCatIds.has(p.category_id as string))
    }
    setAdvSearchResults(results)
    setAdvSearching(false)
  }

  function openAdvSearch() {
    setAdvSearchOpen(true)
    setAdvSearchResults([])
    setAdvSearchName('')
    setAdvSearchSku('')
    setAdvSearchCatIds(new Set())
    if (allCats.length === 0) fetchAllCats()
    runAdvSearch()
  }

  function toggleAdvCat(id: string) {
    setAdvSearchCatIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function runWarrantySearch() {
    if (!activeBranch) return
    const { imei, partSerial, invoiceId, ticketId, customerName, customerMobile } = warrantyForm
    if (!imei && !partSerial && !invoiceId && !ticketId && !customerName && !customerMobile) return
    setWarrantySearching(true)
    const params = new URLSearchParams({ branch_id: activeBranch.id })
    if (imei)           params.set('imei', imei)
    if (ticketId)       params.set('ticket_id', ticketId)
    if (invoiceId)      params.set('invoice_id', invoiceId)
    if (customerName)   params.set('customer_name', customerName)
    if (customerMobile) params.set('customer_mobile', customerMobile)
    const res = await fetch(`/api/repairs/warranty-search?${params}`)
    const j = await res.json()
    setWarrantyResults(j.data ?? [])
    setWarrantySearching(false)
  }

  async function submitWarrantyClaim() {
    if (!warrantyClaimModal || !warrantyClaimReason.trim()) return
    setWarrantyClaimSubmitting(true)
    // Mark item as warranty claim via a PATCH on repair_items — or simply log it via the repair status update
    // For now we update the repair status to 'warranty_claim' via a note and close the modal
    await fetch(`/api/repairs/${warrantyClaimModal.repairId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'warranty_claim', note: `Warranty claim: ${warrantyClaimReason}` }),
    })
    setWarrantyClaimModal(null)
    setWarrantyClaimReason('')
    setWarrantyClaimSubmitting(false)
    runWarrantySearch()
  }

  // Ctrl+S → Advanced Search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 's' && activeTab === 'products') {
        e.preventDefault()
        openAdvSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTab, activeBranch, allCats.length]) // eslint-disable-line

  // Load device types when switching to products tab
  useEffect(() => {
    if (activeTab === 'products' && productsView === 'by_products' && catItems.length === 0 && catLevel === 'device_types') {
      loadCatLevel('device_types')
    }
    if (activeTab === 'products' && productsView === 'by_parts' && partItems.length === 0 && partLevel === 'device_types') {
      loadPartLevel('device_types')
    }
  }, [activeTab, productsView]) // eslint-disable-line

  // ── Repairs Drill-down ────────────────────────────────────────────────────────

  async function loadLevel(level: RepairLevel, parentId?: string) {
    setRepairLoading(true); setRepairSearch('')
    let url = ''
    switch (level) {
      case 'categories':    url = '/api/services/categories'; break
      case 'brands': url = '/api/services/manufacturers'; break
      case 'devices':       url = `/api/services/devices?manufacturer_id=${parentId}`; break
      case 'problems':      url = `/api/services/problems?device_id=${parentId}`; break
      default: setRepairLoading(false); return
    }
    const res = await fetch(url)
    const j = await res.json()
    setRepairItems(j.data ?? [])
    setRepairLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'repairs' && repairLevel === 'categories') loadLevel('categories')
  }, [activeTab]) // eslint-disable-line

  function resetRepairs() {
    setRepairLevel('categories')
    setRepairCategory(null); setRepairBrand(null); setRepairDevice(null)
    setSelectedProblems([]); setSelectedParts([])
    setRepairDetails(d => ({ ...d, serial_number: '', passcode: '', repair_charges: 0, problem_warranties: {} }))
    loadLevel('categories')
  }

  function selectCategory(cat: ServiceCategory) {
    setRepairCategory(cat)
    setRepairLevel('brands')
    loadLevel('brands')
  }

  function selectBrand(brand: ServiceBrand) {
    setRepairBrand(brand)
    setRepairLevel('devices')
    loadLevel('devices', brand.id)
  }

  function selectDevice(dev: ServiceDevice) {
    setRepairDevice(dev)
    setRepairLevel('problems')
    setSelectedProblems([])
    loadLevel('problems', dev.id)
  }

  function toggleProblem(prob: ServiceProblem) {
    setSelectedProblems(prev => {
      const exists = prev.find(p => p.id === prob.id)
      const next = exists ? prev.filter(p => p.id !== prob.id) : [...prev, prob]
      const total = next.reduce((s, p) => s + p.price, 0)
      setRepairDetails(d => ({ ...d, repair_charges: total }))
      return next
    })
  }

  async function goToDetailsStep() {
    if (!activeBranch) return
    setRepairLevel('details')
    // Fetch employees
    const res = await fetch(`/api/employees?branch_id=${activeBranch.id}&limit=100`)
    const j = await res.json()
    setEmployees((j.data ?? []).map((e: any) => ({ id: e.id, full_name: e.full_name ?? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() })))
    // Initialize warranty map
    const warranties: Record<string, string> = {}
    selectedProblems.forEach(p => { warranties[p.id] = 'No Warranty' })
    setRepairDetails(d => ({ ...d, problem_warranties: warranties }))
  }

  async function confirmRepair() {
    if (!activeBranch) return
    setConfirmingRepair(true)
    try {
      const partsPayload = selectedParts.map(p => ({
        product_id: p.product.id,
        name: p.product.name,
        quantity: p.qty,
        unit_cost: p.product.cost_price ?? 0,
        unit_price: p.product.selling_price ?? 0,
      }))
      const payload = {
        branch_id: activeBranch.id,
        customer_id: pos.customer?.id ?? null,
        device_type: repairCategory?.name ?? null,
        device_brand: repairBrand?.name ?? null,
        device_model: repairDevice?.name ?? null,
        serial_number: repairDetails.serial_number || null,
        issue: selectedProblems.map(p => p.name).join(', ') || 'Repair',
        estimated_cost: repairDetails.repair_charges,
        deposit_paid: repairDetails.charge_deposit ? repairDetails.deposit_amount : 0,
        notify_customer: !!pos.customer,
        assigned_to: repairDetails.assigned_to || null,
        custom_fields: repairCustomFields,
        parts: partsPayload,
      }
      const res = await fetch('/api/repairs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const j = await res.json()
        const repair = j.data
        const deviceLabel = [repairBrand?.name, repairDevice?.name].filter(Boolean).join(' ')
        const problemLabel = selectedProblems.map(p => p.name).join(', ')
        const serviceTotal = selectedProblems.reduce((s, p) => s + p.price, 0)
        const virtualProduct = {
          id: repair.id,
          name: `${deviceLabel} — ${problemLabel}`,
          selling_price: serviceTotal,
          cost_price: selectedProblems.reduce((s, p) => s + p.cost, 0),
          is_service: true,
          show_on_pos: true,
          business_id: activeBranch.id,
          sku: repair.job_number ?? null,
          barcode: null, image_url: null, brand_id: null, category_id: null,
          description: null, tax_class: null, track_stock: false, is_serialized: false,
          valuation_method: 'weighted_average', is_active: true,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as unknown as Product
        pos.addToCart(virtualProduct)
        // Add each selected part as a separate cart line item
        for (const part of selectedParts) {
          for (let i = 0; i < part.qty; i++) {
            pos.addToCart(part.product as unknown as Product)
          }
        }
        resetRepairs()
      }
    } finally {
      setConfirmingRepair(false)
    }
  }

  // ── Misc / Gift Card ──────────────────────────────────────────────────────────

  function addMiscItem() {
    if (!miscName.trim() || !miscPrice) return
    const vp = { id: `misc-${Date.now()}`, name: miscName.trim(), selling_price: parseFloat(miscPrice) || 0, cost_price: 0, is_service: true, show_on_pos: true } as unknown as Product
    pos.addToCart(vp); setMiscName(''); setMiscPrice('')
  }

  async function lookupGiftCard() {
    if (!gcCode.trim() || !activeBranch) return
    setGcLooking(true); setGcError('')
    const params = new URLSearchParams({ code: gcCode, branch_id: activeBranch.id })
    if (pos.customer?.id) params.set('customer_id', pos.customer.id)
    const res = await fetch(`/api/gift-cards?${params}`)
    const j = await res.json()
    const card = j.data
    if (!card || card.balance <= 0) { setGcError('Gift card not found, has no balance, or not valid for this customer'); setGcLooking(false); return }
    pos.setGiftCard(card.id, Math.min(card.balance, total))
    pos.setPaymentMethod('gift_card')
    setGcCode(''); setGcLooking(false)
  }

  // ── Payment ───────────────────────────────────────────────────────────────────

  function effectiveDiscount() {
    return discountType === 'percent' ? pos.subtotal() * (pos.discount / 100) : pos.discount
  }

  const subtotal = pos.subtotal()
  const grossSubtotal = pos.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const itemDiscountTotal = pos.cart.reduce((sum, item) => sum + item.discount * item.quantity, 0)
  const discountAmt = effectiveDiscount()
  const totalDiscount = itemDiscountTotal + discountAmt
  const taxAmt = (subtotal - discountAmt) * (pos.taxRate / 100)
  const total = Math.max(0, subtotal - discountAmt + taxAmt)
  const totalDue = Math.max(0, total - pos.giftCardAmount - pos.storeCreditAmount - pos.loyaltyPointsAmount)

  const splitTotal = Object.values(splits).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const splitRemaining = Math.max(0, totalDue - splitTotal)
  const splitValid = pos.paymentMethod !== 'split' ||
    (Math.abs(splitTotal - totalDue) < 0.01 && Object.values(splits).some(v => parseFloat(v) > 0))
  const cashChange = pos.paymentMethod === 'cash' ? Math.max(0, (parseFloat(cashTendered) || 0) - totalDue) : 0

  async function processPayment() {
    if (!activeBranch || !profile) return
    setProcessing(true)
    const paymentSplits: PaymentSplit[] = pos.paymentMethod === 'split'
      ? Object.entries(splits).filter(([, v]) => parseFloat(v) > 0)
          .map(([method, amount]) => ({ method: method as PaymentSplit['method'], amount: parseFloat(amount) }))
      : []
    const res = await fetch('/api/pos/sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: activeBranch.id, cashier_id: profile.id,
        customer_id: pos.customer?.id ?? null,
        subtotal, discount: discountAmt, tax: taxAmt, total,
        payment_method: pos.paymentMethod,
        payment_splits: paymentSplits.length > 0 ? paymentSplits : undefined,
        gift_card_id: pos.giftCardId, gift_card_amount: pos.giftCardAmount || undefined,
        items: pos.cart.map(item => ({
          product_id: item.product.id, variant_id: item.variant?.id ?? null,
          name: item.product.name, quantity: item.quantity, unit_price: item.unitPrice,
          discount: item.discount, total: (item.unitPrice - item.discount) * item.quantity,
          is_service: item.product.is_service,
        })),
      }),
    })
    if (res.ok) {
      const saleJson = await res.json()
      setSuccess(true)
      // Auto-print receipt
      try {
        const saleId = saleJson.data?.sale_id ?? 'unknown'
        const blob = await pdf(
          <SaleReceiptPdf
            saleId={saleId}
            date={formatDateTime(new Date().toISOString())}
            customerName={pos.customer ? `${pos.customer.first_name} ${pos.customer.last_name ?? ''}`.trim() : 'Walk-In Customer'}
            cashierName={profile?.full_name ?? '—'}
            paymentMethod={pos.paymentMethod}
            paymentStatus="paid"
            items={pos.cart.map(item => ({
              name: item.product.name, quantity: item.quantity,
              unit_price: item.unitPrice, discount: item.discount,
              total: (item.unitPrice - item.discount) * item.quantity,
            }))}
            subtotal={subtotal}
            discount={discountAmt}
            tax={taxAmt}
            total={total}
            paymentSplits={pos.paymentMethod === 'split' ? paymentSplits.map(s => ({ method: s.method, amount: s.amount })) : undefined}
          />
        ).toBlob()
        const url = URL.createObjectURL(blob)
        const printWindow = window.open(url)
        if (printWindow) {
          printWindow.addEventListener('load', () => { printWindow.print() })
        }
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      } catch { /* receipt print is best-effort */ }
      pos.clearCart(); setCashTendered('')
      setTimeout(() => { setSuccess(false); setPaymentOpen(false) }, 2500)
    }
    setProcessing(false)
  }

  async function processCashPayment() {
    if (!activeBranch || !profile || pos.cart.length === 0) return
    setProcessing(true)
    const cartSnapshot = pos.cart.map(item => ({
      product_id: item.product.id, variant_id: item.variant?.id ?? null,
      name: item.product.name, quantity: item.quantity, unit_price: item.unitPrice,
      discount: item.discount, total: (item.unitPrice - item.discount) * item.quantity,
      is_service: item.product.is_service,
    }))
    const customerName = pos.customer ? `${pos.customer.first_name} ${pos.customer.last_name ?? ''}`.trim() : 'Walk-In Customer'
    const res = await fetch('/api/pos/sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: activeBranch.id, cashier_id: profile.id,
        customer_id: pos.customer?.id ?? null,
        subtotal, discount: discountAmt, tax: taxAmt, total,
        payment_method: 'cash',
        items: cartSnapshot,
      }),
    })
    if (res.ok) {
      const saleJson = await res.json()
      setSuccess(true)
      // Auto-print receipt
      try {
        const saleId = saleJson.data?.sale_id ?? 'unknown'
        const blob = await pdf(
          <SaleReceiptPdf
            saleId={saleId}
            date={formatDateTime(new Date().toISOString())}
            customerName={customerName}
            cashierName={profile?.full_name ?? '—'}
            paymentMethod="cash"
            paymentStatus="paid"
            items={cartSnapshot.map(item => ({
              name: item.name, quantity: item.quantity,
              unit_price: item.unit_price, discount: item.discount, total: item.total,
            }))}
            subtotal={subtotal}
            discount={discountAmt}
            tax={taxAmt}
            total={total}
          />
        ).toBlob()
        const url = URL.createObjectURL(blob)
        const printWindow = window.open(url)
        if (printWindow) {
          printWindow.addEventListener('load', () => { printWindow.print() })
        }
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      } catch { /* receipt print is best-effort */ }
      pos.clearCart(); setCashTendered('')
      setTimeout(() => { setSuccess(false) }, 2500)
    }
    setProcessing(false)
  }

  // ── Breadcrumb ────────────────────────────────────────────────────────────────

  const LEVEL_LABELS: Partial<Record<RepairLevel, string>> = {
    categories: 'Category', brands: 'Brand', devices: 'Devices',
    problems: 'Problems', details: 'Details',
  }

  function RepairBreadcrumb() {
    const all: RepairLevel[] = ['categories', 'brands', 'devices', 'problems', 'details']
    const currentIdx = all.indexOf(repairLevel)

    const crumbs: { label: string; level: RepairLevel; clickable: boolean }[] = []
    if (repairCategory)  crumbs.push({ label: repairCategory.name,  level: 'categories', clickable: true })
    if (repairBrand)       crumbs.push({ label: repairBrand.name,       level: 'brands',      clickable: true })
    if (repairDevice)      crumbs.push({ label: repairDevice.name,      level: 'devices',     clickable: true })

    return (
      <div className="flex items-center gap-1 flex-wrap text-xs">
        {all.map((lvl, i) => {
          const crumb = crumbs.find(c => c.level === (i === 0 ? 'categories' : i === 1 ? 'brands' : i === 2 ? 'devices' : 'x'))
          const label = i === 0 ? (repairCategory?.name ?? 'Category')
            : i === 1 ? (repairBrand?.name ?? 'Brand')
            : i === 2 ? (repairDevice?.name ?? 'Devices')
            : LEVEL_LABELS[lvl]!

          const isCurrent = i === currentIdx
          const isPast = i < currentIdx

          return (
            <span key={lvl} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />}
              <button
                onClick={() => {
                  if (!isPast) return
                  if (lvl === 'categories') resetRepairs()
                  else if (lvl === 'brands') { setRepairLevel('brands'); loadLevel('brands') }
                  else if (lvl === 'devices' && repairBrand) { setRepairLevel('devices'); loadLevel('devices', repairBrand.id) }
                  else if (lvl === 'problems' && repairDevice) { setRepairLevel('problems'); loadLevel('problems', repairDevice.id) }
                }}
                className={`whitespace-nowrap ${isCurrent ? 'font-bold text-brand-teal' : isPast ? 'text-blue-500 hover:underline cursor-pointer' : 'text-gray-300 cursor-default'}`}
              >
                {label}
              </button>
            </span>
          )
        })}
      </div>
    )
  }

  // ── Filtered repair items by search ──────────────────────────────────────────

  const filteredRepairItems = repairItems.filter(item =>
    !repairSearch || item.name.toLowerCase().includes(repairSearch.toLowerCase())
  )
  // ── Register gate ─────────────────────────────────────────────────────────────

  if (!sessionLoading && !session) {
    const openingTotal = denomTotal(openingDenoms)

    // ── Case A: a shift is already open — prompt to join ───────────────────────
    if (existingSession) {
      return (
        <div className="-m-6 flex h-[calc(100vh-3.5rem)] items-center justify-center bg-gray-50">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm w-full max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <Unlock className="h-7 w-7 text-blue-600" />
            </div>
            <h2 className="mb-1 text-lg font-bold text-gray-900">Shift Already Active</h2>
            <p className="mb-6 text-sm text-gray-500">
              {activeBranch?.name} · A shift is already open for this register
            </p>
            <div className="mb-6 rounded-lg bg-gray-50 px-4 py-3 text-left space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Opened by</span>
                <span className="font-medium">{(existingSession as any).profiles?.full_name ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Opening float</span>
                <span className="font-medium">{formatCurrency(existingSession.opening_float)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Opened at</span>
                <span className="font-medium">{new Date(existingSession.opened_at).toLocaleTimeString()}</span>
              </div>
            </div>
            <Button
              className="w-full bg-brand-teal hover:bg-brand-teal-dark"
              size="lg"
              loading={sessionProcessing}
              onClick={handleJoinShift}
            >
              <Unlock className="h-4 w-4" /> Join Active Shift
            </Button>
          </div>

          {/* Join Shift modal (triggered from handleOpenRegister fallback) */}
          <Modal open={joinShiftOpen} onClose={() => setJoinShiftOpen(false)} title="Join Active Shift" size="sm">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Join the currently open shift to start processing sales.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setJoinShiftOpen(false)}>Cancel</Button>
                <Button loading={sessionProcessing} onClick={handleJoinShift}>Join Shift</Button>
              </div>
            </div>
          </Modal>
        </div>
      )
    }

    // ── Case B: no shift open — count drawer and start ─────────────────────────
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center bg-gray-50">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm w-full max-w-xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal-light shrink-0">
              <Lock className="h-6 w-6 text-brand-teal" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Start Shift</h2>
              <p className="text-sm text-gray-500">{activeBranch?.name} · Count your cash drawer to begin</p>
            </div>
          </div>

          {/* Previous closing balance */}
          {prevClosingBalance !== null && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
              <span className="text-gray-500">Previous shift closing balance</span>
              <span className="font-semibold text-gray-900">{formatCurrency(prevClosingBalance)}</span>
            </div>
          )}

          {/* Denomination grid */}
          <div className="mb-3">
            <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Count Denominations</p>
            <div className="grid grid-cols-4 gap-2">
              {DENOMINATIONS.map(d => (
                <div key={d.value} className="flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1.5">
                  <span className="w-9 shrink-0 text-xs font-medium text-gray-600">{d.label}</span>
                  <input
                    type="number" min="0" step="1" placeholder="0"
                    value={openingDenoms[String(d.value)] ?? ''}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 0
                      setOpeningDenoms(prev => ({ ...prev, [String(d.value)]: v }))
                    }}
                    className="h-7 min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-1.5 text-right text-sm focus:border-brand-teal focus:outline-none focus:bg-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Computed total */}
          <div className={`mb-3 flex items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold ${
            prevClosingBalance !== null && Math.abs(openingTotal - prevClosingBalance) > 0.01
              ? 'bg-amber-50 border border-amber-200 text-amber-800'
              : 'bg-brand-teal-light border border-brand-teal-light text-brand-teal-dark'
          }`}>
            <span>Verified Total</span>
            <span className="text-base">{formatCurrency(openingTotal)}</span>
          </div>

          {/* Discrepancy note */}
          {prevClosingBalance !== null && Math.abs(openingTotal - prevClosingBalance) > 0.01 && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-amber-700">
                Discrepancy Note <span className="text-red-500">*</span>
                <span className="ml-1 text-amber-600">(difference: {formatCurrency(openingTotal - prevClosingBalance)})</span>
              </label>
              <textarea
                rows={2}
                placeholder="Explain the discrepancy (e.g. '$50 missing from previous shift')"
                value={openingNote}
                onChange={e => setOpeningNote(e.target.value)}
                className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-brand-teal hover:bg-brand-teal-dark"
              size="lg"
              loading={sessionProcessing}
              onClick={handleOpenRegister}
            >
              <Unlock className="h-4 w-4" /> Start Shift
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main layout ───────────────────────────────────────────────────────────────

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-gray-100">

      {session && (
        <div className="flex shrink-0 items-center justify-between border-b border-green-200 bg-green-50 px-5 py-2">
          <div className="flex items-center gap-2.5 text-sm font-medium text-green-700">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            Register Open · Float {formatCurrency(session.opening_float)}
          </div>
          <button onClick={() => setCloseRegisterModal(true)} className="text-sm font-semibold text-red-500 hover:text-red-700">Close Register</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Customer + Cart ── */}
        <div className={`flex-col border-r border-gray-200 bg-white overflow-hidden lg:flex lg:w-[380px] lg:shrink-0 ${mobileView === 'cart' ? 'flex w-full' : 'hidden'}`}>

          {/* Re-open ticket scan */}
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <button onClick={() => router.push('/repairs')} className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 whitespace-nowrap">
              Re-open in POS
            </button>
            
          </div>

          {/* Customer */}
          <div className="border-b border-gray-100 px-3 py-2" ref={customerRef}>
            {pos.customer ? (
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-white">
                      {pos.customer.first_name?.[0]?.toUpperCase()}{pos.customer.last_name?.[0]?.toUpperCase() ?? ''}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-gray-900 text-base">{pos.customer.first_name} {pos.customer.last_name ?? ''}</p>
                      {outstandingBalance > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                          <AlertTriangle className="h-3 w-3" /> Outstanding {formatCurrency(outstandingBalance)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 ml-2">
                    <button onClick={() => router.push(`/customers/${pos.customer!.id}`)} className="rounded p-1 text-gray-400 hover:text-brand-teal">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => pos.setCustomer(null)} className="rounded p-1 text-gray-400 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                  {pos.customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{pos.customer.phone}</span>}
                  {pos.customer.email && <span className="flex items-center gap-1 min-w-0"><Mail className="h-3 w-3" /><span className="truncate">{pos.customer.email}</span></span>}
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs">
                  <button onClick={() => router.push(`/customers/${pos.customer!.id}`)} className="text-blue-500 hover:underline">View More</button>
                  <button onClick={() => router.push(`/invoices?customer_id=${pos.customer!.id}`)} className="flex items-center gap-0.5 text-blue-500 hover:underline">
                    Purchase History <ExternalLink className="h-3 w-3" />
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
                      className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-2 text-sm focus:border-brand-teal focus:bg-white focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => { setNewCustomerForm(f => ({ ...f, first_name: customerSearch })); setNewCustomerOpen(true) }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal text-white hover:bg-brand-teal-dark"
                    title="Add new customer"
                  >
                    <Plus className="h-4 w-4" />
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
                          <p className="truncate text-xs font-medium text-gray-900">{c.first_name} {c.last_name ?? ''}</p>
                          {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
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
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Enter item name, SKU or scan barcode"
                className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-2 text-sm focus:border-brand-teal focus:bg-white focus:outline-none"
                onKeyDown={async e => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim()
                    if (!val) return
                    const res = await fetch(`/api/products?search=${encodeURIComponent(val)}&limit=1`)
                    const j = await res.json()
                    const found = j.data?.[0]
                    if (found) {
                      if (found.has_variants || (found.variant_count ?? 0) > 0) {
                        openVariantSelect(found)
                      } else {
                        pos.addToCart(found)
                      }
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Cart table */}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {pos.cart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">No items added yet</div>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-[80px] px-2 py-2 text-left font-semibold text-gray-600">QTY</th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-600">Item Name</th>
                    <th className="w-[70px] px-1 py-2 text-right font-semibold text-gray-600">Price</th>
                    <th className="w-[52px] px-1 py-2 text-right font-semibold text-gray-600">Disc</th>
                    <th className="w-[72px] px-1 py-2 text-right font-semibold text-gray-600">Total</th>
                    <th className="w-[28px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pos.cart.map(item => {
                    const lineTotal = (item.unitPrice - item.discount) * item.quantity
                    return (
                      <tr key={`${item.product.id}-${item.variant?.id}`} className="hover:bg-gray-50/50">
                        <td className="px-1 py-2">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => pos.updateQuantity(item.product.id, item.variant?.id ?? null, item.quantity - 1)} className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition-colors">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center font-bold text-gray-900">{item.quantity}</span>
                            <button onClick={() => pos.updateQuantity(item.product.id, item.variant?.id ?? null, item.quantity + 1)} className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition-colors">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2 overflow-hidden">
                          <p className="truncate font-medium text-gray-900">{item.product.name}</p>
                          {item.product.sku && <p className="text-gray-400 text-[11px] truncate">#{item.product.sku}</p>}
                        </td>
                        <td className="px-1 py-2 text-right font-medium text-gray-700 text-[13px]">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-1 py-1.5">
                          <input
                            type="number" min="0" step="0.01" placeholder="0"
                            value={item.discount || ''}
                            onChange={e => pos.setItemDiscount(item.product.id, item.variant?.id ?? null, Math.min(parseFloat(e.target.value) || 0, item.unitPrice))}
                            className="h-6 w-full rounded border border-gray-200 px-1 text-right text-[13px] text-green-600 focus:border-brand-teal focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-2 text-right font-bold text-gray-900 text-[13px]">{formatCurrency(lineTotal)}</td>
                        <td className="pr-1 py-2">
                          <button onClick={() => pos.removeFromCart(item.product.id, item.variant?.id ?? null)} className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Totals */}
          <div className="shrink-0 border-t-2 border-gray-200 bg-gray-50 px-3 py-2 space-y-1">
            <div className="flex justify-between text-xs text-gray-500"><span>Total Items</span><span className="font-semibold text-gray-700">{pos.itemCount()}</span></div>
            <div className="flex justify-between text-sm text-gray-500"><span>Sub Total</span><span className="font-bold text-gray-800">{formatCurrency(grossSubtotal)}</span></div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Discount</span>
                <div className="flex overflow-hidden rounded border border-gray-200">
                  <button onClick={() => setDiscountType('fixed')} className={`px-1.5 py-0.5 text-xs font-medium ${discountType === 'fixed' ? 'bg-brand-teal text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>£</button>
                  <button onClick={() => setDiscountType('percent')} className={`px-1.5 py-0.5 text-xs font-medium ${discountType === 'percent' ? 'bg-brand-teal text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>%</button>
                </div>
              </div>
              <input
                type="number" min="0" step="0.01" placeholder="0"
                value={pos.discount || ''}
                onChange={e => pos.setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-7 w-20 rounded border border-gray-200 px-1.5 text-right text-sm text-green-700 focus:border-brand-teal focus:outline-none"
              />
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-xs text-green-600"><span>Discount</span><span>-{formatCurrency(totalDiscount)}</span></div>
            )}
            {pos.taxRate > 0 && (
              <div className="flex justify-between text-xs text-gray-500"><span>Tax ({pos.taxRate}%)</span><span>{formatCurrency(taxAmt)}</span></div>
            )}
            <div className="flex justify-between border-t-2 border-gray-300 pt-1.5">
              <span className="text-base font-bold text-gray-900">Total</span>
              <span className="text-xl font-bold text-gray-900">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* ── Payment buttons (in cart panel) ── */}
          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2.5">
            <div className="flex gap-2">
              <button
                onClick={() => { pos.setPaymentMethod('split'); setSplits({ cash: '', card: '' }); pos.cart.length > 0 && setPaymentOpen(true) }}
                disabled={pos.cart.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-[#1a3c40] bg-[#1a3c40] py-2.5 text-xs font-bold text-white hover:bg-[#15332e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <SplitSquareHorizontal className="h-3.5 w-3.5" /><span className="hidden sm:inline">Multiple </span>Pay
              </button>
              <button
                onClick={() => { setGcCode(''); setGcError(''); pos.cart.length > 0 && setGcModalOpen(true) }}
                disabled={pos.cart.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-purple-600 py-2.5 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Gift className="h-3.5 w-3.5" /> Gift Card
              </button>
              <button
                onClick={processCashPayment}
                disabled={pos.cart.length === 0 || processing}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Banknote className="h-3.5 w-3.5" /> Cash
              </button>
              <button
                onClick={pos.clearCart}
                disabled={pos.cart.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Tabbed browser ── */}
        <div className={`flex-1 flex-col overflow-hidden ${mobileView === 'browse' ? 'flex' : 'hidden lg:flex'}`}>

          {/* Tab bar */}
          <div className="flex shrink-0 bg-[#1a3c40]">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-2 border-b-3 px-4 py-2.5 lg:py-4 text-sm lg:text-base font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.key ? 'border-white text-white bg-white/10' : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">

            {/* ── REPAIRS TAB ── */}
            {activeTab === 'repairs' && (
              <div className="flex h-full flex-col">
                {/* Breadcrumb + top controls */}
                <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
                  <RepairBreadcrumb />
                  {/* Level-specific top-right controls */}
                  {repairLevel === 'problems' && (
                    <button
                      onClick={goToDetailsStep}
                      disabled={selectedProblems.length === 0}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-teal-dark disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Next <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {repairLevel === 'details' && (
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="relative">
                        <button
                          onClick={() => setRepairDetailsMenuOpen(o => !o)}
                          className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {repairDetailsMenuOpen && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg">
                            <button
                              onClick={() => { setRepairDetailsMenuOpen(false); router.push('/settings/services') }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <ClipboardList className="h-3.5 w-3.5" /> Manage Custom Fields
                            </button>
                          </div>
                        )}
                      </div>
                      <Button
                        className="bg-brand-teal hover:bg-brand-teal-dark text-sm px-4 py-1.5 h-8"
                        loading={confirmingRepair}
                        onClick={confirmRepair}
                      >
                        Confirm
                      </Button>
                    </div>
                  )}
                </div>

                {/* Scrollable content area */}
                <div className="flex-1 overflow-y-auto p-4">

                  {/* CATEGORIES / BRANDS / DEVICES */}
                  {(repairLevel === 'categories' || repairLevel === 'brands' || repairLevel === 'devices') && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder={`Search ${repairLevel === 'categories' ? 'category' : repairLevel === 'brands' ? 'brand' : 'device'}...`}
                          value={repairSearch} onChange={e => setRepairSearch(e.target.value)}
                          className="h-9 w-full max-w-xs rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm focus:border-brand-teal focus:outline-none"
                        />
                      </div>
                      {repairLoading ? (
                        <div className="grid grid-cols-4 gap-3">
                          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />)}
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                          {/* Add new */}
                          <button
                            onClick={() => router.push('/settings/services')}
                            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-teal-light bg-brand-teal p-4 text-white hover:bg-brand-teal-dark transition-colors min-h-[90px]"
                          >
                            <Plus className="h-6 w-6" />
                            <span className="text-xs font-medium">
                              Add {repairLevel === 'categories' ? 'Category' : repairLevel === 'brands' ? 'Brand' : 'Devices'}
                            </span>
                          </button>
                          {filteredRepairItems.map((item: any) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                if (repairLevel === 'categories') selectCategory(item)
                                else if (repairLevel === 'brands') selectBrand(item)
                                else selectDevice(item)
                              }}
                              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center hover:border-brand-teal hover:shadow-sm transition-all min-h-[90px]"
                            >
                              {(item.image_url ?? item.logo_url) ? (
                                <img src={item.image_url ?? item.logo_url} alt={item.name} className="h-10 w-10 object-contain" />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                                  {repairLevel === 'categories' && <Wrench className="h-5 w-5 text-gray-400" />}
                                  {repairLevel === 'brands' && <Tag className="h-5 w-5 text-gray-400" />}
                                  {repairLevel === 'devices' && <ShoppingBag className="h-5 w-5 text-gray-400" />}
                                </div>
                              )}
                              <span className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{item.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PROBLEMS step */}
                  {repairLevel === 'problems' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text" placeholder="Search device problem"
                            value={repairSearch} onChange={e => setRepairSearch(e.target.value)}
                            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm focus:border-brand-teal focus:outline-none"
                          />
                        </div>
                      </div>
                      {repairLoading ? (
                        <div className="grid grid-cols-4 gap-3">
                          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                          {/* Add problem */}
                          <button
                            onClick={() => router.push('/settings/services')}
                            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-teal-light bg-brand-teal p-4 text-white hover:bg-brand-teal-dark transition-colors min-h-[100px]"
                          >
                            <Plus className="h-6 w-6" />
                            <span className="text-xs font-medium">Add Device Issue</span>
                          </button>
                          {filteredRepairItems.map((prob: ServiceProblem) => {
                            const isSelected = selectedProblems.some(p => p.id === prob.id)
                            return (
                              <button
                                key={prob.id}
                                onClick={() => toggleProblem(prob)}
                                className={`relative flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-3 text-center transition-all min-h-[100px] ${
                                  isSelected ? 'border-brand-teal bg-brand-teal-light' : 'border-gray-200 hover:border-brand-teal-light'
                                }`}
                              >
                                {/* Checkbox top-left */}
                                <div className={`absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded border ${isSelected ? 'border-brand-teal bg-brand-teal' : 'border-gray-300 bg-white'}`}>
                                  {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                                </div>
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 mt-2">
                                  <Wrench className="h-4 w-4 text-gray-400" />
                                </div>
                                <span className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{prob.name}</span>
                                <span className="text-xs font-semibold text-brand-teal">{formatCurrency(prob.price)}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {selectedProblems.length > 0 && (
                        <div className="rounded-lg bg-brand-teal-light border border-brand-teal-light px-3 py-2 text-xs text-brand-teal">
                          {selectedProblems.length} service(s) selected · Total: <strong>{formatCurrency(selectedProblems.reduce((s, p) => s + p.price, 0))}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* DETAILS step */}
                  {repairLevel === 'details' && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                      {/* Left column */}
                      <div className="space-y-4">
                        {/* Checklist buttons */}
                        <div className="flex flex-wrap gap-2">
                          <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                            <ClipboardList className="h-3.5 w-3.5" /> Pre-Repair Checklist
                          </button>
                          <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                            <Camera className="h-3.5 w-3.5" /> Pre-Repair Condition Images
                          </button>
                        </div>

                        {/* IMEI / Serial */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <select
                              value={repairDetails.imei_type}
                              onChange={e => setRepairDetails(d => ({ ...d, imei_type: e.target.value as 'Serial' | 'IMEI' }))}
                              className="h-8 rounded border border-gray-200 bg-white px-2 text-xs focus:border-brand-teal focus:outline-none"
                            >
                              <option>Serial</option>
                              <option>IMEI</option>
                            </select>
                            <input
                              type="text"
                              placeholder={`Enter ${repairDetails.imei_type} number`}
                              value={repairDetails.serial_number}
                              onChange={e => setRepairDetails(d => ({ ...d, serial_number: e.target.value }))}
                              className="h-8 flex-1 rounded border border-gray-200 bg-white px-3 text-sm focus:border-brand-teal focus:outline-none"
                            />
                          </div>

                          {/* Passcode / Pattern Lock */}
                          <div>
                            <div className="flex overflow-hidden rounded-lg border border-gray-200 mb-2">
                              <button
                                onClick={() => setRepairDetails(d => ({ ...d, lock_type: 'passcode' }))}
                                className={`flex-1 py-1.5 text-xs font-medium ${repairDetails.lock_type === 'passcode' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                              >Passcode</button>
                              <button
                                onClick={() => setRepairDetails(d => ({ ...d, lock_type: 'pattern' }))}
                                className={`flex-1 py-1.5 text-xs font-medium border-l border-gray-200 ${repairDetails.lock_type === 'pattern' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                              >Pattern Lock</button>
                            </div>
                            <input
                              type={repairDetails.lock_type === 'passcode' ? 'text' : 'text'}
                              placeholder={repairDetails.lock_type === 'passcode' ? 'Enter passcode' : 'Draw pattern (describe)'}
                              value={repairDetails.passcode}
                              onChange={e => setRepairDetails(d => ({ ...d, passcode: e.target.value }))}
                              className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Warranty per problem */}
                        {selectedProblems.length > 0 && (
                          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-700">Warranty Applicable</p>
                            {selectedProblems.map(prob => (
                              <div key={prob.id}>
                                <p className="text-xs font-medium text-brand-teal mb-1">{prob.name}</p>
                                <select
                                  value={repairDetails.problem_warranties[prob.id] ?? 'No Warranty'}
                                  onChange={e => setRepairDetails(d => ({
                                    ...d, problem_warranties: { ...d.problem_warranties, [prob.id]: e.target.value }
                                  }))}
                                  className="h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs focus:border-brand-teal focus:outline-none"
                                >
                                  {WARRANTY_OPTIONS.map(w => <option key={w}>{w}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Assigned to + Due date */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Assigned to</label>
                            <select
                              value={repairDetails.assigned_to}
                              onChange={e => setRepairDetails(d => ({ ...d, assigned_to: e.target.value }))}
                              className="h-8 w-full rounded border border-gray-200 bg-white px-2 text-sm focus:border-brand-teal focus:outline-none"
                            >
                              <option value="">Unassigned</option>
                              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Task Due Date &amp; Time</label>
                            <input
                              type="datetime-local"
                              value={repairDetails.due_date}
                              onChange={e => setRepairDetails(d => ({ ...d, due_date: e.target.value }))}
                              className="h-8 w-full rounded border border-gray-200 bg-white px-2 text-sm focus:border-brand-teal focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right column */}
                      <div className="space-y-4">
                        {/* Repair charges */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">Repair Charges</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={repairDetails.repair_charges}
                              onChange={e => setRepairDetails(d => ({ ...d, repair_charges: parseFloat(e.target.value) || 0 }))}
                              className="h-8 w-24 rounded border border-gray-200 px-2 text-right text-sm font-semibold focus:border-brand-teal focus:outline-none"
                            />
                          </div>

                          {/* Charge deposit */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox" id="charge_deposit"
                              checked={repairDetails.charge_deposit}
                              onChange={e => {
                                const checked = e.target.checked
                                setRepairDetails(d => ({
                                  ...d, charge_deposit: checked,
                                  deposit_amount: checked ? Math.round(d.repair_charges * 0.2 * 100) / 100 : 0
                                }))
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-brand-teal"
                            />
                            <label htmlFor="charge_deposit" className="text-xs font-medium text-gray-700">Charge Deposit</label>
                          </div>
                          {repairDetails.charge_deposit && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Deposit</span>
                                <input
                                  type="number" min="0" step="0.01"
                                  value={repairDetails.deposit_amount}
                                  onChange={e => setRepairDetails(d => ({ ...d, deposit_amount: parseFloat(e.target.value) || 0 }))}
                                  className="h-7 w-24 rounded border border-gray-200 px-2 text-right text-sm focus:border-brand-teal focus:outline-none"
                                />
                              </div>
                              <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">20% of Repair Charges</p>
                            </div>
                          )}

                          {/* Rush job */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox" id="rush_job"
                              checked={repairDetails.is_rush}
                              onChange={e => setRepairDetails(d => ({ ...d, is_rush: e.target.checked }))}
                              className="h-4 w-4 rounded border-gray-300 text-brand-teal"
                            />
                            <label htmlFor="rush_job" className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                              Mark as Rush Job
                              <span className="rounded bg-brand-teal-light px-1.5 py-0.5 text-xs font-semibold text-brand-teal">New</span>
                            </label>
                          </div>
                        </div>

                        {/* Status + location + type + network */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Repair Task Status</label>
                            <select
                              value={repairDetails.status}
                              onChange={e => setRepairDetails(d => ({ ...d, status: e.target.value }))}
                              className="h-8 w-full rounded border border-gray-200 bg-blue-600 px-2 text-xs text-white focus:outline-none"
                            >
                              {REPAIR_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Device Physical Location</label>
                            <input
                              type="text" placeholder="Select Physical Location"
                              value={repairDetails.physical_location}
                              onChange={e => setRepairDetails(d => ({ ...d, physical_location: e.target.value }))}
                              className="h-8 w-full rounded border border-gray-200 px-2 text-sm focus:border-brand-teal focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Repair Task Type</label>
                            <select
                              value={repairDetails.task_type}
                              onChange={e => setRepairDetails(d => ({ ...d, task_type: e.target.value }))}
                              className="h-8 w-full rounded border border-gray-200 bg-white px-2 text-sm focus:border-brand-teal focus:outline-none"
                            >
                              {TASK_TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Device Network</label>
                            <input
                              type="text" placeholder="Select Network"
                              className="h-8 w-full rounded border border-gray-200 px-2 text-sm focus:border-brand-teal focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Custom Fields */}
                        {repairCustomFieldDefs.length > 0 && (
                          <div className="rounded-xl border border-brand-teal-light bg-brand-teal-light p-4 space-y-3">
                            <p className="text-xs font-semibold text-brand-teal-dark">Additional Fields</p>
                            <CustomFieldRenderer
                              values={repairCustomFields}
                              definitions={repairCustomFieldDefs}
                              onSave={async (v) => setRepairCustomFields(v)}
                              showSave={false}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PRODUCTS TAB ── */}
            {activeTab === 'products' && (
              <div className="flex h-full flex-col">
                {/* Toggle bar */}
                <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
                  <div className="flex overflow-hidden rounded-lg border border-gray-200">
                    <button
                      onClick={() => { setProductsView('by_products'); if (catBreadcrumb.length === 0) loadCatLevel('device_types') }}
                      className={`px-5 py-1.5 text-xs font-medium transition-colors ${productsView === 'by_products' ? 'bg-white text-brand-teal font-semibold border-b-2 border-brand-teal' : 'text-gray-500 hover:bg-gray-50'}`}
                    >By Products</button>
                    <button
                      onClick={() => { setProductsView('by_parts'); if (partBreadcrumb.length === 0) loadPartLevel('device_types') }}
                      className={`px-5 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${productsView === 'by_parts' ? 'bg-white text-brand-teal font-semibold border-b-2 border-brand-teal' : 'text-gray-500 hover:bg-gray-50'}`}
                    >By Part Items</button>
                    <button
                      onClick={() => setProductsView('custom_item')}
                      className={`px-5 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${productsView === 'custom_item' ? 'bg-white text-brand-teal font-semibold border-b-2 border-brand-teal' : 'text-gray-500 hover:bg-gray-50'}`}
                    >Custom Item</button>
                  </div>
                  <button
                    onClick={openAdvSearch}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span className="rounded bg-gray-100 px-1 text-[10px] font-mono text-gray-500">Ctrl S</span>
                    Advance Search
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">

                  {/* BY PRODUCTS VIEW — Device Type → Brand → Model → Products */}
                  {productsView === 'by_products' && (
                    <>
                      {/* Breadcrumb */}
                      {catBreadcrumb.length > 0 && (
                        <div className="flex items-center gap-1 text-xs flex-wrap">
                          <button onClick={resetCatBrowse} className="text-blue-500 hover:underline">Device Types</button>
                          {catBreadcrumb.map((crumb, i) => (
                            <span key={crumb.id} className="flex items-center gap-1">
                              <ChevronRight className="h-3 w-3 text-gray-400" />
                              {i === catBreadcrumb.length - 1
                                ? <span className="font-semibold text-gray-800">{crumb.name}</span>
                                : <button onClick={() => navigateCatBreadcrumb(i)} className="text-blue-500 hover:underline">{crumb.name}</button>
                              }
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Hierarchy tiles (device types / brands / models) */}
                      {catLevel !== 'products' && (
                        catItemsLoading ? (
                          <div className="grid grid-cols-4 gap-3">
                            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />)}
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                            {catItems.map(item => (
                              <button
                                key={item.id}
                                onClick={() => selectCatItem(item)}
                                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white p-4 text-center hover:border-brand-teal hover:shadow-sm transition-all min-h-[70px]"
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                                  {catLevel === 'device_types' && <Layers className="h-4 w-4 text-gray-400" />}
                                  {catLevel === 'brands' && <Tag className="h-4 w-4 text-blue-400" />}
                                  {catLevel === 'models' && <Phone className="h-4 w-4 text-purple-400" />}
                                </div>
                                <span className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{item.name}</span>
                              </button>
                            ))}
                            {catItems.length === 0 && !catItemsLoading && (
                              <p className="col-span-5 py-8 text-center text-sm text-gray-400">
                                {catLevel === 'device_types' ? 'No device types found' : catLevel === 'brands' ? 'No brands found' : 'No models found'}
                              </p>
                            )}
                          </div>
                        )
                      )}

                      {/* Products for selected model */}
                      {catLevel === 'products' && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-gray-700">{catBreadcrumb[catBreadcrumb.length - 1]?.name}</h4>
                          {categoryProductsLoading ? (
                            <div className="grid grid-cols-4 gap-3">
                              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}
                            </div>
                          ) : categoryProducts.length > 0 ? (
                            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                              {categoryProducts.map(product => {
                                const hasVariants = (product.has_variants || (product.variant_count ?? 0) > 0)
                                return (
                                  <button
                                    key={product.id}
                                    onClick={() => hasVariants ? openVariantSelect(product) : pos.addToCart(product)}
                                    className="relative flex flex-col items-start rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-brand-teal hover:shadow-sm transition-all"
                                  >
                                    {product.image_url ? (
                                      <img src={product.image_url} alt={product.name} className="mb-2 h-12 w-full object-contain" />
                                    ) : (
                                      <div className="mb-2 flex h-12 w-full items-center justify-center rounded bg-gray-100">
                                        <ShoppingBag className="h-5 w-5 text-gray-300" />
                                      </div>
                                    )}
                                    <span className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight">{product.name}</span>
                                    <span className="mt-1 text-sm font-bold text-brand-teal">{formatCurrency(product.selling_price)}</span>
                                    {product.on_hand !== undefined && !product.is_service && (
                                      <span className={`mt-0.5 text-xs ${(product.on_hand ?? 0) > 0 ? 'text-gray-400' : 'text-red-500 font-medium'}`}>
                                        On Hand: {product.on_hand ?? 0}
                                      </span>
                                    )}
                                    {hasVariants && <span className="mt-0.5 text-xs text-indigo-500 font-medium">Select Variant</span>}
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="py-4 text-center text-sm text-gray-400">No products for this model</p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* BY PART ITEMS VIEW — Device Type → Brand → Model → Part Types */}
                  {productsView === 'by_parts' && (
                    <>
                      {/* Breadcrumb */}
                      {partBreadcrumb.length > 0 && (
                        <div className="flex items-center gap-1 text-xs flex-wrap">
                          <button onClick={resetPartBrowse} className="text-blue-500 hover:underline">Device Types</button>
                          {partBreadcrumb.map((crumb, i) => (
                            <span key={crumb.id} className="flex items-center gap-1">
                              <ChevronRight className="h-3 w-3 text-gray-400" />
                              {i === partBreadcrumb.length - 1
                                ? <span className="font-semibold text-gray-800">{crumb.name}</span>
                                : <button onClick={() => navigatePartBreadcrumb(i)} className="text-blue-500 hover:underline">{crumb.name}</button>
                              }
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Hierarchy tiles */}
                      {partItemsLoading ? (
                        <div className="grid grid-cols-4 gap-3">
                          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />)}
                        </div>
                      ) : partLevel === 'parts' ? (
                        /* Part products grid */
                        <>
                          {partProductsLoading ? (
                            <div className="grid grid-cols-4 gap-3">
                              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-200" />)}
                            </div>
                          ) : partProducts.length > 0 ? (
                            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                              {partProducts.map(product => {
                                const hasVariants = (product.has_variants || (product as any).variant_count > 0)
                                return (
                                  <button
                                    key={product.id}
                                    onClick={() => hasVariants ? openVariantSelect(product) : pos.addToCart(product)}
                                    className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-3 text-center hover:border-brand-teal hover:shadow-sm transition-all cursor-pointer"
                                  >
                                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100">
                                      <Package className="h-6 w-6 text-gray-300" />
                                    </div>
                                    <span className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{product.name}</span>
                                    <span className="text-xs font-bold text-brand-teal">{formatCurrency(Number(product.selling_price))}</span>
                                    {typeof product.on_hand === 'number' && (
                                      <span className="text-[10px] text-gray-400">On Hand: {product.on_hand}</span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="py-8 text-center text-sm text-gray-400">No parts found for this part type</p>
                          )}
                        </>
                      ) : (
                        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                          {partItems.map(item => (
                            <button
                              key={item.id}
                              onClick={() => selectPartItem(item)}
                              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white p-4 text-center transition-all min-h-[70px] hover:border-brand-teal hover:shadow-sm cursor-pointer"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                                {partLevel === 'device_types' && <Layers className="h-4 w-4 text-gray-400" />}
                                {partLevel === 'brands' && <Tag className="h-4 w-4 text-blue-400" />}
                                {partLevel === 'models' && <Phone className="h-4 w-4 text-purple-400" />}
                                {partLevel === 'part_types' && <Wrench className="h-4 w-4 text-purple-500" />}
                              </div>
                              <span className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{item.name}</span>
                            </button>
                          ))}
                          {partItems.length === 0 && !partItemsLoading && (
                            <p className="col-span-5 py-8 text-center text-sm text-gray-400">
                              {partLevel === 'device_types' ? 'No device types found' : partLevel === 'brands' ? 'No brands found' : partLevel === 'models' ? 'No models found' : 'No part types found'}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* CUSTOM ITEM VIEW */}
                  {productsView === 'custom_item' && (
                    <div className="max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
                      <h3 className="font-semibold text-gray-900">Add Custom Item</h3>
                      <Input label="Item Name" placeholder="Enter item description..." value={miscName} onChange={e => setMiscName(e.target.value)} />
                      <Input label="Price (£)" type="number" min="0" step="0.01" placeholder="0.00" value={miscPrice} onChange={e => setMiscPrice(e.target.value)} />
                      <Button className="w-full bg-brand-teal hover:bg-brand-teal-dark" disabled={!miscName.trim() || !miscPrice} onClick={addMiscItem}>
                        <Plus className="h-4 w-4" /> Add to Cart
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}



          </div>

        </div>
      </div>

      {/* ── Mobile bottom nav ── */}
      <div className="flex shrink-0 lg:hidden border-t border-gray-200 bg-white">
        <button
          onClick={() => setMobileView('browse')}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${mobileView === 'browse' ? 'text-brand-teal bg-brand-teal/5' : 'text-gray-400'}`}
        >
          <Wrench className="h-5 w-5" />
          Browse
        </button>
        <button
          onClick={() => setMobileView('cart')}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${mobileView === 'cart' ? 'text-brand-teal bg-brand-teal/5' : 'text-gray-400'}`}
        >
          <ShoppingBag className="h-5 w-5" />
          Cart
          {pos.cart.length > 0 && (
            <span className="absolute right-[calc(50%-18px)] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{pos.cart.length}</span>
          )}
        </button>
      </div>

      {/* ── MODALS ── */}

      {/* Advanced Search Modal */}
      {advSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAdvSearchOpen(false)}>
          <div className="flex w-[920px] max-h-[85vh] rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Left: Category filter */}
            <div className="w-60 shrink-0 border-r border-gray-100 flex flex-col">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold text-gray-700">Browse by Categories</p>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
                {allCats.map(cat => {
                  const checked = advSearchCatIds.has(cat.id)
                  return (
                    <label key={cat.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50">
                      <input
                        type="checkbox" checked={checked}
                        onChange={() => toggleAdvCat(cat.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-teal accent-[var(--brand-teal)]"
                      />
                      <span className="text-xs text-gray-700">{cat.name}</span>
                    </label>
                  )
                })}
                {allCats.length === 0 && <p className="py-4 text-center text-xs text-gray-400">No categories</p>}
              </div>
            </div>

            {/* Right: Search + results */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                <h3 className="font-bold text-gray-900">Advanced Search</h3>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500">Products</span>
                  <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500">Search Criteria</span>
                  <button onClick={() => setAdvSearchOpen(false)} className="ml-2 text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Search fields */}
              <div className="flex gap-3 border-b border-gray-100 px-5 py-3">
                <div className="flex-1">
                  <p className="mb-1 text-xs font-medium text-gray-600">Item Name</p>
                  <input
                    type="text" placeholder="Enter item name"
                    value={advSearchName}
                    onChange={e => setAdvSearchName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runAdvSearch()}
                    className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <p className="mb-1 text-xs font-medium text-gray-600">Item Identifier</p>
                  <input
                    type="text" placeholder="Item ID/SKU/UPC/IMEI/Serial"
                    value={advSearchSku}
                    onChange={e => setAdvSearchSku(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runAdvSearch()}
                    className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto px-5 py-3">
                <p className="mb-2 text-xs text-gray-500">Results ({advSearchResults.length})</p>
                {advSearching ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />)}
                  </div>
                ) : advSearchResults.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No results. Try searching above.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
                        <th className="pb-2 text-left">Item</th>
                        <th className="pb-2 text-left w-28">SKU/UPC</th>
                        <th className="pb-2 text-center w-20">Stock</th>
                        <th className="pb-2 text-right w-20">Price</th>
                        <th className="pb-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {advSearchResults.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              {p.image_url
                                ? <img src={p.image_url} alt={p.name} className="h-9 w-9 rounded object-contain border border-gray-100" />
                                : <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100"><ShoppingBag className="h-4 w-4 text-gray-300" /></div>
                              }
                              <div className="min-w-0">
                                <p className="line-clamp-1 text-xs font-medium text-gray-900">{p.name}</p>
                                {p.is_serialized && (
                                  <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">Serialized</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2 text-xs text-gray-500">{p.sku ?? '—'}</td>
                          <td className="py-2 text-center">
                            {p.on_hand !== undefined
                              ? <span className={`inline-flex h-6 w-8 items-center justify-center rounded-full text-xs font-medium ${(p.on_hand ?? 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{p.on_hand ?? 0}</span>
                              : <span className="text-xs text-gray-400">—</span>
                            }
                          </td>
                          <td className="py-2 text-right text-xs font-semibold text-brand-teal">{formatCurrency(p.selling_price)}</td>
                          <td className="py-2 pl-2">
                            <button
                              onClick={() => {
                                if ((p.has_variants || (p.variant_count ?? 0) > 0)) { openVariantSelect(p); setAdvSearchOpen(false) }
                                else { pos.addToCart(p); setAdvSearchOpen(false) }
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-brand-teal hover:text-brand-teal"
                              title="Add to cart"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                <button
                  onClick={() => { setAdvSearchName(''); setAdvSearchSku(''); setAdvSearchCatIds(new Set()); setAdvSearchResults([]) }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  <X className="h-3.5 w-3.5" /> Reset
                </button>
                <button
                  onClick={runAdvSearch}
                  disabled={advSearching}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
                >
                  <Search className="h-3.5 w-3.5" /> Search
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Select Variant Modal */}
      <Modal
        open={!!variantProduct}
        onClose={() => { setVariantProduct(null); setSelectedVariantId(null) }}
        title={variantProduct ? `Select Variant — ${variantProduct.name}` : 'Select Variant'}
      >
        <div className="space-y-3">
          {variantLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />)}
            </div>
          ) : variantList.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No variants found</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {variantList.map(v => {
                const selected = selectedVariantId === v.id
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariantId(v.id)}
                    className={`flex w-full items-center justify-between rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                      selected ? 'border-brand-teal bg-brand-teal-light' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{v.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(v.attributes ?? {}).map(([k, val]) => (
                          <span key={k} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{k}: {val}</span>
                        ))}
                      </div>
                      {v.sku && <p className="text-xs text-gray-400 mt-0.5">SKU: {v.sku}</p>}
                    </div>
                    <div className="shrink-0 ml-3 text-right">
                      <p className="font-bold text-brand-teal">{formatCurrency(v.selling_price)}</p>
                      {selected && <Check className="ml-auto h-4 w-4 text-brand-teal mt-1" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { setVariantProduct(null); setSelectedVariantId(null) }}>Cancel</Button>
            <Button
              className="bg-brand-teal hover:bg-brand-teal-dark"
              disabled={!selectedVariantId}
              onClick={addVariantToCart}
            >
              Add to Cart
            </Button>
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
                {/* Order total */}
                <div className="rounded-lg bg-gray-50 px-4 py-3 flex justify-between text-sm font-medium text-gray-700">
                  <span>Total Due</span>
                  <span className="font-bold text-gray-900">{formatCurrency(totalDue)}</span>
                </div>

                {/* Gift card code input */}
                {!pos.giftCardId ? (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gift Card Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter gift card code"
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
                      <button
                        onClick={() => { pos.clearGiftCard(); setGcCode(''); setGcError('') }}
                        className="text-purple-400 hover:text-purple-600"
                      >
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

                {/* Confirm button */}
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

      {/* Cash Payment Success Overlay */}
      {success && !paymentOpen && (
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

      {/* Payment Modal — Split Payment only */}
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

              {/* ── LEFT: Split inputs ── */}
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

              {/* ── RIGHT: Order summary ── */}
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
                  <Button
                    className="w-full bg-brand-teal hover:bg-brand-teal-dark" loading={processing}
                    disabled={!splitValid}
                    onClick={processPayment}
                  >
                    Confirm
                  </Button>
                  <button
                    onClick={() => setSplits({ cash: totalDue.toFixed(2), card: '' })}
                    className="w-full rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Full Payment
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

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

      {/* Close Register Modal */}
      <Modal open={closeRegisterModal} onClose={() => { setCloseRegisterModal(false); setZReport(null) }} title="End Shift" size="sm">
        {zReport ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 p-4 space-y-2 text-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Z-Report</h3>
              {[['Total Sales', zReport.total_sales as number], ['Cash Sales', zReport.cash_sales as number], ['Card Sales', zReport.card_sales as number], ['Other', zReport.other_sales as number]].map(([l, v]) => (
                <div key={l as string} className="flex justify-between"><span className="text-gray-500">{l as string}</span><span>{formatCurrency(v as number ?? 0)}</span></div>
              ))}
              <div className="flex justify-between text-red-600"><span>Refunds</span><span>-{formatCurrency((zReport.total_refunds as number) ?? 0)}</span></div>
              {((zReport.cash_in as number) ?? 0) > 0 && (
                <div className="flex justify-between text-green-600"><span>Cash In</span><span>+{formatCurrency((zReport.cash_in as number) ?? 0)}</span></div>
              )}
              {((zReport.cash_out as number) ?? 0) > 0 && (
                <div className="flex justify-between text-orange-600"><span>Cash Out</span><span>-{formatCurrency((zReport.cash_out as number) ?? 0)}</span></div>
              )}
              <div className="border-t border-gray-200 pt-2 space-y-1">
                {[['Opening Float', zReport.opening_float as number], ['Expected Cash', zReport.expected_cash as number], ['Closing Cash', zReport.closing_cash as number]].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between"><span className="text-gray-500">{l as string}</span><span>{formatCurrency(v as number ?? 0)}</span></div>
                ))}
                <div className={`flex justify-between font-semibold ${((zReport.variance as number) ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  <span>Difference (Over/Short)</span><span>{formatCurrency((zReport.variance as number) ?? 0)}</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 pt-1"><span>Transactions</span><span>{(zReport.transaction_count as number) ?? 0}</span></div>
            </div>
            <Button className="w-full" onClick={() => { setCloseRegisterModal(false); setZReport(null) }}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Count the cash drawer by denomination, then end the shift to generate the Z-Report.</span>
            </div>

            {/* Denomination grid */}
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Count Denominations</p>
              <div className="grid grid-cols-4 gap-1.5">
                {DENOMINATIONS.map(d => (
                  <div key={d.value} className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1.5">
                    <span className="w-9 shrink-0 text-xs font-medium text-gray-600">{d.label}</span>
                    <input
                      type="number" min="0" step="1" placeholder="0"
                      value={closingDenoms[String(d.value)] ?? ''}
                      onChange={e => {
                        const v = parseInt(e.target.value) || 0
                        setClosingDenoms(prev => ({ ...prev, [String(d.value)]: v }))
                      }}
                      className="h-7 min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-1.5 text-right text-sm focus:border-brand-teal focus:outline-none focus:bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Verified total */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-900">
              <span>Verified Total</span>
              <span className="text-base">{formatCurrency(denomTotal(closingDenoms) || parseFloat(closingCash) || 0)}</span>
            </div>

            {/* Discrepancy note */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Note (optional)</label>
              <textarea
                rows={2}
                placeholder="Add a note about discrepancies or cash counts…"
                value={closingNote}
                onChange={e => setClosingNote(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCloseRegisterModal(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" loading={sessionProcessing} onClick={handleCloseRegister}>
                End Shift &amp; Z-Report
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cash In/Out Modal */}
      <Modal
        open={cashMovementOpen}
        onClose={() => setCashMovementOpen(false)}
        title="Cash In / Out"
        size="sm"
      >
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['cash_in', 'cash_out'] as const).map(t => (
              <button
                key={t}
                onClick={() => setCashMovementType(t)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  cashMovementType === t
                    ? t === 'cash_in' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t === 'cash_in' ? '+ Cash In' : '- Cash Out'}
              </button>
            ))}
          </div>
          <Input
            label="Amount"
            type="number" min="0" step="0.01" placeholder="0.00"
            value={cashMovementAmount}
            onChange={e => setCashMovementAmount(e.target.value)}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              rows={2}
              placeholder={cashMovementType === 'cash_in' ? 'e.g. Petty cash for change' : 'e.g. Cash removed for bank deposit'}
              value={cashMovementNotes}
              onChange={e => setCashMovementNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCashMovementOpen(false)}>Cancel</Button>
            <Button
              className={`flex-1 ${cashMovementType === 'cash_in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              loading={cashMovementSaving}
              disabled={!cashMovementAmount || parseFloat(cashMovementAmount) <= 0}
              onClick={handleCashMovement}
            >
              {cashMovementType === 'cash_in' ? 'Add Cash' : 'Remove Cash'}
            </Button>
          </div>
        </div>
      </Modal>

      <PinModal />

      {/* ── Warranty Claim Modal ── */}
      {warrantyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setWarrantyOpen(false)}>
          <div className="flex w-[880px] max-h-[88vh] flex-col rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-teal" />
                <h3 className="text-base font-bold text-gray-900">Warranty Claim — Check Device / Item History</h3>
              </div>
              <button onClick={() => setWarrantyOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search fields */}
            <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Device IMEI / Serial No.</label>
                  <input
                    type="text" placeholder="Enter IMEI or serial"
                    value={warrantyForm.imei}
                    onChange={e => setWarrantyForm(f => ({ ...f, imei: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && runWarrantySearch()}
                    className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Customer Name</label>
                  <input
                    type="text" placeholder="First or last name"
                    value={warrantyForm.customerName}
                    onChange={e => setWarrantyForm(f => ({ ...f, customerName: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && runWarrantySearch()}
                    className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Customer Mobile</label>
                  <input
                    type="text" placeholder="Phone number"
                    value={warrantyForm.customerMobile}
                    onChange={e => setWarrantyForm(f => ({ ...f, customerMobile: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && runWarrantySearch()}
                    className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Ticket ID</label>
                  <input
                    type="text" placeholder="e.g. T-0042"
                    value={warrantyForm.ticketId}
                    onChange={e => setWarrantyForm(f => ({ ...f, ticketId: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && runWarrantySearch()}
                    className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Invoice ID</label>
                  <input
                    type="text" placeholder="Invoice UUID"
                    value={warrantyForm.invoiceId}
                    onChange={e => setWarrantyForm(f => ({ ...f, invoiceId: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && runWarrantySearch()}
                    className="h-8 w-full rounded border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={runWarrantySearch}
                    disabled={warrantySearching}
                    className="flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-brand-teal px-4 text-sm font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {warrantySearching ? 'Searching…' : 'Search'}
                  </button>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {warrantySearching ? (
                <div className="space-y-3">
                  {[1,2].map(i => <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />)}
                </div>
              ) : warrantyResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <ShieldCheck className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">Enter search criteria above to find repair history</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {warrantyResults.map((repair: any) => {
                    const customer = repair.customers
                    const items: any[] = repair.repair_items ?? []
                    const statusColors: Record<string, string> = {
                      repaired: 'bg-green-100 text-green-700',
                      in_progress: 'bg-blue-100 text-blue-700',
                      waiting_for_parts: 'bg-yellow-100 text-yellow-700',
                      waiting_for_inspection: 'bg-orange-100 text-orange-700',
                      picked_up: 'bg-gray-100 text-gray-600',
                    }
                    const statusLabel = repair.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                    return (
                      <div key={repair.id} className="rounded-xl border border-gray-200 overflow-hidden">
                        {/* Repair header */}
                        <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="text-xs text-gray-500">Ticket</p>
                              <p className="text-sm font-bold text-gray-900">{repair.job_number}</p>
                            </div>
                            {customer && (
                              <div>
                                <p className="text-xs text-gray-500">Customer</p>
                                <p className="text-sm font-medium text-gray-900">{customer.first_name} {customer.last_name ?? ''}</p>
                                {customer.phone && <p className="text-xs text-gray-500">{customer.phone}</p>}
                              </div>
                            )}
                            <div>
                              <p className="text-xs text-gray-500">Device</p>
                              <p className="text-sm font-medium text-gray-900">{[repair.device_brand, repair.device_model].filter(Boolean).join(' ') || '—'}</p>
                              {repair.serial_number && <p className="text-xs text-gray-500">S/N: {repair.serial_number}</p>}
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Issue</p>
                              <p className="text-sm text-gray-700 line-clamp-1 max-w-xs">{repair.issue}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[repair.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {statusLabel}
                            </span>
                            {/* Actions dropdown */}
                            <div className="relative">
                              <button
                                onClick={() => setWarrantyActionsOpen(warrantyActionsOpen === repair.id ? null : repair.id)}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Actions <ChevronRight className="h-3 w-3 rotate-90" />
                              </button>
                              {warrantyActionsOpen === repair.id && (
                                <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                                  <button
                                    onClick={() => { setWarrantyActionsOpen(null); router.push(`/repairs/${repair.id}`) }}
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" /> View Ticket
                                  </button>
                                  <button
                                    onClick={() => { setWarrantyActionsOpen(null); router.push(`/pos/refund?sale_id=${repair.id}`) }}
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <ArrowLeft className="h-3.5 w-3.5" /> Issue Refund
                                  </button>
                                  <button
                                    onClick={() => { setWarrantyActionsOpen(null); /* mark out of warranty */ }}
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                                  >
                                    <X className="h-3.5 w-3.5" /> Out Of Warranty
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Parts table */}
                        {items.length > 0 && (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
                                <th className="px-4 py-2 text-left">Part / Service</th>
                                <th className="px-4 py-2 text-center w-24">Warranty</th>
                                <th className="px-4 py-2 text-center w-32">Expires</th>
                                <th className="px-4 py-2 text-center w-24">Status</th>
                                <th className="px-4 py-2 w-32"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {items.map((item: any) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2.5 font-medium text-gray-900">{item.name}</td>
                                  <td className="px-4 py-2.5 text-center">
                                    {item.warranty_days ? (
                                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{item.warranty_days}d</span>
                                    ) : (
                                      <span className="text-xs text-gray-400">None</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                                    {item.warrantyExpiry ? new Date(item.warrantyExpiry).toLocaleDateString() : '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {item.warranty_days ? (
                                      item.inWarranty
                                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">In Warranty</span>
                                        : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Expired</span>
                                    ) : <span className="text-xs text-gray-400">—</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    {item.inWarranty && (
                                      <button
                                        onClick={() => setWarrantyClaimModal({ repairId: repair.id, item })}
                                        className="rounded border border-brand-teal-light bg-brand-teal-light px-3 py-1 text-xs font-medium text-brand-teal hover:bg-brand-teal-light"
                                      >
                                        Warranty Claim
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {items.length === 0 && (
                          <p className="px-4 py-3 text-xs text-gray-400">No parts recorded for this repair.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Part Warranty Claim Sub-Modal ── */}
      <Modal
        open={!!warrantyClaimModal}
        onClose={() => { setWarrantyClaimModal(null); setWarrantyClaimReason('') }}
        title="Part Warranty Claim"
        size="sm"
      >
        {warrantyClaimModal && (
          <div className="space-y-4">
            <div className="rounded-lg bg-brand-teal-light border border-brand-teal-light px-4 py-3">
              <p className="text-xs text-brand-teal font-medium">Part</p>
              <p className="text-sm font-semibold text-gray-900">{warrantyClaimModal.item.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Warranty expires: {warrantyClaimModal.item.warrantyExpiry ? new Date(warrantyClaimModal.item.warrantyExpiry).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fault Description / Reason <span className="text-red-500">*</span></label>
              <textarea
                rows={3}
                placeholder="Describe the fault or reason for warranty claim…"
                value={warrantyClaimReason}
                onChange={e => setWarrantyClaimReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setWarrantyClaimModal(null); setWarrantyClaimReason('') }}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-brand-teal hover:bg-brand-teal-dark"
                loading={warrantyClaimSubmitting}
                disabled={!warrantyClaimReason.trim()}
                onClick={submitWarrantyClaim}
              >
                Submit Claim
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <PinModal />
    </div>
  )
}
