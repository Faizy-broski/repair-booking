'use client'
import { useState, useEffect, useCallback } from 'react'
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
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<RegisterSession[]>([])
  const [currentSession, setCurrentSession] = useState<RegisterSession | null>(null)
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [openingFloat, setOpeningFloat] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)
  const [zReportData, setZReportData] = useState<Record<string, unknown> | null>(null)

  const fetchSessions = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'sessions', branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      setSessions(json.data ?? [])
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  const fetchCurrentSession = useCallback(async () => {
    if (!activeBranch) return
    const res = await fetch(`/api/pos/session?branch_id=${activeBranch.id}`)
    const json = await res.json()
    setCurrentSession(json.data)
  }, [activeBranch])

  useEffect(() => { fetchSessions(); fetchCurrentSession() }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleOpenSession() {
    setSessionLoading(true)
    const res = await fetch('/api/pos/session/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0, branch_id: activeBranch?.id }),
    })
    if (res.ok) { setOpenModal(false); setOpeningFloat(''); fetchCurrentSession() }
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
      setCloseModal(false); setClosingCash(''); setCurrentSession(null)
      fetchSessions()
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

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={fetchSessions} />

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
                <tr key={s.id} className="hover:bg-surface-container-low">
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
