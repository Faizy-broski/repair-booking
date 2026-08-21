'use client'
import { useState } from 'react'
import { AlertTriangle, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'
import { DENOMINATIONS, denomTotal, type ZReport } from '../../_types'

interface SessionStats {
  total_sales: number; repair_sales: number; total_refunds: number; repair_refunds: number
  store_credit_sales: number; loyalty_points_sales: number; on_account_sales: number
  repair_cash_sales: number; repair_card_sales: number
  repair_store_credit_sales: number; repair_loyalty_points_sales: number; repair_other_sales: number
  cash_sales: number; card_sales: number; other_sales: number
  cash_in: number; cash_out: number; buyback_out: number
  credit_repayments_cash: number; credit_repayments_total: number
  expected_cash: number; opening_float: number; expenses?: number
}

interface Props {
  open: boolean
  onClose: () => void
  zReport: ZReport | null
  sessionProcessing: boolean
  closingDenoms: Record<string, number>
  setClosingDenoms: React.Dispatch<React.SetStateAction<Record<string, number>>>
  closingCardTotal: string
  setClosingCardTotal: (v: string) => void
  closingNote: string
  setClosingNote: (v: string) => void
  handleCloseRegister: () => void
  expectedCash: number | null
  expectedCashLoading: boolean
  sessionStats: SessionStats | null
}

export function CloseRegisterModal({
  open, onClose, zReport, sessionProcessing,
  closingDenoms, setClosingDenoms, closingCardTotal, setClosingCardTotal, closingNote, setClosingNote, handleCloseRegister,
  expectedCash, expectedCashLoading, sessionStats,
}: Props) {
  const verifiedTotal = denomTotal(closingDenoms) + (parseFloat(closingCardTotal) || 0)
  const difference = expectedCash !== null ? verifiedTotal - expectedCash : null
  const hasDiscrepancy = difference !== null && Math.abs(difference) > 0.01
  const [showBreakdown, setShowBreakdown] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title="End Shift" size={zReport ? 'xl' : showBreakdown ? 'xl' : 'sm'}>
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
                  {formatCurrency(zReport.grand_total ?? (zReport.total_sales ?? 0) + (zReport.repair_sales ?? 0) - (zReport.repair_refunds ?? 0) - (zReport.total_refunds ?? 0))}
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
              {(zReport.buyback_out ?? 0) > 0 && (
                <div className="rounded-xl border border-pink-200 bg-pink-50 p-3">
                  <p className="text-xs text-pink-700">Buyback</p>
                  <p className="mt-0.5 font-semibold text-pink-700">-{formatCurrency(zReport.buyback_out ?? 0)}</p>
                </div>
              )}
              {(zReport.credit_repayments_cash ?? 0) > 0 && (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                  <p className="text-xs text-cyan-700">Credit Repaid (Cash)</p>
                  <p className="mt-0.5 font-semibold text-cyan-700">+{formatCurrency(zReport.credit_repayments_cash ?? 0)}</p>
                </div>
              )}
              {(zReport.expenses ?? 0) > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs text-rose-700">Expense</p>
                  <p className="mt-0.5 font-semibold text-rose-700">-{formatCurrency(zReport.expenses ?? 0)}</p>
                </div>
              )}
            </div>
            {(zReport.expenses ?? 0) > 0 && (
              <p className="mt-2 text-xs text-gray-400 italic">Expense reflects business expenses logged for this branch since the shift opened — shown for information only and excluded from the cash reconciliation below (cash-drawer expenses are already captured in Cash Out).</p>
            )}
            {((zReport.cash_in ?? 0) > 0 || (zReport.cash_out ?? 0) > 0) && (
              <p className="mt-2 text-xs text-gray-400 italic">Cash In/Out are manual drawer adjustments for the whole shift — not tied to product or repair sales specifically. Buyback is a subset of Cash Out, shown separately for clarity.</p>
            )}
            {(zReport.credit_repayments_cash ?? 0) > 0 && (
              <p className="mt-1 text-xs text-gray-400 italic">Credit Repaid (Cash) is cash collected today against a balance sold in a prior shift — it affects Expected Cash but is not new revenue this shift.</p>
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
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {([
                  ['Opening Float', zReport.opening_float],
                  ['Expected Cash', zReport.expected_cash],
                  ['Closing Cash',  zReport.closing_cash],
                  ['Card Total',    zReport.closing_card_total],
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
              <p className="mt-2 text-xs text-gray-400 italic">Expected Cash includes both cash and card takings; Closing Cash is what was physically counted and Card Total is what was entered from the card machine&apos;s report. Repair balances collected outside POS aren&apos;t captured with a payment method today, so they&apos;re shown above for information only and excluded here.</p>
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
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {DENOMINATIONS.map(d => (
                <div key={d.value} className="flex min-w-0 flex-col gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm">
                  <span className="truncate text-[10px] font-bold text-gray-400 uppercase text-center">{d.label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const v = (closingDenoms[String(d.value)] ?? 0)
                        if (v > 0) setClosingDenoms(prev => ({ ...prev, [String(d.value)]: v - 1 }))
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-600 hover:bg-gray-200 sm:h-6 sm:w-6"
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
                      className="h-7 w-full min-w-0 bg-transparent text-center text-sm font-bold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none sm:h-6"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = (closingDenoms[String(d.value)] ?? 0)
                        setClosingDenoms(prev => ({ ...prev, [String(d.value)]: v + 1 }))
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 sm:h-6 sm:w-6"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Card Total</p>
            <input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={closingCardTotal}
              onChange={e => setClosingCardTotal(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">Enter today&apos;s total card payments from your card machine&apos;s report — Expected Cash now includes card takings, so this is needed to verify against it.</p>
          </div>

          {sessionStats && (() => {
            // Pure revenue (product + repair, less refunds) — Cash In/Out are
            // manual drawer adjustments, shown as their own tiles instead of
            // being blended into this figure.
            const netSales = (sessionStats.total_sales - sessionStats.total_refunds)
              + (sessionStats.repair_sales - sessionStats.repair_refunds)
            return (
              <div>
                <button
                  type="button"
                  onClick={() => setShowBreakdown(v => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50"
                >
                  View Full Breakdown
                  {showBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showBreakdown && (
                  <div className="mt-2 space-y-4">
                    {/* Sales breakdown: product vs repair */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Sales Breakdown</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                          <p className="text-xs font-medium text-gray-500">Product Sales</p>
                          <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(sessionStats.total_sales ?? 0)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                          <p className="text-xs font-medium text-gray-500">Repair Sales</p>
                          <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(sessionStats.repair_sales ?? 0)}</p>
                          {(sessionStats.repair_refunds ?? 0) > 0 && (
                            <p className="mt-0.5 text-xs text-red-600">-{formatCurrency(sessionStats.repair_refunds ?? 0)} refunded</p>
                          )}
                        </div>
                        <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-4">
                          <p className="text-xs font-medium text-brand-teal">Total</p>
                          <p className="mt-1 text-xl font-semibold text-brand-teal">{formatCurrency(netSales)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Cash flow for the shift so far */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Cash Flow</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {([
                          ['Cash Sales',     sessionStats.cash_sales ?? 0],
                          ['Card Sales',     sessionStats.card_sales ?? 0],
                          ['Store Credit',   sessionStats.store_credit_sales ?? 0],
                          ['Loyalty Points', sessionStats.loyalty_points_sales ?? 0],
                          ['Other',          sessionStats.other_sales ?? 0],
                          ['Refunds',        -(sessionStats.total_refunds ?? 0)],
                        ] as [string, number][]).map(([l, v]) => (
                          <div key={l} className="rounded-xl border border-gray-200 bg-white p-3">
                            <p className="text-xs text-gray-500">{l}</p>
                            <p className={`mt-0.5 font-semibold ${l === 'Refunds' && v < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(v)}</p>
                          </div>
                        ))}
                        {(sessionStats.cash_in ?? 0) > 0 && (
                          <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                            <p className="text-xs text-green-700">Cash In</p>
                            <p className="mt-0.5 font-semibold text-green-700">+{formatCurrency(sessionStats.cash_in ?? 0)}</p>
                          </div>
                        )}
                        {(sessionStats.cash_out ?? 0) > 0 && (
                          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                            <p className="text-xs text-orange-700">Cash Out</p>
                            <p className="mt-0.5 font-semibold text-orange-700">-{formatCurrency(sessionStats.cash_out ?? 0)}</p>
                          </div>
                        )}
                        {(sessionStats.buyback_out ?? 0) > 0 && (
                          <div className="rounded-xl border border-pink-200 bg-pink-50 p-3">
                            <p className="text-xs text-pink-700">Buyback</p>
                            <p className="mt-0.5 font-semibold text-pink-700">-{formatCurrency(sessionStats.buyback_out ?? 0)}</p>
                          </div>
                        )}
                        {(sessionStats.credit_repayments_cash ?? 0) > 0 && (
                          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                            <p className="text-xs text-cyan-700">Credit Repaid (Cash)</p>
                            <p className="mt-0.5 font-semibold text-cyan-700">+{formatCurrency(sessionStats.credit_repayments_cash ?? 0)}</p>
                          </div>
                        )}
                        {(sessionStats.expenses ?? 0) > 0 && (
                          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <p className="text-xs text-rose-700">Expense</p>
                            <p className="mt-0.5 font-semibold text-rose-700">-{formatCurrency(sessionStats.expenses ?? 0)}</p>
                          </div>
                        )}
                      </div>
                      {(sessionStats.expenses ?? 0) > 0 && (
                        <p className="mt-2 text-xs text-gray-400 italic">Expense reflects business expenses logged for this branch since the shift opened — shown for information only and excluded from the cash reconciliation below (cash-drawer expenses are already captured in Cash Out).</p>
                      )}
                      {((sessionStats.cash_in ?? 0) > 0 || (sessionStats.cash_out ?? 0) > 0) && (
                        <p className="mt-2 text-xs text-gray-400 italic">Cash In/Out are manual drawer adjustments for the whole shift — not tied to product or repair sales specifically. Buyback is a subset of Cash Out, shown separately for clarity.</p>
                      )}
                      {(sessionStats.credit_repayments_cash ?? 0) > 0 && (
                        <p className="mt-1 text-xs text-gray-400 italic">Credit Repaid (Cash) is cash collected today against a balance sold in a prior shift — it affects Expected Cash but is not new revenue this shift.</p>
                      )}
                    </div>

                    {/* Repair sales tender breakdown */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Repair Sales Detail</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {([
                          ['Cash Sales',         sessionStats.repair_cash_sales ?? 0],
                          ['Card Sales',         sessionStats.repair_card_sales ?? 0],
                          ['Store Credit',       sessionStats.repair_store_credit_sales ?? 0],
                          ['Loyalty Points',     sessionStats.repair_loyalty_points_sales ?? 0],
                          ['Other (pickup etc)', sessionStats.repair_other_sales ?? 0],
                          ['Refunds',            -(sessionStats.repair_refunds ?? 0)],
                        ] as [string, number][]).map(([l, v]) => (
                          <div key={l} className="rounded-xl border border-gray-200 bg-white p-3">
                            <p className="text-xs text-gray-500">{l}</p>
                            <p className={`mt-0.5 font-semibold ${l === 'Refunds' && v < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(v)}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-gray-400 italic">Cash/Card reflects deposits only — pickup payments have no recorded tender yet.</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

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
