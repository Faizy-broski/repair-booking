'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ArrowLeft, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'

interface TopSellerRow { name: string; quantity: number; revenue: number }
interface LossBreakdown {
  sales_refunds: number; sales_refund_count: number
  repair_refunds: number; repair_refund_count: number
  total_loss: number
}

interface ProfitLossData {
  revenue: number; repair_revenue: number; total_revenue: number
  cogs: number; expenses: number; salaries: number; total_costs: number
  gross_profit: number; net_profit: number
  other_income?: number
  // Reference-only figure matching the Repairs module dashboard's own
  // "Revenue" definition (booking-window: created in range, deposits
  // counted for still-open jobs) — not part of any total above.
  repair_revenue_booked?: number
  // COGS breakdown — sales_cogs + repair_parts_cogs + repair_lab_fees always sums to `cogs`.
  sales_cogs?: number
  repair_parts_cogs?: number
  // Paid to an outside third-party lab (e.g. data recovery, chip-level repair) —
  // a pass-through cost, never billed to the customer, so it reduces profit
  // the same way repair_parts_cogs does.
  repair_lab_fees?: number
  // Repair Revenue breakdown — repair_revenue_pos + repair_revenue_direct
  // always sums to `repair_revenue`.
  repair_revenue_pos?: number
  repair_revenue_direct?: number
  top_products?: TopSellerRow[]
  top_categories?: TopSellerRow[]
  loss_breakdown?: LossBreakdown
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
function exportPL(data: ProfitLossData, filename: string) {
  const rows = Object.entries(data).map(([metric, value]) => ({ metric, value }))
  exportExcel(rows, filename)
}

export default function ProfitLossReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const { data = null, isLoading: loading, refetch } = useQuery<ProfitLossData | null>({
    queryKey: ['report-profit-loss', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'profit_loss', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

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
            <h1 className="text-2xl font-bold text-on-surface">Profit & Loss</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Revenue, costs and net profit analysis — completed jobs only, by completion date</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => data && exportPL(data, `pl-${dateFrom}-${dateTo}.xlsx`)} disabled={!data}>
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      {loading && (
        <div className="rounded-xl border border-outline-variant bg-surface p-8 text-center text-sm text-on-surface-variant">Loading…</div>
      )}

      {!loading && !data && (
        <div className="flex h-32 items-center justify-center rounded-xl border border-outline-variant bg-surface text-sm text-on-surface-variant">
          No profit/loss data for this period.
        </div>
      )}

      {data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Total Revenue', value: data.total_revenue, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Total Costs',   value: data.total_costs,   color: 'text-red-600',  bg: 'bg-red-50' },
              { label: 'Net Profit',    value: data.net_profit,    color: data.net_profit >= 0 ? 'text-green-600' : 'text-red-600', bg: data.net_profit >= 0 ? 'bg-green-50' : 'bg-red-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-xl border border-outline-variant bg-surface p-4">
                <div className={`inline-flex rounded-lg p-2 ${bg} mb-2`} />
                <p className="text-sm text-on-surface-variant">{label}</p>
                <p className={`mt-1 text-2xl font-bold sm:text-3xl ${color}`}>{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          {/* Breakdown */}
          <div className="rounded-xl border border-outline-variant bg-surface p-5">
            <h3 className="mb-4 text-base font-semibold text-on-surface">Breakdown</h3>
            <div className="space-y-0 text-base divide-y divide-outline-variant/50">
              {([
                { label: 'Sales Revenue',        value: data.revenue,         indent: 0, bold: false },
                { label: 'Repair Revenue (Completed)', value: data.repair_revenue,  indent: 0, bold: false },
                ...(data.repair_revenue_pos !== undefined ? [{ label: 'Paid via POS',    value: data.repair_revenue_pos,    indent: 2, bold: false }] : []),
                ...(data.repair_revenue_direct !== undefined ? [{ label: 'Paid Directly (not via POS)', value: data.repair_revenue_direct, indent: 2, bold: false }] : []),
                ...(data.other_income !== undefined ? [{ label: 'Other Income (Cash Movements)', value: data.other_income, indent: 0, bold: false }] : []),
                { label: 'Cost of Goods (COGS)',  value: -data.cogs,           indent: 1,  bold: false },
                ...(data.sales_cogs !== undefined ? [{ label: 'Sales COGS',        value: -data.sales_cogs,        indent: 2, bold: false }] : []),
                ...(data.repair_parts_cogs !== undefined ? [{ label: 'Repair Parts COGS', value: -data.repair_parts_cogs, indent: 2, bold: false }] : []),
                ...(data.repair_lab_fees !== undefined ? [{ label: 'Repair Lab / 3rd-Party Fees', value: -data.repair_lab_fees, indent: 2, bold: false }] : []),
                { label: 'Gross Profit',          value: data.gross_profit,    indent: 0, bold: true  },
                { label: 'Operating Expenses',    value: -data.expenses,       indent: 1,  bold: false },
                { label: 'Salaries',              value: -data.salaries,       indent: 1,  bold: false },
                { label: 'Net Profit',            value: data.net_profit,      indent: 0, bold: true  },
              ] as { label: string; value: number; indent: 0 | 1 | 2; bold: boolean }[]).map(({ label, value, indent, bold }) => (
                <div key={label} className={`flex justify-between py-2.5 ${bold ? 'font-semibold' : ''}`}>
                  <span className={indent === 2 ? 'pl-8 text-on-surface-variant text-sm' : indent === 1 ? 'pl-4 text-on-surface-variant' : 'text-on-surface'}>
                    {indent > 0 ? `— ${label}` : label}
                  </span>
                  <span className={value < 0 ? 'text-red-600' : value > 0 ? 'text-green-700' : 'text-on-surface-variant'}>
                    {value < 0 ? `(${formatCurrency(Math.abs(value))})` : formatCurrency(value)}
                  </span>
                </div>
              ))}
            </div>
            {!!data.repair_lab_fees && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  <strong>{formatCurrency(data.repair_lab_fees)}</strong> of this period&apos;s repair costs were paid to outside third-party labs (data recovery, chip-level repair, etc.) — a pass-through cost, not shop profit, already deducted from Gross/Net Profit above.
                </span>
              </div>
            )}
            {data.repair_revenue_booked !== undefined && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface-container-lowest px-3 py-2.5 text-xs text-on-surface-variant">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  For reference — the Repairs module&apos;s own &quot;Revenue&quot; card for this same range (jobs <em>booked</em> in this window, including deposits on still-open jobs):{' '}
                  <strong className="text-on-surface">{formatCurrency(data.repair_revenue_booked)}</strong>.
                  {' '}This differs from &quot;Repair Revenue (Completed)&quot; above, which only counts jobs finished in this window, by completion date.
                </span>
              </div>
            )}
          </div>

          {/* Top sellers */}
          {(data.top_categories?.length || data.top_products?.length) ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <TopSellerTable title="Top 5 Categories Sold" rows={data.top_categories ?? []} />
              <TopSellerTable title="Top 5 Products Sold" rows={data.top_products ?? []} />
            </div>
          ) : null}

          {/* Loss detail */}
          {data.loss_breakdown && (
            <div className="rounded-xl border border-outline-variant bg-surface p-5">
              <h3 className="mb-4 text-base font-semibold text-on-surface">Loss Detail</h3>
              <div className="space-y-0 text-base divide-y divide-outline-variant/50">
                {[
                  { label: 'Sales Refunds', count: data.loss_breakdown.sales_refund_count, value: data.loss_breakdown.sales_refunds },
                  { label: 'Repair Refunds', count: data.loss_breakdown.repair_refund_count, value: data.loss_breakdown.repair_refunds },
                ].map(({ label, count, value }) => (
                  <div key={label} className="flex justify-between py-2.5">
                    <span className="text-on-surface-variant">
                      {label}{count > 0 ? ` (${count})` : ''}
                    </span>
                    <span className={value > 0 ? 'text-red-600' : 'text-on-surface-variant'}>
                      {value > 0 ? `(${formatCurrency(value)})` : formatCurrency(0)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 font-semibold">
                  <span className="text-on-surface">Total Loss from Refunds</span>
                  <span className={data.loss_breakdown.total_loss > 0 ? 'text-red-600' : 'text-on-surface-variant'}>
                    {data.loss_breakdown.total_loss > 0 ? `(${formatCurrency(data.loss_breakdown.total_loss)})` : formatCurrency(0)}
                  </span>
                </div>
                {data.net_profit < 0 && (
                  <div className="flex justify-between py-2.5 font-semibold">
                    <span className="text-red-600">Net Loss for Period</span>
                    <span className="text-red-600">({formatCurrency(Math.abs(data.net_profit))})</span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-on-surface-variant">
                Refunded sales are already excluded from Sales Revenue above — this section shows how much revenue was given back, for visibility into what&apos;s driving losses.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TopSellerTable({ title, rows }: { title: string; rows: TopSellerRow[] }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-5">
      <h3 className="mb-4 text-base font-semibold text-on-surface">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-on-surface-variant">No sales in this period.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-on-surface-variant">
              <th className="pb-2 font-medium">#</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 text-right font-medium">Qty Sold</th>
              <th className="pb-2 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {rows.map((row, i) => (
              <tr key={`${row.name}-${i}`}>
                <td className="py-2 text-on-surface-variant">{i + 1}</td>
                <td className="py-2 text-on-surface">{row.name}</td>
                <td className="py-2 text-right text-on-surface-variant">{row.quantity}</td>
                <td className="py-2 text-right font-medium text-green-700">{formatCurrency(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
