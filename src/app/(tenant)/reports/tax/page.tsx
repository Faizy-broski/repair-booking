'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/shared/ui-kit'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { DateRangeBar } from '../_components/date-range-bar'
import type { ColumnDef } from '@tanstack/react-table'

interface TaxRow { tax_class: string; total_tax: number }

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }

export default function TaxReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const { data = null, isLoading: loading, refetch } = useQuery<{ rows: TaxRow[]; grand_total: number } | null>({
    queryKey: ['report-tax', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'tax', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  const columns: ColumnDef<TaxRow>[] = [
    { accessorKey: 'tax_class', header: 'Tax Class' },
    { accessorKey: 'total_tax', header: 'Tax Collected', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tax Report"
        description="Tax collected by class for the selected period"
        back={{ href: '/reports', label: 'Back to Reports' }}
        actions={
          <Button size="sm" className="w-full sm:w-auto" onClick={() => data && exportExcel(data.rows as unknown as Record<string, unknown>[], `tax-${dateFrom}-${dateTo}.xlsx`)} disabled={!data}>
            <Download className="h-4 w-4" /> Export Excel
          </Button>
        }
      />

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Total Tax Collected" value={formatCurrency(data.grand_total)} icon={Receipt} tone="bg-primary/10 text-primary" />
        </div>
      )}

      {!loading && !data && (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest text-sm text-on-surface-variant">
          No tax data for this period.
        </div>
      )}

      {data && (
        <>
          <DataTable data={data.rows} columns={columns} isLoading={loading} emptyMessage="No tax data." />
          <div className="flex justify-end rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-3.5">
            <span className="text-base font-semibold text-on-surface">Grand Total: {formatCurrency(data.grand_total)}</span>
          </div>
        </>
      )}
    </div>
  )
}
