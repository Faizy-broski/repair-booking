'use client'
import { useState, useEffect, useCallback } from 'react'
import { Wrench, ShoppingBag } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { usePosStore } from '@/store/pos.store'
import { formatCurrency } from '@/lib/utils'
import { usePinPrompt } from '@/components/ui/pin-prompt'
import type { RegisterSession } from './_types'

import { RegisterGate } from './_components/register-gate'
import { CartPanel } from './_components/cart-panel'
import { RepairsTab } from './_components/repairs-tab'
import { ProductsTab } from './_components/products-tab'
import { CloseRegisterModal } from './_components/modals/close-register-modal'
import { CashMovementModal } from './_components/modals/cash-movement-modal'

type PosTab = 'repairs' | 'products'

const TABS: { key: PosTab; label: string; icon: React.ReactNode }[] = [
  { key: 'repairs',  label: 'Repairs',  icon: <Wrench className="h-4 w-4" /> },
  { key: 'products', label: 'Products', icon: <ShoppingBag className="h-4 w-4" /> },
]

export default function PosPage() {
  const { activeBranch, profile } = useAuthStore()
  const pos = usePosStore()
  const { PinModal } = usePinPrompt()

  // ── Tab ───────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PosTab>('repairs')
  const [mobileView, setMobileView] = useState<'browse' | 'cart'>('browse')

  // ── Register session ──────────────────────────────────────────────────────────
  const [sessionLoading, setSessionLoading] = useState(!pos.sessionLoaded)
  const [sessionProcessing, setSessionProcessing] = useState(false)
  const [joinShiftOpen, setJoinShiftOpen] = useState(false)
  const [prevClosingBalance, setPrevClosingBalance] = useState<number | null>(null)

  // ── Opening denomination counting ─────────────────────────────────────────────
  const [openingFloat, setOpeningFloat] = useState('')
  const [openingDenoms, setOpeningDenoms] = useState<Record<string, number>>({})
  const [openingNote, setOpeningNote] = useState('')

  // ── Close register modal ──────────────────────────────────────────────────────
  const [closeRegisterModal, setCloseRegisterModal] = useState(false)
  const [closingDenoms, setClosingDenoms] = useState<Record<string, number>>({})
  const [closingNote, setClosingNote] = useState('')
  const [zReport, setZReport] = useState<Record<string, unknown> | null>(null)

  // ── Cash In/Out modal ─────────────────────────────────────────────────────────
  const [cashMovementOpen, setCashMovementOpen] = useState(false)
  const [cashMovementType, setCashMovementType] = useState<'cash_in' | 'cash_out'>('cash_in')
  const [cashMovementAmount, setCashMovementAmount] = useState('')
  const [cashMovementNotes, setCashMovementNotes] = useState('')
  const [cashMovementSaving, setCashMovementSaving] = useState(false)

  // ── Session fetch ─────────────────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    if (!activeBranch) return
    if (!pos.sessionLoaded) setSessionLoading(true)
    
    const [sessionRes, prevRes] = await Promise.all([
      fetch(`/api/pos/session?branch_id=${activeBranch.id}`),
      fetch(`/api/reports?branch_id=${activeBranch.id}&type=sessions&from=${new Date(Date.now() - 7 * 86400000).toISOString()}&to=${new Date().toISOString()}`),
    ])
    if (sessionRes.ok) {
      const j = await sessionRes.json()
      const s = j.data ?? null
      pos.setExistingSession(s)
      if (s && profile) {
        const members: Array<{ profile_id: string }> = s.register_session_members ?? []
        const isMember = s.cashier_id === profile.id || members.some((m: { profile_id: string }) => m.profile_id === profile.id)
        pos.setSession(isMember ? s : null)
        if (!isMember) setJoinShiftOpen(true)
      } else {
        pos.setSession(s)
      }
    }
    if (prevRes.ok) {
      const j = await prevRes.json()
      const sessions = j.data ?? []
      const lastClosed = sessions.find((s: any) => s.status === 'closed')
      setPrevClosingBalance(lastClosed?.closing_cash ?? null)
    }
    pos.setSessionLoaded(true)
    setSessionLoading(false)
  }, [activeBranch, profile, pos])

  useEffect(() => { 
    if (!pos.sessionLoaded) fetchSession() 
  }, [fetchSession, pos.sessionLoaded])

  // ── Register handlers ─────────────────────────────────────────────────────────

  async function handleOpenRegister() {
    if (!activeBranch) return
    setSessionProcessing(true)
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
    setSessionProcessing(false)
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

  async function handleCloseRegister() {
    if (!pos.session) return
    setSessionProcessing(true)
    const DENOMINATIONS = [
      { value: 50 }, { value: 20 }, { value: 10 }, { value: 5 },
      { value: 2 }, { value: 1 }, { value: 0.50 }, { value: 0.20 },
      { value: 0.10 }, { value: 0.05 }, { value: 0.02 }, { value: 0.01 },
    ]
    const total = DENOMINATIONS.reduce((sum, d) => sum + (closingDenoms[String(d.value)] ?? 0) * d.value, 0)
    const res = await fetch('/api/pos/session/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: pos.session.id,
        closing_cash: total || 0,
        closing_note: closingNote || undefined,
      }),
    })
    if (res.ok) {
      const j = await res.json()
      setZReport(j.data ?? null)
      pos.setSession(null)
      pos.setSessionLoaded(false)
      setClosingDenoms({})
      setClosingNote('')
    }
    setSessionProcessing(false)
  }

  async function handleCashMovement() {
    if (!pos.session || !cashMovementAmount) return
    setCashMovementSaving(true)
    const res = await fetch('/api/pos/session/movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: pos.session.id,
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

  // ── Register gate ─────────────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-sm text-gray-500">
        Loading session...
      </div>
    )
  }

  if (!pos.session) {
    return (
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
    )
  }

  // ── Main layout ───────────────────────────────────────────────────────────────

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-gray-100">

      {/* Register open banner */}
      {pos.session && (
        <div className="flex shrink-0 flex-col gap-1 border-b border-green-200 bg-green-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 whitespace-nowrap">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 animate-pulse" />
            Register Open · Float {formatCurrency(pos.session.opening_float)}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setCashMovementType('cash_in'); setCashMovementOpen(true) }}
              className="text-xs font-semibold text-green-600 hover:text-green-800 sm:text-sm whitespace-nowrap"
            >
              Cash In
            </button>
            <button
              onClick={() => { setCashMovementType('cash_out'); setCashMovementOpen(true) }}
              className="text-xs font-semibold text-orange-500 hover:text-orange-700 sm:text-sm whitespace-nowrap"
            >
              Cash Out
            </button>
            <button
              onClick={() => setCloseRegisterModal(true)}
              className="text-xs font-semibold text-red-500 hover:text-red-700 sm:text-sm whitespace-nowrap"
            >
              Close Register
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Cart Panel ── */}
        <CartPanel mobileView={mobileView} />

        {/* ── RIGHT: Tabbed browser ── */}
        <div className={`flex-1 flex-col overflow-hidden ${mobileView === 'browse' ? 'flex' : 'hidden lg:flex'}`}>

          {/* Tab bar */}
          <div className="flex shrink-0 bg-[#1a3c40]">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-2 border-b-3 px-4 py-2.5 lg:py-4 text-sm lg:text-base font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.key
                    ? 'border-white text-white bg-white/10'
                    : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

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
        onClose={() => { setCloseRegisterModal(false); setZReport(null) }}
        zReport={zReport}
        sessionProcessing={sessionProcessing}
        closingDenoms={closingDenoms}
        setClosingDenoms={setClosingDenoms}
        closingNote={closingNote}
        setClosingNote={setClosingNote}
        handleCloseRegister={handleCloseRegister}
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
      />

      <PinModal />
    </div>
  )
}
