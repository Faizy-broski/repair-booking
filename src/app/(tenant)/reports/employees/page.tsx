'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { ColumnDef } from '@tanstack/react-table'

interface EmployeeRow {
  employee_id: string; employee_name: string
  repairs_completed: number; repair_revenue: number
  sales_count: number; sales_revenue: number; commission_total: number
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
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Employees Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Staff productivity and commission for the period</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => exportExcel(data as unknown as Record<string, unknown>[], `employees-${dateFrom}-${dateTo}.xlsx`)}>
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Revenue Generated</p>
          <p className="mt-1 text-2xl font-bold text-green-600 sm:text-3xl">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Commission</p>
          <p className="mt-1 text-2xl font-bold text-on-surface sm:text-3xl">{formatCurrency(totalCommission)}</p>
        </div>
      </div>

      {data.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="mb-3 text-base font-semibold text-on-surface">Revenue by Employee</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="employee_name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
              <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
              <Legend />
              <Bar dataKey="sales_revenue"  name="Sales"   fill="#0d9488" stackId="a" />
              <Bar dataKey="repair_revenue" name="Repairs" fill="#8b5cf6" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable data={data} columns={columns} isLoading={loading} emptyMessage="No employee data for this period." />
    </div>
  )
}
