'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Banknote, Receipt, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/shared/ui-kit'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { DateRangeBar } from '../_components/date-range-bar'
import { groupDailySales } from '@/lib/reports/sales-report'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { chartAxisTick } from '@/lib/chart-theme'
import type { ColumnDef } from '@tanstack/react-table'

interface SalesRow { date: string; total_sales: number; transaction_count: number; avg_order_value: number }
interface CashMovementRow {
  type: 'cash_in' | 'cash_out'
  amount: number
  purpose: 'plain' | 'expense' | 'buyback' | 'trade_in' | 'gift_card_sale'
  notes: string | null
  created_at: string
  profiles: { full_name: string | null } | null
}
const PURPOSE_LABELS: Record<string, string> = {
  plain: 'Plain', expense: 'Expense', buyback: 'Buyback', trade_in: 'Trade-In', gift_card_sale: 'Gift Card Sale',
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }

export default function SalesReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const { data = [], isLoading: loading, refetch } = useQuery<SalesRow[]>({
    queryKey: ['report-sales', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'sales', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      return groupDailySales(json.data?.sales ?? [], json.data?.cash_movements ?? [])
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  const { data: cashMovements = [] } = useQuery<CashMovementRow[]>({
    queryKey: ['report-sales-cash-movements', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'sales', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      return json.data?.cash_movements ?? []
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  const totalRevenue = data.reduce((s, r) => s + r.total_sales, 0)
  const totalTxns    = data.reduce((s, r) => s + r.transaction_count, 0)
  const avgOrder     = totalTxns > 0 ? totalRevenue / totalTxns : 0

  const columns: ColumnDef<SalesRow>[] = [
    { accessorKey: 'date',              header: 'Date',         cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: 'transaction_count', header: 'Transactions' },
    { accessorKey: 'total_sales',       header: 'Revenue',      cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'avg_order_value',   header: 'Avg. Order',   cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales Report"
        description="Daily transaction and revenue breakdown"
        back={{ href: '/reports', label: 'Back to Reports' }}
        actions={
          <Button size="sm" className="w-full sm:w-auto" onClick={() => exportExcel(data as unknown as Record<string, unknown>[], `sales-${dateFrom}-${dateTo}.xlsx`)}>
            <Download className="h-4 w-4" /> Export Excel
          </Button>
        }
      />

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Total Revenue" value={formatCurrency(totalRevenue)} icon={Banknote} tone="bg-emerald-500/10 text-emerald-600" />
        <MetricCard label="Transactions" value={String(totalTxns)} icon={ShoppingCart} tone="bg-primary/10 text-primary" />
        <MetricCard label="Avg. Order" value={formatCurrency(avgOrder)} icon={Receipt} tone="bg-primary/10 text-primary" />
      </div>

      {data.length > 0 && (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <h3 className="mb-4 text-base font-semibold text-on-surface">Daily Revenue</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--hairline)" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={chartAxisTick} tickFormatter={(v) => formatDate(v)} />
              <YAxis axisLine={false} tickLine={false} width={56} tick={chartAxisTick} tickFormatter={(v) => `£${v}`} />
              <Tooltip
                cursor={{ fill: 'var(--surface-container-low)' }}
                formatter={(v: unknown) => formatCurrency(v as number)}
                contentStyle={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--hairline)', borderRadius: 12 }}
                itemStyle={{ color: 'var(--on-surface)' }}
                labelStyle={{ color: 'var(--on-surface-variant)' }}
              />
              <Bar dataKey="total_sales" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={64} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable data={data} columns={columns} isLoading={loading} emptyMessage="No sales data for this period." />

      {cashMovements.length > 0 && (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h3 className="mb-3 text-base font-semibold text-on-surface">Cash Movements</h3>
          <div className="space-y-2">
            {cashMovements.map((m, i) => (
              <div key={i} className="flex items-start justify-between gap-2 border-b border-outline-variant/50 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${m.type === 'cash_in' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {m.type === 'cash_in' ? '+ Cash In' : '− Cash Out'}
                    </span>
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                      {PURPOSE_LABELS[m.purpose] ?? m.purpose}
                    </span>
                    {m.purpose === 'plain' && (
                      <span className="text-[10px] italic text-amber-600">(not in P&amp;L)</span>
                    )}
                  </div>
                  {m.notes && <p className="mt-0.5 truncate text-xs text-on-surface-variant">{m.notes}</p>}
                  <p className="mt-0.5 text-[11px] text-on-surface-variant">
                    {new Date(m.created_at).toLocaleString('en-GB')} · {m.profiles?.full_name ?? 'Unknown'}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${m.type === 'cash_in' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {m.type === 'cash_in' ? '+' : '−'}{formatCurrency(m.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
