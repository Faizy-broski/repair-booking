'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { ColumnDef } from '@tanstack/react-table'

interface RepairRow { key: string; name: string; count: number; total_value: number }

// Normalize any status string to a stable grouping key
function normalizeKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, '_')
}

// Convert a key to a human-readable label
function toLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Deterministic color palette — cycles for unknown statuses
const PALETTE = [
  '#14b8a6', '#3b82f6', '#f59e0b', '#22c55e',
  '#8b5cf6', '#ef4444', '#ec4899', '#64748b',
  '#06b6d4', '#a3e635', '#fb923c', '#a78bfa',
]

const STATUS_COLOR_MAP: Record<string, string> = {
  pending:         '#f59e0b',
  booked:          '#06b6d4',
  received:        '#3b82f6',
  in_progress:     '#8b5cf6',
  waiting_for_parts:'#ec4899',
  complete:        '#22c55e',
  completed:       '#22c55e',
  repaired:        '#14b8a6',
  collected:       '#14b8a6',
  unrepairable:    '#64748b',
  refunded:        '#ef4444',
  cancelled:       '#ef4444',
}

function getColor(key: string, index: number) {
  return STATUS_COLOR_MAP[key] ?? PALETTE[index % PALETTE.length]
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }

function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  if (!rows.length) return
  const h = Object.keys(rows[0])
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
}

export default function RepairsReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)

  const { data = [], isLoading: loading, refetch } = useQuery<RepairRow[]>({
    queryKey: ['report-repairs', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({
        type: 'repairs',
        branch_id: activeBranch!.id,
        from: `${dateFrom}T00:00:00`,
        to: `${dateTo}T23:59:59`,
      })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()

      // Normalize + group: "In Progress" and "in_progress" → same bucket
      const grouped: Record<string, { name: string; count: number; value: number }> = {}
      for (const r of json.data ?? []) {
        const key = normalizeKey(r.status ?? 'unknown')
        // Keep the first seen display name (prefer title-case custom statuses)
        if (!grouped[key]) grouped[key] = { name: toLabel(r.status ?? key), count: 0, value: 0 }
        grouped[key].count += 1
        // Report shows repair VALUE not collected revenue:
        //   refunded  → refund_amount (how much was refunded out)
        //   all else  → actual_cost ?? estimated_cost (what the repair is/was worth)
        const cost   = r.actual_cost ?? r.estimated_cost ?? 0
        const refund = r.refund_amount ?? 0
        grouped[key].value += key === 'refunded' ? refund : cost
      }

      return Object.entries(grouped).map(([key, { name, count, value }]) => ({
        key,
        name,
        count,
        total_value: value,
      }))
    },
    enabled: !!activeBranch,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const totalRepairs = data.reduce((s, r) => s + r.count, 0)
  const totalValue   = data.reduce((s, r) => s + r.total_value, 0)

  const columns: ColumnDef<RepairRow>[] = [
    { accessorKey: 'name',        header: 'Status' },
    { accessorKey: 'count',       header: 'Count' },
    { accessorKey: 'total_value', header: 'Total Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

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
            <h1 className="text-2xl font-bold text-on-surface">Repairs Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Repair job status and revenue breakdown</p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => exportCsv(
            data.map((r) => ({ Status: r.name, Count: r.count, 'Total Value': r.total_value })),
            `repairs-${dateFrom}-${dateTo}.csv`,
          )}
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Repairs</p>
          <p className="mt-1 text-2xl font-bold text-on-surface sm:text-3xl">{totalRepairs}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Repair Value</p>
          <p className="mt-1 text-2xl font-bold text-green-600 sm:text-3xl">{formatCurrency(totalValue)}</p>
        </div>
      </div>

      {data.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="mb-4 text-base font-semibold text-on-surface">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                cx="50%"
                cy="45%"
                outerRadius={90}
                label={(entry: RepairRow & { percent?: number }) =>
                  `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={true}
              >
                {data.map((row, i) => (
                  <Cell key={row.key} fill={getColor(row.key, i)} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number, _: unknown, props: { payload?: RepairRow }) => [value, props.payload?.name ?? '']} />
              <Legend
                payload={data.map((row, i) => ({
                  value: row.name,
                  type: 'square' as const,
                  color: getColor(row.key, i),
                }))}
                formatter={(value: string) => (
                  <span style={{ color: '#374151', fontSize: 13 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable
        data={data}
        columns={columns}
        isLoading={loading}
        emptyMessage="No repair data for this period."
      />
    </div>
  )
}
