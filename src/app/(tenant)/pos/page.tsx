'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Wrench, ShoppingBag } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { usePosStore } from '@/store/pos.store'
import { formatCurrency } from '@/lib/utils'
import { usePinPrompt } from '@/components/ui/pin-prompt'
import type { RegisterSession, ZReport } from './_types'

import { Button } from '@/components/ui/button'
import { RegisterGate } from './_components/register-gate'
import { CartPanel } from './_components/cart-panel'
import { RepairsTab } from './_components/repairs-tab'
import { ProductsTab } from './_components/products-tab'
import { CloseRegisterModal } from './_components/modals/close-register-modal'
import { CashMovementModal, type BuybackPayload } from './_components/modals/cash-movement-modal'
import { useHidScanner } from '@/hooks/use-hid-scanner'
import { useRealtime } from '@/hooks/use-realtime'

import { toast } from 'sonner'
import type { Product } from '@/types/database'

type PosTab = 'repairs' | 'products'

export default function PosPage() {
  const { activeBranch, profile, verticalTemplateSlug } = useAuthStore()

  const isRetail = verticalTemplateSlug === 'retail-store'
  const TABS: { key: PosTab; label: string; icon: React.ReactNode }[] = [
    { key: 'products', label: 'Products', icon: <ShoppingBag className="h-4 w-4" /> },
    ...(!isRetail ? [{ key: 'repairs' as PosTab, label: 'Repairs', icon: <Wrench className="h-4 w-4" /> }] : []),
  ]
  const pos = usePosStore()
  const { PinModal } = usePinPrompt()

  // ── Tab ───────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PosTab>('products')
  const [mobileView, setMobileView] = useState<'browse' | 'cart'>('browse')

  // ── Register session ──────────────────────────────────────────────────────────
  // Skip session loading when POS shift management is disabled for this branch
  const shiftRequired = activeBranch?.pos_require_shift !== false
  const [sessionLoading, setSessionLoading] = useState(shiftRequired && !pos.sessionLoaded)
  const [sessionProcessing, setSessionProcessing] = useState(false)
  const [joinShiftOpen, setJoinShiftOpen] = useState(false)
  const [prevClosingBalance, setPrevClosingBalance] = useState<number | null>(null)

  // Refs to avoid stale closure deps in fetchSession without re-creating it on every store change
  const activeBranchRef = useRef(activeBranch)
  const profileRef = useRef(profile)
  const fetchAbortRef = useRef<AbortController | null>(null)
  const openingInFlight = useRef(false)
  useEffect(() => { activeBranchRef.current = activeBranch }, [activeBranch])
  useEffect(() => { profileRef.current = profile }, [profile])

  // ── Opening denomination counting ─────────────────────────────────────────────
  const [openingFloat, setOpeningFloat] = useState('')
  const [openingDenoms, setOpeningDenoms] = useState<Record<string, number>>({})
  const [openingNote, setOpeningNote] = useState('')

  // ── Close register modal ──────────────────────────────────────────────────────
  const [closeRegisterModal, setCloseRegisterModal] = useState(false)
  const [closingDenoms, setClosingDenoms] = useState<Record<string, number>>({})
  const [closingNote, setClosingNote] = useState('')
  const [zReport, setZReport] = useState<ZReport | null>(null)
  const [expectedCash, setExpectedCash] = useState<number | null>(null)
  const [expectedCashLoading, setExpectedCashLoading] = useState(false)

  // ── Live session stats (net sales / repair / product / credit / cash in-out) ──
  const [sessionStats, setSessionStats] = useState<{
    total_sales: number; repair_sales: number; total_refunds: number; repair_refunds: number
    store_credit_sales: number; loyalty_points_sales: number; on_account_sales: number
    repair_store_credit_sales: number; repair_loyalty_points_sales: number
    cash_in: number; cash_out: number; buyback_out: number
    credit_repayments_cash: number; credit_repayments_total: number
    expected_cash: number; opening_float: number; expenses?: number
  } | null>(null)

  const fetchSessionStats = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/pos/session/${sessionId}/expected-cash`)
      if (!res.ok) return
      const j = await res.json()
      if (j.data) setSessionStats(j.data)
    } catch { /* best-effort — live stats aren't critical path */ }
  }, [])

  useEffect(() => {
    if (!pos.session) { setSessionStats(null); return }
    fetchSessionStats(pos.session.id)
    const interval = setInterval(() => fetchSessionStats(pos.session!.id), 30000)
    return () => clearInterval(interval)
  }, [pos.session, fetchSessionStats])

  const refreshSessionStats = useCallback(() => {
    if (pos.session) fetchSessionStats(pos.session.id)
  }, [pos.session, fetchSessionStats])

  useRealtime({ table: 'sales', filterColumn: 'branch_id', filterValue: activeBranch?.id, onInsert: refreshSessionStats, onUpdate: refreshSessionStats })
  useRealtime({ table: 'repairs', filterColumn: 'branch_id', filterValue: activeBranch?.id, onInsert: refreshSessionStats, onUpdate: refreshSessionStats })
  useRealtime({ table: 'cash_movements', filterColumn: 'branch_id', filterValue: activeBranch?.id, onInsert: refreshSessionStats })

  // ── Cash In/Out modal ─────────────────────────────────────────────────────────
  const [cashMovementOpen, setCashMovementOpen] = useState(false)
  const [cashMovementType, setCashMovementType] = useState<'cash_in' | 'cash_out'>('cash_in')
  const [cashMovementAmount, setCashMovementAmount] = useState('')
  const [cashMovementNotes, setCashMovementNotes] = useState('')
  const [cashMovementSaving, setCashMovementSaving] = useState(false)



  // ── Session fetch ─────────────────────────────────────────────────────────────

  // fetchSession has stable [] deps — reads branch/profile from refs, store via getState().
  // This prevents the useEffect from firing on every Zustand store update (cart changes, etc.)
  // and eliminates the spurious "Loading session..." flash the user sees as a "reload".
  const fetchSession = useCallback(async () => {
    const branch = activeBranchRef.current
    const user = profileRef.current
    if (!branch) return

    fetchAbortRef.current?.abort()
    const ctrl = new AbortController()
    fetchAbortRef.current = ctrl

    const store = usePosStore.getState()
    if (!store.sessionLoaded) setSessionLoading(true)

    try {
      const [sessionRes, prevRes] = await Promise.all([
        fetch(`/api/pos/session?branch_id=${branch.id}`, { signal: ctrl.signal }),
        fetch(`/api/reports?branch_id=${branch.id}&type=sessions&from=${new Date(Date.now() - 7 * 86400000).toISOString()}&to=${new Date().toISOString()}`, { signal: ctrl.signal }),
      ])
      if (sessionRes.ok) {
        const j = await sessionRes.json()
        const s = j.data ?? null
        store.setExistingSession(s)
        if (s && user) {
          const members: Array<{ profile_id: string }> = s.register_session_members ?? []
          const isMember = s.cashier_id === user.id || members.some((m: { profile_id: string }) => m.profile_id === user.id)
          store.setSession(isMember ? s : null)
          if (!isMember) setJoinShiftOpen(true)
        } else {
          store.setSession(s)
        }
      }
      if (prevRes.ok) {
        const j = await prevRes.json()
        const sessions = j.data ?? []
        const lastClosed = sessions.find((s: any) => s.status === 'closed')
        setPrevClosingBalance(lastClosed?.closing_cash ?? null)
      }
      store.setSessionLoaded(true)
      setSessionLoading(false)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => { 
    if (shiftRequired && !pos.sessionLoaded) fetchSession() 
  }, [fetchSession, pos.sessionLoaded, shiftRequired])

  // ── Register handlers ─────────────────────────────────────────────────────────

  async function handleOpenRegister() {
    if (!activeBranch || openingInFlight.current) return
    openingInFlight.current = true
    setSessionProcessing(true)
    try {
      const DENOMINATIONS = [
        { value: 50 }, { value: 20 }, { value: 10 }, { value: 5 },
        { value: 2 }, { value: 1 }, { value: 0.50 }, { value: 0.20 },
        { value: 0.10 }, { value: 0.05 }, { value: 0.02 }, { value: 0.01 },
      ]
      const total = DENOMINATIONS.reduce((sum, d) => sum + (openingDenoms[String(d.value)] ?? 0) * d.value, 0)
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
        if (returned && returned.cashier_id !== profile?.id) {
          pos.setExistingSession(returned)
          setJoinShiftOpen(true)
        } else {
          await fetchSession()
          setOpeningFloat('')
          setOpeningDenoms({})
          setOpeningNote('')
        }
      }
    } finally {
      openingInFlight.current = false
      setSessionProcessing(false)
    }
  }

  async function handleJoinShift() {
    if (!pos.existingSession) return
    setSessionProcessing(true)
    const res = await fetch('/api/pos/session/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: pos.existingSession.id }),
    })
    if (res.ok) { setJoinShiftOpen(false); await fetchSession() }
    setSessionProcessing(false)
  }

  async function openCloseRegisterModal() {
    setCloseRegisterModal(true)
    if (!pos.session) return
    setExpectedCashLoading(true)
    try {
      const res = await fetch(`/api/pos/session/${pos.session.id}/expected-cash`)
      const j = await res.json()
      setExpectedCash(res.ok ? (j.data?.expected_cash ?? null) : null)
    } catch {
      setExpectedCash(null)
    }
    setExpectedCashLoading(false)
  }

  async function handleCloseRegister() {
    if (!pos.session) return
    const DENOMINATIONS = [
      { value: 50 }, { value: 20 }, { value: 10 }, { value: 5 },
      { value: 2 }, { value: 1 }, { value: 0.50 }, { value: 0.20 },
      { value: 0.10 }, { value: 0.05 }, { value: 0.02 }, { value: 0.01 },
    ]
    const total = DENOMINATIONS.reduce((sum, d) => sum + (closingDenoms[String(d.value)] ?? 0) * d.value, 0)
    const hasDiscrepancy = expectedCash !== null && Math.abs(total - expectedCash) > 0.01
    if (hasDiscrepancy && !closingNote.trim()) return
    setSessionProcessing(true)
    const res = await fetch('/api/pos/session/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: pos.session.id,
        closing_cash: total || 0,
        closing_note: closingNote || undefined,
      }),
    })
    const j = await res.json()
    if (res.ok) {
      setZReport(j.data ?? null)
      pos.setSession(null)
      pos.setSessionLoaded(false)
      setClosingDenoms({})
      setClosingNote('')
      setExpectedCash(null)
    } else if (j?.error?.message?.includes('Session already closed')) {
      // Session was already closed externally — sync local state
      pos.setSession(null)
      pos.setSessionLoaded(false)
      setClosingDenoms({})
      setClosingNote('')
      setExpectedCash(null)
      await fetchSession()
    }
    setSessionProcessing(false)
  }

  async function handleCashMovement(categoryId: string | null, addToLedger: boolean, buyback?: BuybackPayload | null) {
    if (!pos.session || !cashMovementAmount) return
    setCashMovementSaving(true)
    const amount = parseFloat(cashMovementAmount)

    const purpose = cashMovementType !== 'cash_out' ? 'plain'
      : addToLedger ? 'expense'
      : buyback ? 'buyback'
      : 'plain'

    // Everything (cash movement + its offsetting expense/buyback entry) is
    // recorded atomically server-side (record_cash_movement RPC) — if the
    // offsetting side fails (e.g. a duplicate barcode), the whole thing rolls
    // back, so we never end up with cash removed from the drawer and nothing
    // to show for it.
    const res = await fetch('/api/pos/session/movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: pos.session.id,
        branch_id: activeBranch?.id,
        type: cashMovementType,
        amount,
        notes: cashMovementNotes || undefined,
        purpose,
        expense_category_id: purpose === 'expense' ? (categoryId || null) : undefined,
        expense_title: purpose === 'expense' ? (cashMovementNotes?.trim() || 'POS Cash Out') : undefined,
        buyback_name: purpose === 'buyback' ? buyback?.name : undefined,
        buyback_selling_price: purpose === 'buyback' ? buyback?.selling_price : undefined,
        buyback_barcode: purpose === 'buyback' ? buyback?.barcode : undefined,
      }),
    })

    if (res.ok) {
      if (purpose === 'expense') toast.success(`Cash out of ${formatCurrency(amount)} recorded as expense`)
      else if (purpose === 'buyback') toast.success(`Cash out of ${formatCurrency(amount)} recorded as buyback — 1 unit added to stock`)
      else if (cashMovementType === 'cash_out') toast.success(`Cash out of ${formatCurrency(amount)} recorded`)
      else toast.success(`Cash in of ${formatCurrency(amount)} recorded`)
      setCashMovementOpen(false)
      setCashMovementAmount('')
      setCashMovementNotes('')
    } else {
      const errJson = await res.json().catch(() => ({}))
      toast.error(errJson?.error?.message ?? 'Failed to record cash movement')
    }
    setCashMovementSaving(false)
  }

  // ── Register gate ─────────────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-sm text-gray-500">
        Loading session...
      </div>
    )
  }

  if (!pos.session && shiftRequired) {
    return (
      <>
        <RegisterGate
          activeBranchName={activeBranch?.name}
          existingSession={pos.existingSession}
          sessionProcessing={sessionProcessing}
          prevClosingBalance={prevClosingBalance}
          openingDenoms={openingDenoms}
          setOpeningDenoms={setOpeningDenoms}
          openingFloat={openingFloat}
          setOpeningFloat={setOpeningFloat}
          openingNote={openingNote}
          setOpeningNote={setOpeningNote}
          joinShiftOpen={joinShiftOpen}
          setJoinShiftOpen={setJoinShiftOpen}
          handleOpenRegister={handleOpenRegister}
          handleJoinShift={handleJoinShift}
        />
        {/* Kept alive here too: closing the register nulls pos.session, which
            triggers this early return — without this, the Z-Report summary
            modal would unmount before the cashier ever saw it. */}
        <CloseRegisterModal
          open={closeRegisterModal}
          onClose={() => { setCloseRegisterModal(false); setZReport(null); setExpectedCash(null) }}
          zReport={zReport}
          sessionProcessing={sessionProcessing}
          closingDenoms={closingDenoms}
          setClosingDenoms={setClosingDenoms}
          closingNote={closingNote}
          setClosingNote={setClosingNote}
          handleCloseRegister={handleCloseRegister}
          expectedCash={expectedCash}
          expectedCashLoading={expectedCashLoading}
          sessionStats={sessionStats}
        />
      </>
    )
  }

  // ── Main layout ───────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-gray-100">

      {/* Register open banner */}
      {pos.session && (
        <div className="flex shrink-0 flex-col gap-1 border-b border-green-200 bg-green-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 whitespace-nowrap">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 animate-pulse" />
            Register Open · Float {formatCurrency(pos.session.opening_float)}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setCashMovementType('cash_in'); setCashMovementOpen(true) }}
              className="text-green-600 hover:text-green-700 font-bold"
            >
              Cash In
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setCashMovementType('cash_out'); setCashMovementOpen(true) }}
              className="text-orange-600 hover:text-orange-700 font-bold"
            >
              Cash Out
            </Button>
            <Button 
              variant="secondary"
              size="sm"
              onClick={openCloseRegisterModal}
              className="text-red-600 hover:text-red-700 font-bold"
            >
              Close Register
            </Button>
          </div>
        </div>
      )}

      {/* Live session stats: net/repair/product/credit sales + cash in/out, updates in realtime */}
      {pos.session && sessionStats && (() => {
        const productSales = sessionStats.total_sales
        const repairSales = sessionStats.repair_sales
        // "Credit Sales" = on-account (accounts-receivable) sales — money owed,
        // not yet collected. Store credit / loyalty are prepaid tenders (the
        // customer already paid in advance), so they're excluded here.
        const creditSales = sessionStats.on_account_sales
        // Net Sales is pure revenue recognized this session (product + repair,
        // less refunds) — deliberately EXCLUDING Cash In/Out, which are manual
        // drawer adjustments, not sales performance. They're shown as their own
        // tiles instead of being blended into this figure.
        const netSales = (sessionStats.total_sales - sessionStats.total_refunds)
          + (sessionStats.repair_sales - sessionStats.repair_refunds)
        return (
          <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2 sm:px-5">
            <div className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {([
                ['Net Sales',      netSales,                                'text-brand-teal-dark', 'bg-brand-teal'],
                ['Product Sales',  productSales,                            'text-blue-700',   'bg-blue-500'],
                ['Credit Sales',   creditSales,                             'text-purple-700', 'bg-purple-500'],
                ['Repair Sales',   repairSales,                             'text-indigo-700', 'bg-indigo-500'],
                ['Credit Repaid',  sessionStats.credit_repayments_cash ?? 0, 'text-cyan-700',  'bg-cyan-500'],
                ['Refunds',        -(sessionStats.total_refunds + sessionStats.repair_refunds), 'text-red-700', 'bg-red-500'],
                ['Cash In',        sessionStats.cash_in,                    'text-green-700',  'bg-green-500'],
                ['Cash Out',       sessionStats.cash_out,                   'text-orange-700', 'bg-orange-500'],
                ['Buyback',        sessionStats.buyback_out ?? 0,           'text-pink-700',   'bg-pink-500'],
                // Expense is a one-off customization for a single business — the
                // backend only returns this field for that business, so it's
                // simply absent (undefined) for everyone else.
                ...(sessionStats.expenses !== undefined ? [['Expense', sessionStats.expenses, 'text-rose-700', 'bg-rose-500']] : []),
                ['Expected Cash',  sessionStats.expected_cash,              'text-amber-700',  'bg-amber-500'],
              ] as [string, number, string, string][]).map(([label, value, textCls, dotCls]) => (
                <div key={label} className="flex shrink-0 flex-col gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold uppercase tracking-wide text-gray-500">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls}`} />
                    {label}
                  </span>
                  <span className={`whitespace-nowrap text-base font-bold leading-none ${textCls}`}>{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Cart Panel ── */}
        <CartPanel mobileView={mobileView} />

        {/* ── RIGHT: Tabbed browser ── */}
        <div className={`flex-1 flex-col overflow-hidden ${mobileView === 'browse' ? 'flex' : 'hidden lg:flex'}`}>

          {/* Tab bar */}
          {TABS.length > 1 && (
            <div className="flex shrink-0 items-center bg-brand-teal">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-2.5 lg:py-4 text-sm lg:text-base font-semibold whitespace-nowrap transition-all ${
                    activeTab === tab.key
                      ? 'border-white text-white bg-white/10'
                      : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Tab content */}
          <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
            {activeTab === 'repairs' && <RepairsTab />}
            {activeTab === 'products' && <ProductsTab />}
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
            <span className="absolute right-[calc(50%-18px)] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {pos.cart.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Modals ── */}
      <CloseRegisterModal
        open={closeRegisterModal}
        onClose={() => { setCloseRegisterModal(false); setZReport(null); setExpectedCash(null) }}
        zReport={zReport}
        sessionProcessing={sessionProcessing}
        closingDenoms={closingDenoms}
        setClosingDenoms={setClosingDenoms}
        closingNote={closingNote}
        setClosingNote={setClosingNote}
        handleCloseRegister={handleCloseRegister}
        expectedCash={expectedCash}
        expectedCashLoading={expectedCashLoading}
        sessionStats={sessionStats}
      />

      <CashMovementModal
        open={cashMovementOpen}
        onClose={() => setCashMovementOpen(false)}
        cashMovementType={cashMovementType}
        setCashMovementType={setCashMovementType}
        cashMovementAmount={cashMovementAmount}
        setCashMovementAmount={setCashMovementAmount}
        cashMovementNotes={cashMovementNotes}
        setCashMovementNotes={setCashMovementNotes}
        cashMovementSaving={cashMovementSaving}
        handleCashMovement={handleCashMovement}
        businessId={activeBranch?.business_id}
      />

      <PinModal />
    </div>
  )
}
