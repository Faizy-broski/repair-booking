'use client'
import { AlertTriangle, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'
import { DENOMINATIONS, denomTotal } from '../../_types'

interface Props {
  open: boolean
  onClose: () => void
  zReport: Record<string, unknown> | null
  sessionProcessing: boolean
  closingDenoms: Record<string, number>
  setClosingDenoms: React.Dispatch<React.SetStateAction<Record<string, number>>>
  closingNote: string
  setClosingNote: (v: string) => void
  handleCloseRegister: () => void
}

export function CloseRegisterModal({
  open, onClose, zReport, sessionProcessing,
  closingDenoms, setClosingDenoms, closingNote, setClosingNote, handleCloseRegister,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="End Shift" size="sm">
      {zReport ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-4 space-y-2 text-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Z-Report</h3>
            {([
              ['Total Sales',  zReport.total_sales  as number],
              ['Cash Sales',   zReport.cash_sales   as number],
              ['Card Sales',   zReport.card_sales   as number],
              ['Other',        zReport.other_sales  as number],
            ] as [string, number][]).map(([l, v]) => (
              <div key={l} className="flex justify-between"><span className="text-gray-500">{l}</span><span>{formatCurrency(v ?? 0)}</span></div>
            ))}
            <div className="flex justify-between text-red-600"><span>Refunds</span><span>-{formatCurrency((zReport.total_refunds as number) ?? 0)}</span></div>
            {((zReport.cash_in as number) ?? 0) > 0 && (
              <div className="flex justify-between text-green-600"><span>Cash In</span><span>+{formatCurrency((zReport.cash_in as number) ?? 0)}</span></div>
            )}
            {((zReport.cash_out as number) ?? 0) > 0 && (
              <div className="flex justify-between text-orange-600"><span>Cash Out</span><span>-{formatCurrency((zReport.cash_out as number) ?? 0)}</span></div>
            )}
            <div className="border-t border-gray-200 pt-2 space-y-1">
              {([
                ['Opening Float', zReport.opening_float as number],
                ['Expected Cash', zReport.expected_cash as number],
                ['Closing Cash',  zReport.closing_cash  as number],
              ] as [string, number][]).map(([l, v]) => (
                <div key={l} className="flex justify-between"><span className="text-gray-500">{l}</span><span>{formatCurrency(v ?? 0)}</span></div>
              ))}
              <div className={`flex justify-between font-semibold ${((zReport.variance as number) ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>Difference (Over/Short)</span><span>{formatCurrency((zReport.variance as number) ?? 0)}</span>
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 pt-1"><span>Transactions</span><span>{(zReport.transaction_count as number) ?? 0}</span></div>
          </div>
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Count the cash drawer by denomination, then end the shift to generate the Z-Report.</span>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Count Denominations</p>
            <div className="grid grid-cols-4 gap-1.5">
              {DENOMINATIONS.map(d => (
                <div key={d.value} className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm">
                  <span className="text-[10px] font-bold text-gray-400 uppercase text-center">{d.label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const v = (closingDenoms[String(d.value)] ?? 0)
                        if (v > 0) setClosingDenoms(prev => ({ ...prev, [String(d.value)]: v - 1 }))
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="number" min="0" step="1" placeholder="0"
                      value={closingDenoms[String(d.value)] ?? ''}
                      onChange={e => {
                        const v = parseInt(e.target.value) || 0
                        setClosingDenoms(prev => ({ ...prev, [String(d.value)]: v }))
                      }}
                      className="h-6 w-full min-w-0 bg-transparent text-center text-sm font-bold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = (closingDenoms[String(d.value)] ?? 0)
                        setClosingDenoms(prev => ({ ...prev, [String(d.value)]: v + 1 }))
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-900">
            <span>Verified Total</span>
            <span className="text-base">{formatCurrency(denomTotal(closingDenoms))}</span>
          </div>

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
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" loading={sessionProcessing} onClick={handleCloseRegister}>
              End Shift &amp; Z-Report
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
