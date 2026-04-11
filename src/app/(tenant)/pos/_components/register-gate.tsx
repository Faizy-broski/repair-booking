'use client'
import { Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'
import { DENOMINATIONS, denomTotal } from '../_types'
import type { RegisterSession } from '../_types'

interface Props {
  activeBranchName: string | undefined
  existingSession: RegisterSession | null
  sessionProcessing: boolean
  prevClosingBalance: number | null
  openingDenoms: Record<string, number>
  setOpeningDenoms: React.Dispatch<React.SetStateAction<Record<string, number>>>
  openingFloat: string
  setOpeningFloat: (v: string) => void
  openingNote: string
  setOpeningNote: (v: string) => void
  joinShiftOpen: boolean
  setJoinShiftOpen: (v: boolean) => void
  handleOpenRegister: () => void
  handleJoinShift: () => void
}

export function RegisterGate({
  activeBranchName, existingSession, sessionProcessing, prevClosingBalance,
  openingDenoms, setOpeningDenoms, openingFloat, setOpeningFloat,
  openingNote, setOpeningNote, joinShiftOpen, setJoinShiftOpen,
  handleOpenRegister, handleJoinShift,
}: Props) {

  // ── Case A: a shift is already open — prompt to join ──────────────────────
  if (existingSession) {
    return (
      <div className="-m-6 flex h-[calc(100vh-3.5rem)] items-center justify-center bg-gray-50">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <Unlock className="h-7 w-7 text-blue-600" />
          </div>
          <h2 className="mb-1 text-lg font-bold text-gray-900">Shift Already Active</h2>
          <p className="mb-6 text-sm text-gray-500">
            {activeBranchName} · A shift is already open for this register
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

  // ── Case B: no shift open — count drawer and start ────────────────────────
  const openingTotal = denomTotal(openingDenoms)
  const hasDiscrepancy = prevClosingBalance !== null && Math.abs(openingTotal - prevClosingBalance) > 0.01

  return (
    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center bg-gray-50">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal-light shrink-0">
            <Lock className="h-6 w-6 text-brand-teal" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Start Shift</h2>
            <p className="text-sm text-gray-500">{activeBranchName} · Count your cash drawer to begin</p>
          </div>
        </div>

        {prevClosingBalance !== null && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
            <span className="text-gray-500">Previous shift closing balance</span>
            <span className="font-semibold text-gray-900">{formatCurrency(prevClosingBalance)}</span>
          </div>
        )}

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

        <div className={`mb-3 flex items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold ${
          hasDiscrepancy
            ? 'bg-amber-50 border border-amber-200 text-amber-800'
            : 'bg-brand-teal-light border border-brand-teal-light text-brand-teal-dark'
        }`}>
          <span>Verified Total</span>
          <span className="text-base">{formatCurrency(openingTotal)}</span>
        </div>

        {hasDiscrepancy && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-amber-700">
              Discrepancy Note <span className="text-red-500">*</span>
              <span className="ml-1 text-amber-600">
                (difference: {formatCurrency(openingTotal - (prevClosingBalance ?? 0))})
              </span>
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

        <Button
          className="w-full bg-brand-teal hover:bg-brand-teal-dark"
          size="lg"
          loading={sessionProcessing}
          onClick={handleOpenRegister}
        >
          <Unlock className="h-4 w-4" /> Start Shift
        </Button>
      </div>
    </div>
  )
}
