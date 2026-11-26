'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Wrench, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/shared/ui-kit'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { DateRangeBar } from '../_components/date-range-bar'
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

// Tooltip chrome shared with the dashboard: 12px rounded hairline border.
const TOOLTIP_PROPS = {
  contentStyle: { background: 'var(--surface-container-lowest)', border: '1px solid var(--hairline)', borderRadius: 12 },
  itemStyle: { color: 'var(--on-surface)' },
  labelStyle: { color: 'var(--on-surface-variant)' },
}

// Deterministic colour palette — navy, brand teal, cyan, then semantic colours; cycles for unknown statuses
const PALETTE = [
  'var(--navy)', 'var(--primary)', 'var(--primary-light)', 'var(--success)',
  'var(--warning)', 'var(--error)', 'var(--outline)', 'var(--on-surface-variant)',
]

const STATUS_COLOR_MAP: Record<string, string> = {
  pending:         'var(--outline)',
  booked:          'var(--primary-light)',
  received:        'var(--navy)',
  in_progress:     'var(--primary)',
  waiting_for_parts:'var(--warning)',
  complete:        'var(--success)',
  completed:       'var(--success)',
  repaired:        'var(--primary)',
  collected:       'var(--primary)',
  unrepairable:    'var(--on-surface-variant)',
  refunded:        'var(--error)',
  cancelled:       'var(--error)',
}

function getColor(key: string, index: number) {
  return STATUS_COLOR_MAP[key] ?? PALETTE[index % PALETTE.length]
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }

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

      // Same terminal detection as stats card & dashboard (repair-financials.service.ts)
      const TERMINAL_EXACT    = new Set(['repaired', 'collected', 'unrepairable', 'refunded', 'completed', 'done', 'fixed', 'closed', 'picked_up', 'handover'])
      const TERMINAL_KEYWORDS = ['complet', 'done', 'fixed', 'pick', 'closed', 'resolv', 'finish', 'collect', 'handover']
      const isTerminal = (k: string) => TERMINAL_EXACT.has(k) || TERMINAL_KEYWORDS.some(kw => k.includes(kw))

      // Normalize + group: "In Progress" and "in_progress" → same bucket
      const grouped: Record<string, { name: string; count: number; value: number }> = {}
      for (const r of json.data ?? []) {
        const key = normalizeKey(r.status ?? 'unknown')
        if (!grouped[key]) grouped[key] = { name: toLabel(r.status ?? key), count: 0, value: 0 }
        grouped[key].count += 1
        // Identical revenue logic to stats card — report totals now match for same date range.
        // A repair actually paid through the POS till overrides the raw repairs-table columns.
        let revenue = 0
        if (r.pos_net_total !== null && r.pos_net_total !== undefined) {
          revenue = r.pos_net_total
        } else {
          const deposit  = r.deposit_paid  ?? 0
          const fullCost = r.actual_cost != null ? r.actual_cost : Math.max(0, (r.estimated_cost ?? 0) - (r.discount_amount ?? 0))
          const refund   = r.refund_amount ?? 0
          if (isTerminal(key))         revenue = fullCost
          else if (key === 'refunded') revenue = Math.max(0, deposit - refund)
          else                         revenue = deposit
        }
        grouped[key].value += revenue
      }

      return Object.entries(grouped).map(([key, { name, count, value }]) => ({
        key,
        name,
        count,
        total_value: value,
      }))
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
  })

  const totalRepairs = data.reduce((s, r) => s + r.count, 0)
  const totalValue   = data.reduce((s, r) => s + r.total_value, 0)

  const columns: ColumnDef<RepairRow>[] = [
    { accessorKey: 'name',        header: 'Status' },
    { accessorKey: 'count',       header: 'Count' },
    { accessorKey: 'total_value', header: 'Value (Deposit-Weighted)', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Repairs Report"
        description="Repair job status and revenue breakdown, by booking date — open jobs counted at deposit only"
        back={{ href: '/reports', label: 'Back to Reports' }}
        actions={
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => exportExcel(
              data.map((r) => ({ Status: r.name, Count: r.count, 'Total Value': r.total_value })),
              `repairs-${dateFrom}-${dateTo}.xlsx`,
            )}
          >
            <Download className="h-4 w-4" /> Export Excel
          </Button>
        }
      />

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Total Repairs" value={totalRepairs} icon={Wrench} tone="bg-primary/10 text-primary" />
        <MetricCard label="Total Revenue (Booked, Deposit-Weighted)" value={formatCurrency(totalValue)} icon={Banknote} tone="bg-emerald-500/10 text-emerald-600" />
      </div>

      {data.length > 0 && (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
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
              <Tooltip
                formatter={(value: number, _: unknown, props: { payload?: RepairRow }) => [value, props.payload?.name ?? '']}
                {...TOOLTIP_PROPS}
              />
              <Legend
                payload={data.map((row, i) => ({
                  value: row.name,
                  type: 'square' as const,
                  color: getColor(row.key, i),
                }))}
                formatter={(value: string) => (
                  <span style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>{value}</span>
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
