'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Banknote, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/shared/ui-kit'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { chartAxisTick } from '@/lib/chart-theme'
import type { ColumnDef } from '@tanstack/react-table'
import { channelLabel } from '../../pos/_types'

interface PaymentRow { payment_method: string; total: number; count: number }

// Tooltip chrome shared with the dashboard: 12px rounded hairline border.
const TOOLTIP_PROPS = {
  contentStyle: { background: 'var(--surface-container-lowest)', border: '1px solid var(--hairline)', borderRadius: 12 },
  itemStyle: { color: 'var(--on-surface)' },
  labelStyle: { color: 'var(--on-surface-variant)' },
}

// Series palette: navy, brand teal, cyan, then semantic emerald / amber / red.
const COLORS = ['var(--navy)', 'var(--primary)', 'var(--primary-light)', 'var(--success)', 'var(--warning)', 'var(--error)']

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }

export default function PaymentsReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const { data = [], isLoading: loading, refetch } = useQuery<PaymentRow[]>({
    queryKey: ['report-payments', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'payment_methods', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  const totalRevenue = data.reduce((s, r) => s + r.total, 0)
  const totalTxns    = data.reduce((s, r) => s + r.count, 0)

  const columns: ColumnDef<PaymentRow>[] = [
    { accessorKey: 'payment_method', header: 'Method', cell: ({ getValue }) => <span>{channelLabel(getValue() as string)}</span> },
    { accessorKey: 'count',          header: 'Transactions' },
    { accessorKey: 'total',          header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments Report"
        description="Revenue breakdown by payment method"
        back={{ href: '/reports', label: 'Back to Reports' }}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/reports/cash-card-ledger">
              <Button size="sm" variant="outline" className="w-full sm:w-auto">View cash &amp; card ledger</Button>
            </Link>
            <Button size="sm" className="w-full sm:w-auto" onClick={() => exportExcel(data as unknown as Record<string, unknown>[], `payments-${dateFrom}-${dateTo}.xlsx`)}>
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </div>
        }
      />

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Total Revenue" value={formatCurrency(totalRevenue)} icon={Banknote} tone="bg-emerald-500/10 text-emerald-600" />
        <MetricCard label="Total Transactions" value={totalTxns} icon={ShoppingCart} tone="bg-primary/10 text-primary" />
      </div>

      {data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
            <h3 className="mb-4 text-base font-semibold text-on-surface">Revenue Split</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data} dataKey="total" nameKey="payment_method" cx="50%" cy="50%" outerRadius={75} stroke="none"
                  label={({ payment_method, percent }) => `${channelLabel(payment_method)} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} {...TOOLTIP_PROPS} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
            <h3 className="mb-4 text-base font-semibold text-on-surface">Transaction Count</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--hairline)" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={chartAxisTick} />
                <YAxis dataKey="payment_method" type="category" axisLine={false} tickLine={false} tick={chartAxisTick} width={80} tickFormatter={(v) => channelLabel(v)} />
                <Tooltip cursor={{ fill: 'var(--surface-container-low)' }} {...TOOLTIP_PROPS} />
                <Bar dataKey="count" fill="var(--primary)" radius={[0, 6, 6, 0]} maxBarSize={28} name="Transactions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <DataTable data={data} columns={columns} isLoading={loading} emptyMessage="No payment data for this period." />
    </div>
  )
}
