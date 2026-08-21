'use client'
import { useState, useEffect, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Download, ArrowLeft, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import { toast } from 'sonner'
import type { ZReport } from '../../pos/_types'

interface RegisterSession {
  id: string; cashier_id: string; opening_float: number; closing_cash: number | null
  closing_card_total: number | null
  expected_cash: number | null; variance: number | null; total_sales: number | null
  total_refunds: number | null; cash_sales: number | null; card_sales: number | null
  other_sales: number | null; transaction_count: number | null
  repair_sales: number | null; repair_refunds: number | null; repair_transaction_count: number | null
  repair_cash_sales: number | null; repair_card_sales: number | null; repair_other_sales: number | null
  opened_at: string; closed_at: string | null; status: string
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }

async function exportZReportExcel(sessions: RegisterSession[], filename: string) {
  if (!sessions.length) return
  const XLSX = await import('xlsx')

  const rows = sessions.map((s) => ({
    'Opened':                s.opened_at ? new Date(s.opened_at).toLocaleString('en-GB') : '',
    'Closed':                s.closed_at ? new Date(s.closed_at).toLocaleString('en-GB') : 'Still open',
    'Status':                s.status,
    'Opening Float':         s.opening_float ?? 0,
    'Product Sales':         s.total_sales ?? 0,
    'Product Cash Sales':    s.cash_sales ?? 0,
    'Product Card Sales':    s.card_sales ?? 0,
    'Product Other Sales':   s.other_sales ?? 0,
    'Product Refunds':       s.total_refunds ?? 0,
    'Product Transactions':  s.transaction_count ?? 0,
    'Repair Sales':          s.repair_sales ?? 0,
    'Repair Cash Sales':     s.repair_cash_sales ?? 0,
    'Repair Card Sales':     s.repair_card_sales ?? 0,
    'Repair Other Sales':    s.repair_other_sales ?? 0,
    'Repair Refunds':        s.repair_refunds ?? 0,
    'Repair Transactions':   s.repair_transaction_count ?? 0,
    'Grand Total':           (s.total_sales ?? 0) + (s.repair_sales ?? 0) - (s.repair_refunds ?? 0) - (s.total_refunds ?? 0),
    'Expected Cash':         s.expected_cash ?? 0,
    'Closing Cash':          s.closing_cash ?? 0,
    'Card Total':            s.closing_card_total ?? 0,
    'Variance (Over/Short)': s.variance ?? 0,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Z-Report')

  const keys = Object.keys(rows[0])
  ws['!cols'] = keys.map((key) => ({
    wch: Math.max(key.length, ...rows.map((r: any) => String(r[key] ?? '').length)) + 2,
  }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function ZReportPageInner() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [openingFloat, setOpeningFloat] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [closingCardTotal, setClosingCardTotal] = useState('')
  const [closingNote, setClosingNote] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)
  const [zReportData, setZReportData] = useState<ZReport | null>(null)
  const [detailSession, setDetailSession] = useState<RegisterSession | null>(null)
  const searchParams = useSearchParams()

  const { data: cashMovements = [], isLoading: movementsLoading } = useQuery<any[]>({
    queryKey: ['session-movements', detailSession?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pos/session/movements?session_id=${detailSession!.id}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!detailSession?.id,
    staleTime: 0,
  })

  // register_sessions' sales/expected-cash columns are only populated by
  // close_register_session() at close time -- for a still-open session
  // they're genuinely NULL in the DB. Pull the live preview instead so this
  // modal doesn't show a misleading £0.00/"—" for an open register (the POS
  // page's Close Register modal already shows the correct live figure here).
  const isDetailSessionOpen = detailSession?.status === 'open'
  const { data: liveExpected, isLoading: liveExpectedLoading } = useQuery<any>({
    queryKey: ['session-expected-cash', detailSession?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pos/session/${detailSession!.id}/expected-cash`)
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!detailSession?.id && isDetailSessionOpen,
    staleTime: 0,
  })
  const useLive = isDetailSessionOpen && !!liveExpected
  const display = detailSession ? {
    total_sales:              useLive ? liveExpected.total_sales : detailSession.total_sales,
    transaction_count:        useLive ? liveExpected.transaction_count : detailSession.transaction_count,
    repair_sales:             useLive ? liveExpected.repair_sales : detailSession.repair_sales,
    repair_transaction_count: useLive ? liveExpected.repair_transaction_count : detailSession.repair_transaction_count,
    repair_refunds:           useLive ? liveExpected.repair_refunds : detailSession.repair_refunds,
    cash_sales:                useLive ? liveExpected.cash_sales : detailSession.cash_sales,
    card_sales:                useLive ? liveExpected.card_sales : detailSession.card_sales,
    other_sales:               useLive ? liveExpected.other_sales : detailSession.other_sales,
    total_refunds:             useLive ? liveExpected.total_refunds : detailSession.total_refunds,
    repair_cash_sales:         useLive ? liveExpected.repair_cash_sales : detailSession.repair_cash_sales,
    repair_card_sales:         useLive ? liveExpected.repair_card_sales : detailSession.repair_card_sales,
    repair_other_sales:        useLive ? liveExpected.repair_other_sales : detailSession.repair_other_sales,
    opening_float:             detailSession.opening_float,
    expected_cash:             useLive ? liveExpected.expected_cash : detailSession.expected_cash,
    closing_cash:              detailSession.closing_cash,
    closing_card_total:        detailSession.closing_card_total,
    variance:                  detailSession.variance,
  } : null

  const zReportSessionId = zReportData?.session_id
  const { data: zReportMovements = [] } = useQuery<any[]>({
    queryKey: ['session-movements', zReportSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/pos/session/movements?session_id=${zReportSessionId}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!zReportSessionId,
    staleTime: 0,
  })

  const { data: sessions = [], isLoading: loading, refetch: refetchSessions } = useQuery<RegisterSession[]>({
    queryKey: ['report-sessions', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'sessions', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
  })

  // Deep link from the POS close-register modal's "View Full Z-Report" button
  useEffect(() => {
    const sessionId = searchParams.get('session')
    if (!sessionId || sessions.length === 0) return
    const match = sessions.find((s) => s.id === sessionId)
    if (match) setDetailSession(match)
  }, [searchParams, sessions])

  const { data: currentSession = null } = useQuery<RegisterSession | null>({
    queryKey: ['report-pos-session', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pos/session?branch_id=${activeBranch!.id}`)
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 0,
  })

  async function handleOpenSession() {
    setSessionLoading(true)
    const res = await fetch('/api/pos/session/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0, branch_id: activeBranch?.id }),
    })
    if (res.ok) {
      setOpenModal(false)
      setOpeningFloat('')
      queryClient.invalidateQueries({ queryKey: ['report-pos-session', activeBranch?.id] })
    }
    setSessionLoading(false)
  }

  async function handleCloseSession() {
    if (!currentSession) return
    setSessionLoading(true)
    const res = await fetch('/api/pos/session/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: currentSession.id,
        closing_cash: parseFloat(closingCash) || 0,
        closing_card_total: parseFloat(closingCardTotal) || 0,
        closing_note: closingNote || undefined,
      }),
    })
    if (res.ok) {
      const json = await res.json()
      setZReportData(json.data)
      setCloseModal(false)
      setClosingCash('')
      setClosingCardTotal('')
      setClosingNote('')
      queryClient.invalidateQueries({ queryKey: ['report-pos-session', activeBranch?.id] })
      queryClient.invalidateQueries({ queryKey: ['report-sessions', activeBranch?.id] })
    } else {
      const json = await res.json().catch(() => null)
      toast.error(json?.error?.message ?? 'Failed to close register.')
    }
    setSessionLoading(false)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
              <ArrowLeft className="h-5 w-5" strokeWidth={3} />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Z-Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Daily register sessions and cash variance</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => exportZReportExcel(sessions, `z-report-${dateFrom}-${dateTo}.xlsx`)}>
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </div>

      {/* Register control ribbon */}
      {currentSession ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              Register open — Float: {formatCurrency(currentSession.opening_float)} · Since {formatDate(currentSession.opened_at)}
            </span>
          </div>
          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setCloseModal(true)}>Close Register (Z-Report)</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
          <span className="text-sm text-on-surface-variant">No register session open</span>
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setOpenModal(true)}>Open Register</Button>
        </div>
      )}

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetchSessions} />

      {/* Z-Report result */}
      {zReportData && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-blue-900">Z-Report — Register Closed</h3>
            <Button size="sm" variant="outline" onClick={() => setZReportData(null)}>Dismiss</Button>
          </div>
          <div className="mb-3 rounded-lg border border-blue-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sales Breakdown</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-xs text-gray-500">Product Sales</p><p className="font-semibold text-gray-900">{formatCurrency(zReportData.total_sales ?? 0)}</p></div>
              <div><p className="text-xs text-gray-500">Repair Sales</p><p className="font-semibold text-gray-900">{formatCurrency(zReportData.repair_sales ?? 0)}</p></div>
              <div><p className="text-xs text-gray-500">Total</p><p className="font-semibold text-blue-900">{formatCurrency(zReportData.grand_total ?? (zReportData.total_sales ?? 0) + (zReportData.repair_sales ?? 0) - (zReportData.repair_refunds ?? 0) - (zReportData.total_refunds ?? 0))}</p></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {([
              { label: 'Opening Float',  value: zReportData.opening_float },
              { label: 'Total Refunds',  value: zReportData.total_refunds },
              { label: 'Cash Sales',     value: zReportData.cash_sales },
              { label: 'Card Sales',     value: zReportData.card_sales },
              { label: 'Transactions',   value: zReportData.transaction_count, isCurrency: false },
              { label: 'Expected Cash',  value: zReportData.expected_cash },
              { label: 'Closing Cash',   value: zReportData.closing_cash },
              { label: 'Card Total',     value: zReportData.closing_card_total },
              { label: 'Variance',       value: zReportData.variance, highlight: true },
            ] as { label: string; value: number | undefined; isCurrency?: boolean; highlight?: boolean }[]).map(({ label, value, isCurrency = true, highlight }) => (
              <div key={label} className={`rounded-lg border bg-white p-3 ${highlight && (value ?? 0) !== 0 ? 'border-red-300' : 'border-gray-200'}`}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`mt-0.5 font-semibold ${highlight && (value ?? 0) !== 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {isCurrency ? formatCurrency(value ?? 0) : String(value ?? 0)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400 italic">Reflects cash-drawer transactions: product/service sales and repair deposits paid in cash. Repair balances collected outside POS aren't captured with a payment method today, so they're excluded here.</p>

          {zReportMovements.length > 0 && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Cash Movements</p>
              <div className="space-y-1.5">
                {zReportMovements.map((m: any) => (
                  <div key={m.id} className="flex items-start justify-between text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${m.type === 'cash_in' ? 'text-green-600' : 'text-orange-600'}`}>
                          {m.type === 'cash_in' ? '+ Cash In' : '− Cash Out'}
                        </span>
                        {m.purpose && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-500">{m.purpose}</span>}
                        {m.purpose === 'plain' && <span className="text-[10px] italic text-amber-600">(not in reports)</span>}
                      </div>
                      {m.notes && <span className="text-xs text-gray-400 truncate">{m.notes}</span>}
                      <p className="text-[10px] text-gray-400">
                        {new Date(m.created_at).toLocaleString('en-GB')} · {m.profiles?.full_name ?? 'Unknown'}
                      </p>
                    </div>
                    <span className={`font-semibold shrink-0 ${m.type === 'cash_in' ? 'text-green-600' : 'text-orange-600'}`}>
                      {m.type === 'cash_in' ? '+' : '−'}{formatCurrency(m.amount)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-1.5 flex justify-between text-xs font-semibold text-gray-700">
                  <span>Net Cash Movement</span>
                  <span>{formatCurrency(zReportMovements.reduce((s: number, m: any) => s + (m.type === 'cash_in' ? m.amount : -m.amount), 0))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sessions table */}
      <div className="rounded-xl border border-outline-variant bg-surface overflow-hidden">
        <div className="border-b border-outline-variant px-4 py-3">
          <h3 className="font-semibold text-on-surface text-base">Register Sessions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-xs text-on-surface-variant">
              <tr>
                <th className="px-4 py-2 text-left">Opened</th>
                <th className="px-4 py-2 text-left">Closed</th>
                <th className="px-4 py-2 text-right">Float</th>
                <th className="px-4 py-2 text-right">Total Sales</th>
                <th className="px-4 py-2 text-right">Cash</th>
                <th className="px-4 py-2 text-right">Card</th>
                <th className="px-4 py-2 text-right">Variance</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">Loading…</td></tr>
              )}
              {!loading && sessions.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">No register sessions in this period.</td></tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} onClick={() => setDetailSession(s)} className="hover:bg-surface-container-low cursor-pointer">
                  <td className="px-4 py-3 text-on-surface">{formatDate(s.opened_at)}</td>
                  <td className="px-4 py-3 text-on-surface">{s.closed_at ? formatDate(s.closed_at) : '—'}</td>
                  <td className="px-4 py-3 text-right text-on-surface">{formatCurrency(s.opening_float)}</td>
                  <td className="px-4 py-3 text-right text-on-surface">{s.total_sales != null ? formatCurrency(s.total_sales) : '—'}</td>
                  <td className="px-4 py-3 text-right text-on-surface">{s.cash_sales != null ? formatCurrency(s.cash_sales) : '—'}</td>
                  <td className="px-4 py-3 text-right text-on-surface">{s.card_sales != null ? formatCurrency(s.card_sales) : '—'}</td>
                  <td className={`px-4 py-3 text-right font-medium ${(s.variance ?? 0) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {s.variance != null ? formatCurrency(s.variance) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={s.status === 'open' ? 'warning' : 'default'}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session Detail Modal */}
      <Modal open={!!detailSession} onClose={() => setDetailSession(null)} title="Session Z-Report" size="xl">
        {detailSession && display && (
          <div className="space-y-5 text-sm">
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>Opened: {new Date(detailSession.opened_at).toLocaleString()}</span>
              <span className="flex items-center gap-2">
                {detailSession.closed_at ? `Closed: ${new Date(detailSession.closed_at).toLocaleString()}` : 'Still open'}
                {isDetailSessionOpen && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    {liveExpectedLoading ? 'Loading live figures…' : 'Live — register still open'}
                  </span>
                )}
              </span>
            </div>

            {isDetailSessionOpen && !liveExpectedLoading && !liveExpected && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Couldn't load live figures for this open session — the numbers below may be incomplete until it's closed.
              </p>
            )}

            {/* Sales breakdown: product vs repair */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Sales Breakdown</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-outline-variant bg-surface p-4">
                  <p className="text-xs font-medium text-on-surface-variant">Product Sales</p>
                  <p className="mt-1 text-xl font-semibold text-on-surface">{formatCurrency(display.total_sales ?? 0)}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">{display.transaction_count ?? 0} transactions</p>
                </div>
                <div className="rounded-xl border border-outline-variant bg-surface p-4">
                  <p className="text-xs font-medium text-on-surface-variant">Repair Sales</p>
                  <p className="mt-1 text-xl font-semibold text-on-surface">{formatCurrency(display.repair_sales ?? 0)}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">{display.repair_transaction_count ?? 0} transactions</p>
                  {(display.repair_refunds ?? 0) > 0 && (
                    <p className="mt-0.5 text-xs text-red-600">-{formatCurrency(display.repair_refunds ?? 0)} refunded</p>
                  )}
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-medium text-blue-700">Grand Total</p>
                  <p className="mt-1 text-xl font-semibold text-blue-900">
                    {formatCurrency((display.total_sales ?? 0) + (display.repair_sales ?? 0) - (display.repair_refunds ?? 0) - (display.total_refunds ?? 0))}
                  </p>
                </div>
              </div>
            </div>

            {/* Product sales detail + repair sales detail + cash reconciliation */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-surface-container-low p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-3">Product Sales Detail</p>
                {([
                  ['Cash Sales',   display.cash_sales,   false],
                  ['Card Sales',   display.card_sales,   false],
                  ['Other Sales',  display.other_sales,  false],
                  ['Refunds',      display.total_refunds, true],
                ] as [string, number | null, boolean][]).map(([label, val, isNeg]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-on-surface-variant">{label}</span>
                    <span className={isNeg && (val ?? 0) > 0 ? 'text-red-600' : 'text-on-surface'}>
                      {isNeg && (val ?? 0) > 0 ? '-' : ''}{formatCurrency(val ?? 0)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-surface-container-low p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-3">Repair Sales Detail</p>
                {([
                  ['Cash Sales',        display.repair_cash_sales,  false],
                  ['Card Sales',        display.repair_card_sales,  false],
                  ['Other (pickup etc)', display.repair_other_sales, false],
                  ['Refunds',           display.repair_refunds,     true],
                ] as [string, number | null, boolean][]).map(([label, val, isNeg]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-on-surface-variant">{label}</span>
                    <span className={isNeg && (val ?? 0) > 0 ? 'text-red-600' : 'text-on-surface'}>
                      {isNeg && (val ?? 0) > 0 ? '-' : ''}{formatCurrency(val ?? 0)}
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[10px] text-on-surface-variant italic">Cash/Card reflects deposits only — pickup payments have no recorded tender yet.</p>
              </div>

              <div className="rounded-xl bg-surface-container-low p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-3">Cash Reconciliation</p>
                {([
                  ['Opening Float',  display.opening_float, false],
                  ['Expected Cash',  display.expected_cash, false],
                  ['Closing Cash',   display.closing_cash,  false],
                  ['Card Total',     display.closing_card_total, false],
                ] as [string, number | null, boolean][]).map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-on-surface-variant">{label}</span>
                    <span className="text-on-surface">{val != null ? formatCurrency(val) : '—'}</span>
                  </div>
                ))}
                <div className={`flex justify-between font-semibold border-t border-outline-variant pt-2 mt-1 ${(display.variance ?? 0) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                  <span>Variance (Over/Short)</span>
                  <span>{display.variance != null ? formatCurrency(display.variance) : (isDetailSessionOpen ? 'Register still open' : '—')}</span>
                </div>
              </div>
            </div>
            <p className="-mt-3 text-xs text-on-surface-variant italic">Reflects cash-drawer transactions: product/service sales and repair deposits paid in cash. Repair balances collected outside POS aren't captured with a payment method today, so they're excluded here.</p>

            <div className="rounded-xl bg-surface-container-low p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-3">Cash Movements</p>
              {movementsLoading ? (
                <p className="text-xs text-on-surface-variant text-center py-2">Loading…</p>
              ) : cashMovements.length === 0 ? (
                <p className="text-xs text-on-surface-variant text-center py-2">No cash movements recorded</p>
              ) : (
                <div className="space-y-2">
                  {cashMovements.map((m: any) => (
                    <div key={m.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${m.type === 'cash_in' ? 'text-green-600' : 'text-orange-600'}`}>
                            {m.type === 'cash_in' ? '+ Cash In' : '− Cash Out'}
                          </span>
                          {m.purpose && <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-medium capitalize text-on-surface-variant">{m.purpose}</span>}
                          {m.purpose === 'plain' && <span className="text-[10px] italic text-amber-600">(not in reports)</span>}
                        </div>
                        {m.notes && <p className="text-xs text-on-surface-variant truncate">{m.notes}</p>}
                        <p className="text-[10px] text-on-surface-variant">
                          {new Date(m.created_at).toLocaleTimeString()} · {m.profiles?.full_name ?? 'Unknown'}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${m.type === 'cash_in' ? 'text-green-600' : 'text-orange-600'}`}>
                        {m.type === 'cash_in' ? '+' : '−'}{formatCurrency(m.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-outline-variant pt-2 flex justify-between font-semibold text-xs">
                    <span>Net Cash Movement</span>
                    <span className={cashMovements.reduce((sum: number, m: any) => sum + (m.type === 'cash_in' ? m.amount : -m.amount), 0) >= 0 ? 'text-green-600' : 'text-orange-600'}>
                      {formatCurrency(cashMovements.reduce((sum: number, m: any) => sum + (m.type === 'cash_in' ? m.amount : -m.amount), 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <Button className="w-full" onClick={() => setDetailSession(null)}>Close</Button>
          </div>
        )}
      </Modal>

      {/* Open Register Modal */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Open Register" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Opening Float (£)</label>
            <input type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0.00" className="h-10 w-full rounded-lg border border-outline px-3 text-sm bg-surface text-on-surface" />
          </div>
          <Button className="w-full" loading={sessionLoading} onClick={handleOpenSession}>Open Register</Button>
        </div>
      </Modal>

      {/* Close Register Modal */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Close Register — Z-Report" size="sm">
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-container p-3 text-sm">
            <p className="text-on-surface-variant">Opening float: <strong className="text-on-surface">{formatCurrency(currentSession?.opening_float ?? 0)}</strong></p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Cash in Drawer (£)</label>
            <input type="number" min="0" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="0.00" className="h-10 w-full rounded-lg border border-outline px-3 text-sm bg-surface text-on-surface" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Card Total (£)</label>
            <input type="number" min="0" step="0.01" value={closingCardTotal} onChange={(e) => setClosingCardTotal(e.target.value)} placeholder="0.00" className="h-10 w-full rounded-lg border border-outline px-3 text-sm bg-surface text-on-surface" />
            <p className="mt-1 text-xs text-on-surface-variant">Today's total card payments from your card machine's report — Expected Cash includes card takings.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Reason for discrepancy (required only if counted cash + card doesn't match Expected Cash)</label>
            <textarea
              rows={2}
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              placeholder="e.g. Till float short from earlier float top-up"
              className="w-full rounded-lg border border-outline px-3 py-2 text-sm bg-surface text-on-surface"
            />
          </div>
          <Button className="w-full" loading={sessionLoading} onClick={handleCloseSession}>Generate Z-Report & Close</Button>
        </div>
      </Modal>
    </div>
  )
}

export default function ZReportPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-gray-400">Loading...</div>}>
      <ZReportPageInner />
    </Suspense>
  )
}
