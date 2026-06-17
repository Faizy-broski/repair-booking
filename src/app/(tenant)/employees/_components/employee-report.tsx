'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ChevronLeft, Clock, TrendingUp, CalendarCheck, User, Download, Printer, Eye } from 'lucide-react'
import { DataTable } from '@/components/shared/data-table'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

interface EmployeeListItem {
  id: string; first_name: string; last_name: string | null; role: string | null
}
interface ClockEntry {
  id: string; clock_in: string; clock_out: string | null; break_minutes?: number | null
}
interface CommissionEntry {
  id: string; amount: number; status: string; source_type: string; created_at: string
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function durationHours(clockIn: string, clockOut: string | null, breakMinutes?: number | null): number {
  // For active sessions (no clock-out yet) use current time so hours accumulate from clock-in
  const end = clockOut ? new Date(clockOut) : new Date()
  const ms  = end.getTime() - new Date(clockIn).getTime() - (breakMinutes ?? 0) * 60_000
  return Math.max(0, ms / 3_600_000)
}

function localDateKey(iso: string): string {
  // Use the local calendar date the entry falls on for daily bucketing.
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface EmployeeSummary { daysPresent: number; totalCommission: number; totalHours: number }

export function EmployeeReportTab({ branchId }: { branchId: string }) {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingDownload, setPendingDownload] = useState(false)
  const [summaries, setSummaries] = useState<Record<string, EmployeeSummary>>({})
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  useEffect(() => {
    fetch(`/api/employees/search?branch_id=${branchId}`)
      .then(r => r.json())
      .then(j => setEmployees(j.data ?? []))
      .catch(() => {})
  }, [branchId])

  // Fetch attendance + commission summary for all employees whenever month/year/list changes
  useEffect(() => {
    if (employees.length === 0) return
    setLoadingSummaries(true)
    Promise.all(
      employees.map(async e => {
        const params = new URLSearchParams({ branch_id: branchId, employee_id: e.id, month: String(month), year: String(year) })
        const [clockRes, commRes] = await Promise.all([
          fetch(`/api/employees/clock?${params}`).then(r => r.json()).catch(() => ({ data: [] })),
          fetch(`/api/employees/commissions?${params}`).then(r => r.json()).catch(() => ({ data: [] })),
        ])
        const clocks: ClockEntry[] = clockRes.data ?? []
        const comms: CommissionEntry[] = commRes.data ?? []
        const daysPresent = new Set(clocks.map(r => localDateKey(r.clock_in))).size
        const totalHours = clocks.reduce((s, r) => s + durationHours(r.clock_in, r.clock_out, r.break_minutes), 0)
        const totalCommission = comms.reduce((s, c) => s + c.amount, 0)
        return { id: e.id, daysPresent, totalHours, totalCommission }
      })
    ).then(results => {
      const map: Record<string, EmployeeSummary> = {}
      for (const r of results) map[r.id] = { daysPresent: r.daysPresent, totalHours: r.totalHours, totalCommission: r.totalCommission }
      setSummaries(map)
      setLoadingSummaries(false)
    })
  }, [employees, month, year, branchId]) // eslint-disable-line

  const selected = employees.find(e => e.id === selectedId) ?? null

  const { data: clockRows = [], isLoading: loadingClock } = useQuery({
    queryKey: ['emp-report-clock', branchId, selectedId, month, year],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: branchId, employee_id: selectedId!, month: String(month), year: String(year) })
      const res = await fetch(`/api/employees/clock?${params}`)
      const json = await res.json(); return (json.data ?? []) as ClockEntry[]
    },
    enabled: !!selectedId,
  })

  const { data: commRows = [], isLoading: loadingComm } = useQuery({
    queryKey: ['emp-report-comm', branchId, selectedId, month, year],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: branchId, employee_id: selectedId!, month: String(month), year: String(year) })
      const res = await fetch(`/api/employees/commissions?${params}`)
      const json = await res.json(); return (json.data ?? []) as CommissionEntry[]
    },
    enabled: !!selectedId,
  })

  useEffect(() => {
    if (pendingDownload && !loadingClock && !loadingComm) {
      setPendingDownload(false)
      downloadExcel()
    }
  }, [pendingDownload, loadingClock, loadingComm]) // eslint-disable-line

  // ── Daily chart data ────────────────────────────────────────────────────
  const daysInMonth = new Date(year, month, 0).getDate()
  const chartData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const hours = clockRows
      .filter(r => localDateKey(r.clock_in) === dateKey)
      .reduce((sum, r) => sum + durationHours(r.clock_in, r.clock_out, r.break_minutes), 0)
    const commission = commRows
      .filter(r => localDateKey(r.created_at) === dateKey)
      .reduce((sum, r) => sum + r.amount, 0)
    return { day, hours: Math.round(hours * 10) / 10, commission: Math.round(commission * 100) / 100 }
  })

  const totalHours = chartData.reduce((s, d) => s + d.hours, 0)
  const totalCommission = commRows.reduce((s, c) => s + c.amount, 0)
  const daysPresent = new Set(clockRows.map(r => localDateKey(r.clock_in))).size

  function downloadExcel() {
    const employeeName = `${selected?.first_name ?? ''} ${selected?.last_name ?? ''}`.trim()
    const period       = `${MONTH_NAMES[month - 1]} ${year}`

    const th = (s: string) => `<th style="background:#c8102e;color:#fff;padding:6px 10px;border:1px solid #aaa;text-align:left;mso-number-format:'\@';">${s}</th>`
    const td = (s: string) => `<td style="padding:5px 10px;border:1px solid #ddd;mso-number-format:'\@';">${s}</td>`

    const attendanceRows = clockRows.map(r => {
      const h = durationHours(r.clock_in, r.clock_out, r.break_minutes)
      return `<tr>${td(formatDateTime(r.clock_in))}${td(r.clock_out ? formatDateTime(r.clock_out) : 'Active')}${td(r.clock_out ? `${h.toFixed(1)}h` : '—')}</tr>`
    }).join('')

    const commissionRows = commRows.map(r =>
      `<tr>${td(formatDate(r.created_at))}${td(r.source_type)}${td(formatCurrency(r.amount))}${td(r.status)}</tr>`
    ).join('')

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
      <x:Name>Employee Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
      </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
      <body>
        <h2 style="font-family:sans-serif;">Employee Report</h2>
        <table style="font-family:sans-serif;font-size:13px;border-collapse:collapse;margin-bottom:8px;">
          <tr>${th('Employee')}${td(employeeName)}</tr>
          <tr>${th('Period')}${td(`${MONTH_NAMES[month - 1]} ${year}`)}</tr>
          <tr>${th('Total Hours')}${td(`${totalHours.toFixed(1)}h`)}</tr>
          <tr>${th('Total Commission')}${td(formatCurrency(totalCommission))}</tr>
          <tr>${th('Days Present')}${td(`${daysPresent} of ${daysInMonth}`)}</tr>
        </table>
        <br/>
        <h3 style="font-family:sans-serif;">Attendance Records</h3>
        <table style="font-family:sans-serif;font-size:13px;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr>${th('Clock In')}${th('Clock Out')}${th('Hours')}</tr></thead>
          <tbody>${attendanceRows || `<tr><td colspan="3" style="padding:6px 10px;color:#999;">No records</td></tr>`}</tbody>
        </table>
        <h3 style="font-family:sans-serif;">Commission Records</h3>
        <table style="font-family:sans-serif;font-size:13px;border-collapse:collapse;">
          <thead><tr>${th('Date')}${th('Source')}${th('Amount')}${th('Status')}</tr></thead>
          <tbody>${commissionRows || `<tr><td colspan="4" style="padding:6px 10px;color:#999;">No records</td></tr>`}</tbody>
        </table>
      </body></html>`

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `employee-report-${employeeName.replace(/\s+/g, '-').toLowerCase()}-${month}-${year}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openPrintWindow() {
    const employeeName = `${selected?.first_name ?? ''} ${selected?.last_name ?? ''}`.trim()
    const period       = `${MONTH_NAMES[month - 1]} ${year}`

    const th = (s: string) => `<th style="background:#1a1a2e;color:#fff;padding:7px 12px;border:1px solid #ccc;text-align:left;font-size:12px;">${s}</th>`
    const td = (s: string, center = false) => `<td style="padding:6px 12px;border:1px solid #e0e0e0;font-size:12px;${center ? 'text-align:center;' : ''}">${s}</td>`

    const attendanceRows = clockRows.map(r => {
      const h = durationHours(r.clock_in, r.clock_out, r.break_minutes)
      return `<tr>${td(formatDateTime(r.clock_in))}${td(r.clock_out ? formatDateTime(r.clock_out) : 'Active')}${td(r.clock_out ? `${h.toFixed(1)}h` : '—', true)}</tr>`
    }).join('')

    const commissionRows = commRows.map(r =>
      `<tr>${td(formatDate(r.created_at))}${td(r.source_type)}${td(formatCurrency(r.amount))}${td(r.status)}</tr>`
    ).join('')

    const dailyRows = chartData
      .filter(d => d.hours > 0 || d.commission > 0)
      .map(d => {
        const date = new Date(year, month - 1, d.day)
        const dateLabel = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        return `<tr>${td(dateLabel)}${td(`${d.hours}h`, true)}${td(formatCurrency(d.commission), true)}</tr>`
      })
      .join('')

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Employee Report — ${employeeName} — ${period}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 32px; }
        h1 { font-size: 22px; margin-bottom: 2px; }
        .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
        .summary { display: flex; gap: 16px; margin-bottom: 28px; }
        .card { flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 18px; }
        .card-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
        .card-value { font-size: 22px; font-weight: 700; color: #111; }
        h2 { font-size: 14px; font-weight: 700; margin: 24px 0 8px; color: #111; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        @media print { body { padding: 16px; } .no-print { display: none; } @page { margin: 12mm; } }
      </style>
    </head><body>
      <h1>${employeeName}</h1>
      <p class="subtitle">${selected?.role ?? 'Employee'} &mdash; ${period}</p>

      <div class="summary">
        <div class="card">
          <div class="card-label">Total Hours</div>
          <div class="card-value">${totalHours.toFixed(1)}h</div>
        </div>
        <div class="card">
          <div class="card-label">Total Commission</div>
          <div class="card-value">${formatCurrency(totalCommission)}</div>
        </div>
        <div class="card">
          <div class="card-label">Days Present</div>
          <div class="card-value">${daysPresent} / ${daysInMonth}</div>
        </div>
      </div>

      ${dailyRows ? `
      <h2>Daily Summary</h2>
      <table>
        <thead><tr>${th('Date')}${th('Hours Worked')}${th('Commission')}</tr></thead>
        <tbody>${dailyRows}</tbody>
      </table>` : ''}

      <h2>Attendance Records</h2>
      <table>
        <thead><tr>${th('Clock In')}${th('Clock Out')}${th('Hours')}</tr></thead>
        <tbody>${attendanceRows || `<tr><td colspan="3" style="padding:8px 12px;color:#999;font-size:12px;">No attendance records</td></tr>`}</tbody>
      </table>

      <h2>Commission Records</h2>
      <table>
        <thead><tr>${th('Date')}${th('Source')}${th('Amount')}${th('Status')}</tr></thead>
        <tbody>${commissionRows || `<tr><td colspan="4" style="padding:8px 12px;color:#999;font-size:12px;">No commission records</td></tr>`}</tbody>
      </table>

      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`)
    win.document.close()
  }

  const clockColumns: ColumnDef<ClockEntry>[] = [
    { accessorKey: 'clock_in', header: 'Clock In', cell: ({ getValue }) => formatDateTime(getValue() as string) },
    { accessorKey: 'clock_out', header: 'Clock Out', cell: ({ getValue }) => {
      const v = getValue() as string | null
      return v ? formatDateTime(v) : <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-semibold"><span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block" />Active</span>
    }},
    { id: 'hours', header: 'Hours', cell: ({ row }) => {
      const h = durationHours(row.original.clock_in, row.original.clock_out, row.original.break_minutes)
      if (!row.original.clock_out) {
        return <span className="text-green-600 font-medium">{h.toFixed(1)}h <span className="text-xs text-green-400">(live)</span></span>
      }
      return `${h.toFixed(1)}h`
    }},
  ]

  const commColumns: ColumnDef<CommissionEntry>[] = [
    { accessorKey: 'created_at', header: 'Date', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: 'source_type', header: 'Source' },
    { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'status', header: 'Status' },
  ]

  // ── Employee list table (no selection yet) ─────────────────────────────
  if (!selectedId) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">

        {/* Filter bar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3 gap-3">
          <p className="text-sm font-semibold text-gray-700">Monthly Summary</p>
          <div className="flex items-center gap-2">
            <select value={month} onChange={e => setMonth(parseInt(e.target.value, 10))}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 focus:border-brand-teal focus:outline-none">
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 focus:border-brand-teal focus:outline-none">
              {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Table head */}
        <div className="grid grid-cols-[44px_2fr_1fr_140px_140px_120px_220px] items-center gap-4 border-b border-gray-200 bg-gray-50/60 px-5 py-2.5">
          <div />
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Employee</div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Role</div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Attendance</div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Commission</div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status</div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Actions</div>
        </div>

        {employees.length === 0 ? (
          <div className="py-16 text-center">
            <User className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No employees yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {employees.map(e => {
              const summary = summaries[e.id]
              const daysInMonth = new Date(year, month, 0).getDate()
              return (
                <div key={e.id} className="grid grid-cols-[44px_2fr_1fr_140px_140px_120px_220px] items-center gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal text-xs font-bold">
                    {e.first_name[0]?.toUpperCase()}{e.last_name?.[0]?.toUpperCase() ?? ''}
                  </div>

                  {/* Name */}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{e.first_name} {e.last_name ?? ''}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{(e.role ?? 'employee').replace(/_/g, ' ')}</p>
                  </div>

                  {/* Role */}
                  <div>
                    <span className="inline-block rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 capitalize">
                      {(e.role ?? 'employee').replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Attendance */}
                  <div>
                    {loadingSummaries ? (
                      <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
                    ) : summary ? (
                      <div className="flex items-center gap-1.5">
                        <CalendarCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="text-sm font-semibold text-gray-900">{summary.daysPresent}</span>
                        <span className="text-xs text-gray-400">/ {daysInMonth} days</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>

                  {/* Commission */}
                  <div>
                    {loadingSummaries ? (
                      <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
                    ) : summary ? (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className={`text-sm font-semibold ${summary.totalCommission > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                          {formatCurrency(summary.totalCommission)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Active
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setSelectedId(e.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-teal-dark transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Details
                    </button>
                    <button
                      onClick={() => { setSelectedId(e.id); setPendingDownload(true) }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
                      style={{ background: '#1D6F42' }}
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        {employees.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3">
            <p className="text-xs text-gray-500">{employees.length} employee{employees.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Detail view for selected employee ──────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 print:hidden">
          <ChevronLeft className="h-4 w-4" /> Back to employees
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value, 10))}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none print:hidden">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none print:hidden">
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={downloadExcel}
              title="Download Excel"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-sm font-medium text-white transition-colors"
              style={{ background: '#1D6F42' }}
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              onClick={openPrintWindow}
              title="Save as PDF"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-sm font-medium text-white transition-colors"
              style={{ background: '#E53E3E' }}
            >
              <Printer className="h-3.5 w-3.5" /> PDF
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-teal text-white font-bold">
          {selected?.first_name?.[0]?.toUpperCase()}{selected?.last_name?.[0]?.toUpperCase() ?? ''}
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{selected?.first_name} {selected?.last_name ?? ''}</h3>
          <p className="text-sm text-gray-500">{selected?.role ?? 'Employee'} — {MONTH_NAMES[month - 1]} {year}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><Clock className="h-4 w-4" /></div>
          <div>
            <p className="text-xs text-gray-500">Total Hours</p>
            <p className="text-lg font-bold text-gray-900">{totalHours.toFixed(1)}h</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-600"><TrendingUp className="h-4 w-4" /></div>
          <div>
            <p className="text-xs text-gray-500">Total Commission</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalCommission)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600"><CalendarCheck className="h-4 w-4" /></div>
          <div>
            <p className="text-xs text-gray-500">Days Present</p>
            <p className="text-lg font-bold text-gray-900">{daysPresent} / {daysInMonth}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Hours Worked Per Day</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={Math.ceil(daysInMonth / 15)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={((v: number) => [`${v}h`, 'Hours']) as any} labelFormatter={(d) => `Day ${d}`} />
              <Bar dataKey="hours" fill="#3BB3C3" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Commission Earned Per Day</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={Math.ceil(daysInMonth / 15)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={((v: number) => [formatCurrency(v), 'Commission']) as any} labelFormatter={(d) => `Day ${d}`} />
              <Bar dataKey="commission" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Attendance Records</p>
          <DataTable data={clockRows} columns={clockColumns} isLoading={loadingClock} emptyMessage="No attendance records for this month." />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Commission Records</p>
          <DataTable data={commRows} columns={commColumns} isLoading={loadingComm} emptyMessage="No commissions for this month." />
        </div>
      </div>
    </div>
  )
}
