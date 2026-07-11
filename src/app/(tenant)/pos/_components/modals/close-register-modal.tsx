'use client'
import { AlertTriangle, Plus, Minus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'
import { DENOMINATIONS, denomTotal, type ZReport } from '../../_types'

interface Props {
  open: boolean
  onClose: () => void
  zReport: ZReport | null
  sessionProcessing: boolean
  closingDenoms: Record<string, number>
  setClosingDenoms: React.Dispatch<React.SetStateAction<Record<string, number>>>
  closingNote: string
  setClosingNote: (v: string) => void
  handleCloseRegister: () => void
  expectedCash: number | null
  expectedCashLoading: boolean
}

export function CloseRegisterModal({
  open, onClose, zReport, sessionProcessing,
  closingDenoms, setClosingDenoms, closingNote, setClosingNote, handleCloseRegister,
  expectedCash, expectedCashLoading,
}: Props) {
  const verifiedTotal = denomTotal(closingDenoms)
  const difference = expectedCash !== null ? verifiedTotal - expectedCash : null
  const hasDiscrepancy = difference !== null && Math.abs(difference) > 0.01
  return (
    <Modal open={open} onClose={onClose} title="End Shift" size={zReport ? 'xl' : 'sm'}>
      {zReport ? (
        <div className="space-y-5">
          <p className="-mt-2 text-sm text-gray-500">Register closed successfully. Here&apos;s the summary for this shift.</p>

          {/* Sales breakdown: product vs repair */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Sales Breakdown</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium text-gray-500">Product Sales</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(zReport.total_sales ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium text-gray-500">Repair Sales</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(zReport.repair_sales ?? 0)}</p>
                {(zReport.repair_refunds ?? 0) > 0 && (
                  <p className="mt-0.5 text-xs text-red-600">-{formatCurrency(zReport.repair_refunds ?? 0)} refunded</p>
                )}
              </div>
              <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-4">
                <p className="text-xs font-medium text-brand-teal">Total</p>
                <p className="mt-1 text-xl font-semibold text-brand-teal">
                  {formatCurrency(zReport.grand_total ?? (zReport.total_sales ?? 0) + (zReport.repair_sales ?? 0) - (zReport.repair_refunds ?? 0))}
                </p>
              </div>
            </div>
          </div>

          {/* Cash flow for the shift */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Cash Flow</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ['Cash Sales',     zReport.cash_sales ?? 0],
                ['Card Sales',     zReport.card_sales ?? 0],
                ['Store Credit',   zReport.store_credit_sales ?? 0],
                ['Loyalty Points', zReport.loyalty_points_sales ?? 0],
                ['Other',          zReport.other_sales ?? 0],
                ['Refunds',        -(zReport.total_refunds ?? 0)],
              ] as [string, number][]).map(([l, v]) => (
                <div key={l} className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-xs text-gray-500">{l}</p>
                  <p className={`mt-0.5 font-semibold ${l === 'Refunds' && v < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(v)}</p>
                </div>
              ))}
              {(zReport.cash_in ?? 0) > 0 && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                  <p className="text-xs text-green-700">Cash In</p>
                  <p className="mt-0.5 font-semibold text-green-700">+{formatCurrency(zReport.cash_in ?? 0)}</p>
                </div>
              )}
              {(zReport.cash_out ?? 0) > 0 && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                  <p className="text-xs text-orange-700">Cash Out</p>
                  <p className="mt-0.5 font-semibold text-orange-700">-{formatCurrency(zReport.cash_out ?? 0)}</p>
                </div>
              )}
            </div>
            {((zReport.cash_in ?? 0) > 0 || (zReport.cash_out ?? 0) > 0) && (
              <p className="mt-2 text-xs text-gray-400 italic">Cash In/Out are manual drawer adjustments for the whole shift — not tied to product or repair sales specifically.</p>
            )}
          </div>

          {/* Repair sales tender breakdown */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Repair Sales Detail</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ['Cash Sales',         zReport.repair_cash_sales ?? 0],
                ['Card Sales',         zReport.repair_card_sales ?? 0],
                ['Store Credit',       zReport.repair_store_credit_sales ?? 0],
                ['Loyalty Points',     zReport.repair_loyalty_points_sales ?? 0],
                ['Other (pickup etc)', zReport.repair_other_sales ?? 0],
                ['Refunds',            -(zReport.repair_refunds ?? 0)],
              ] as [string, number][]).map(([l, v]) => (
                <div key={l} className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-xs text-gray-500">{l}</p>
                  <p className={`mt-0.5 font-semibold ${l === 'Refunds' && v < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(v)}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400 italic">Cash/Card reflects deposits only — pickup payments have no recorded tender yet.</p>
          </div>

          {/* Store credit / loyalty redemption trail for this shift */}
          {(zReport.credit_activity?.length ?? 0) > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Credit &amp; Loyalty Activity</p>
                <Link href="/credits" className="text-xs font-medium text-brand-teal hover:underline">View Full History</Link>
              </div>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                {zReport.credit_activity!.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{entry.customer_name || 'Unknown customer'}</p>
                      <p className="text-xs text-gray-500">
                        {entry.type === 'store_credit' ? 'Store Credit' : 'Loyalty Points'} · {entry.reference_type} #{entry.reference_id.slice(-8)}
                      </p>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {entry.type === 'store_credit' ? formatCurrency(entry.amount) : `${entry.amount} pts`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cash drawer reconciliation */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Cash Reconciliation</p>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                {([
                  ['Opening Float', zReport.opening_float],
                  ['Expected Cash', zReport.expected_cash],
                  ['Closing Cash',  zReport.closing_cash],
                ] as [string, number | undefined][]).map(([l, v]) => (
                  <div key={l}>
                    <p className="text-xs text-gray-500">{l}</p>
                    <p className="mt-0.5 font-semibold text-gray-900">{formatCurrency(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              <div className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3 ${(zReport.variance ?? 0) < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <span className={`text-sm font-medium ${(zReport.variance ?? 0) < 0 ? 'text-red-700' : 'text-green-700'}`}>Difference (Over/Short)</span>
                <span className={`text-lg font-bold ${(zReport.variance ?? 0) < 0 ? 'text-red-700' : 'text-green-700'}`}>{formatCurrency(zReport.variance ?? 0)}</span>
              </div>
              <p className="mt-2 text-xs text-gray-400 italic">Reflects cash-drawer transactions: product/service sales and repair deposits paid in cash. Repair balances collected outside POS aren&apos;t captured with a payment method today, so they&apos;re shown above for information only and excluded here.</p>
              <p className="mt-2 text-xs text-gray-400">Transactions: {zReport.transaction_count ?? 0}</p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
            {zReport.session_id && (
              <Link href={`/reports/z-report?session=${zReport.session_id}`} className="sm:flex-1">
                <Button variant="outline" className="w-full">View Full Z-Report</Button>
              </Link>
            )}
            <Button className="sm:flex-1" onClick={onClose}>Done</Button>
          </div>
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

          <div className="rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
            <div className="flex items-center justify-between text-gray-600">
              <span>Expected Cash</span>
              <span className="font-semibold text-gray-900">
                {expectedCashLoading ? 'Calculating…' : formatCurrency(expectedCash ?? 0)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between font-semibold text-gray-900">
              <span>Verified Total</span>
              <span className="text-base">{formatCurrency(verifiedTotal)}</span>
            </div>
            {difference !== null && (
              <div className={`mt-1.5 flex items-center justify-between border-t border-gray-200 pt-1.5 text-sm font-semibold ${difference < 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>Difference</span>
                <span>{formatCurrency(difference)}</span>
              </div>
            )}
          </div>

          <div>
            <label className={`mb-1 block text-xs font-medium ${hasDiscrepancy ? 'text-amber-700' : 'text-gray-600'}`}>
              {hasDiscrepancy ? (
                <>
                  Discrepancy Note <span className="text-red-500">*</span>
                  <span className="ml-1 text-amber-600">(difference: {formatCurrency(difference ?? 0)})</span>
                </>
              ) : (
                'Note (optional)'
              )}
            </label>
            <textarea
              rows={2}
              placeholder={hasDiscrepancy ? "Explain the discrepancy (e.g. 'Gave incorrect change on a return')" : 'Add a note about discrepancies or cash counts…'}
              value={closingNote}
              onChange={e => setClosingNote(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                hasDiscrepancy ? 'border-amber-300 focus:border-amber-500' : 'border-gray-300 focus:border-brand-teal'
              }`}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1"
              loading={sessionProcessing}
              disabled={hasDiscrepancy && !closingNote.trim()}
              onClick={handleCloseRegister}
            >
              End Shift &amp; Z-Report
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
