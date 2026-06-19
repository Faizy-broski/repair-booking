'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ArrowLeft, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'

interface RegisterSession {
  id: string; cashier_id: string; opening_float: number; closing_cash: number | null
  expected_cash: number | null; variance: number | null; total_sales: number | null
  total_refunds: number | null; cash_sales: number | null; card_sales: number | null
  other_sales: number | null; transaction_count: number | null
  opened_at: string; closed_at: string | null; status: string
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  if (!rows.length) return
  const h = Object.keys(rows[0])
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
}

export default function ZReportPage() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [openingFloat, setOpeningFloat] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)
  const [zReportData, setZReportData] = useState<Record<string, unknown> | null>(null)
  const [detailSession, setDetailSession] = useState<RegisterSession | null>(null)

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

  const zReportSessionId = (zReportData?.id ?? zReportData?.session_id) as string | undefined
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
      body: JSON.stringify({ session_id: currentSession.id, closing_cash: parseFloat(closingCash) || 0 }),
    })
    if (res.ok) {
      const json = await res.json()
      setZReportData(json.data)
      setCloseModal(false)
      setClosingCash('')
      queryClient.invalidateQueries({ queryKey: ['report-pos-session', activeBranch?.id] })
      queryClient.invalidateQueries({ queryKey: ['report-sessions', activeBranch?.id] })
    }
    setSessionLoading(false)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Z-Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Daily register sessions and cash variance</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => exportCsv(sessions as unknown as Record<string, unknown>[], `z-report-${dateFrom}-${dateTo}.csv`)}>
          <Download className="h-4 w-4" /> Export CSV
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
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {([
              { label: 'Opening Float',  key: 'opening_float' },
              { label: 'Total Sales',    key: 'total_sales' },
              { label: 'Total Refunds',  key: 'total_refunds' },
              { label: 'Cash Sales',     key: 'cash_sales' },
              { label: 'Card Sales',     key: 'card_sales' },
              { label: 'Transactions',   key: 'transaction_count', isCurrency: false },
              { label: 'Expected Cash',  key: 'expected_cash' },
              { label: 'Closing Cash',   key: 'closing_cash' },
              { label: 'Variance',       key: 'variance', highlight: true },
            ] as { label: string; key: string; isCurrency?: boolean; highlight?: boolean }[]).map(({ label, key, isCurrency = true, highlight }) => (
              <div key={label} className={`rounded-lg border bg-white p-3 ${highlight && (zReportData[key] as number) !== 0 ? 'border-red-300' : 'border-gray-200'}`}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`mt-0.5 font-semibold ${highlight && (zReportData[key] as number) !== 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {isCurrency ? formatCurrency(zReportData[key] as number) : String(zReportData[key] ?? 0)}
                </p>
              </div>
            ))}
          </div>

          {zReportMovements.length > 0 && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Cash Movements</p>
              <div className="space-y-1.5">
                {zReportMovements.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-semibold ${m.type === 'cash_in' ? 'text-green-600' : 'text-orange-600'}`}>
                        {m.type === 'cash_in' ? '+ Cash In' : '− Cash Out'}
                      </span>
                      {m.notes && <span className="text-xs text-gray-400 truncate">{m.notes}</span>}
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
      <Modal open={!!detailSession} onClose={() => setDetailSession(null)} title="Session Z-Report" size="sm">
        {detailSession && (
          <div className="space-y-4 text-sm">
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>Opened: {new Date(detailSession.opened_at).toLocaleString()}</span>
              <span>{detailSession.closed_at ? `Closed: ${new Date(detailSession.closed_at).toLocaleString()}` : 'Still open'}</span>
            </div>

            <div className="rounded-xl bg-surface-container-low p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-3">Sales</p>
              {([
                ['Total Sales',  detailSession.total_sales,  false],
                ['Cash Sales',   detailSession.cash_sales,   false],
                ['Card Sales',   detailSession.card_sales,   false],
                ['Other Sales',  detailSession.other_sales,  false],
                ['Refunds',      detailSession.total_refunds, true],
              ] as [string, number | null, boolean][]).map(([label, val, isNeg]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-on-surface-variant">{label}</span>
                  <span className={isNeg && (val ?? 0) > 0 ? 'text-red-600' : 'text-on-surface'}>
                    {isNeg && (val ?? 0) > 0 ? '-' : ''}{formatCurrency(val ?? 0)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-xs text-on-surface-variant border-t border-outline-variant pt-2 mt-1">
                <span>Transactions</span><span>{detailSession.transaction_count ?? 0}</span>
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-low p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-3">Cash Reconciliation</p>
              {([
                ['Opening Float',  detailSession.opening_float, false],
                ['Expected Cash',  detailSession.expected_cash, false],
                ['Closing Cash',   detailSession.closing_cash,  false],
              ] as [string, number | null, boolean][]).map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-on-surface-variant">{label}</span>
                  <span className="text-on-surface">{val != null ? formatCurrency(val) : '—'}</span>
                </div>
              ))}
              <div className={`flex justify-between font-semibold border-t border-outline-variant pt-2 mt-1 ${(detailSession.variance ?? 0) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>Variance (Over/Short)</span>
                <span>{detailSession.variance != null ? formatCurrency(detailSession.variance) : '—'}</span>
              </div>
            </div>

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
                        <span className={`text-xs font-semibold ${m.type === 'cash_in' ? 'text-green-600' : 'text-orange-600'}`}>
                          {m.type === 'cash_in' ? '+ Cash In' : '− Cash Out'}
                        </span>
                        {m.notes && <p className="text-xs text-on-surface-variant truncate">{m.notes}</p>}
                        <p className="text-[10px] text-on-surface-variant">{new Date(m.created_at).toLocaleTimeString()}</p>
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

            <Button variant="outline" className="w-full" onClick={() => setDetailSession(null)}>Close</Button>
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
          <Button className="w-full" loading={sessionLoading} onClick={handleCloseSession}>Generate Z-Report & Close</Button>
        </div>
      </Modal>
    </div>
  )
}
