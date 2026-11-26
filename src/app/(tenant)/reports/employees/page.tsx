'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Banknote, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/shared/ui-kit'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { DateRangeBar } from '../_components/date-range-bar'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { chartAxisTick, chartLegendStyle } from '@/lib/chart-theme'
import type { ColumnDef } from '@tanstack/react-table'

interface EmployeeRow {
  employee_id: string; employee_name: string
  repairs_completed: number; repair_revenue: number
  sales_count: number; sales_revenue: number; commission_total: number
}

// Tooltip chrome shared with the dashboard: 12px rounded hairline border.
const TOOLTIP_PROPS = {
  contentStyle: { background: 'var(--surface-container-lowest)', border: '1px solid var(--hairline)', borderRadius: 12 },
  itemStyle: { color: 'var(--on-surface)' },
  labelStyle: { color: 'var(--on-surface-variant)' },
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }

export default function EmployeesReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const { data = [], isLoading: loading, refetch } = useQuery<EmployeeRow[]>({
    queryKey: ['report-employees', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59`, subtype: 'productivity' })
      const res = await fetch(`/api/reports/employees?${params}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  const totalCommission = data.reduce((s, r) => s + r.commission_total, 0)
  const totalRevenue    = data.reduce((s, r) => s + r.repair_revenue + r.sales_revenue, 0)

  const columns: ColumnDef<EmployeeRow>[] = [
    { accessorKey: 'employee_name',    header: 'Employee' },
    { accessorKey: 'repairs_completed',header: 'Repairs' },
    { accessorKey: 'repair_revenue',   header: 'Repair Rev.',  cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'sales_count',      header: 'Sales' },
    { accessorKey: 'sales_revenue',    header: 'Sales Rev.',   cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'commission_total', header: 'Commission',   cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employees Report"
        description="Staff productivity and commission for the period"
        back={{ href: '/reports', label: 'Back to Reports' }}
        actions={
          <Button size="sm" className="w-full sm:w-auto" onClick={() => exportExcel(data as unknown as Record<string, unknown>[], `employees-${dateFrom}-${dateTo}.xlsx`)}>
            <Download className="h-4 w-4" /> Export Excel
          </Button>
        }
      />

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Total Revenue Generated" value={formatCurrency(totalRevenue)} icon={Banknote} tone="bg-emerald-500/10 text-emerald-600" />
        <MetricCard label="Total Commission" value={formatCurrency(totalCommission)} icon={Percent} tone="bg-primary/10 text-primary" />
      </div>

      {data.length > 0 && (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <h3 className="mb-4 text-base font-semibold text-on-surface">Revenue by Employee</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--hairline)" />
              <XAxis dataKey="employee_name" axisLine={false} tickLine={false} tick={chartAxisTick} />
              <YAxis axisLine={false} tickLine={false} width={56} tick={chartAxisTick} tickFormatter={(v) => `£${v}`} />
              <Tooltip cursor={{ fill: 'var(--surface-container-low)' }} formatter={(v: unknown) => formatCurrency(v as number)} {...TOOLTIP_PROPS} />
              <Legend wrapperStyle={chartLegendStyle} iconType="circle" />
              <Bar dataKey="sales_revenue"  name="Sales"   fill="var(--primary)" stackId="a" maxBarSize={64} />
              <Bar dataKey="repair_revenue" name="Repairs" fill="var(--navy)" stackId="a" radius={[6, 6, 0, 0]} maxBarSize={64} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable data={data} columns={columns} isLoading={loading} emptyMessage="No employee data for this period." />
    </div>
  )
}
