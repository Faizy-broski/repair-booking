'use client'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ArrowLeft, Info, Banknote, CreditCard } from 'lucide-react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Cell,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { chartAxisTick, chartGridStroke, chartTooltipStyle, chartLegendStyle } from '@/lib/chart-theme'
import { DateRangeBar } from '../_components/date-range-bar'

type Method = 'cash' | 'card'
type Direction = 'in' | 'out'

interface LedgerRow {
  occurred_at: string
  source: string
  direction: Direction
  method: Method
  amount: number
  reference_id: string | null
  reference_label: string | null
  customer_name: string | null
  notes: string | null
}
interface MethodTotals { in: number; out: number; net: number }
interface LedgerData {
  available: boolean
  rows: LedgerRow[]
  summary: { cash: MethodTotals; card: MethodTotals }
  by_source: { source: string; in: number; out: number }[]
  daily: { date: string; cash_in: number; cash_out: number; card_in: number; card_out: number }[]
}

const SOURCE_LABELS: Record<string, string> = {
  sale: 'POS sale',
  sale_deposit: 'On-account deposit',
  credit_repayment: 'Credit repayment',
  refund: 'POS refund',
  repair_payment: 'Repair payment',
  repair_refund: 'Repair refund',
  cash_in: 'Cash in',
  cash_out: 'Cash out',
  expense: 'Expense',
  supplier_payment: 'Supplier payment',
}
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s

const PURPOSE_LABELS: Record<string, string> = {
  plain: 'Plain', expense: 'Expense', buyback: 'Buyback', trade_in: 'Trade-in',
  gift_card_sale: 'Gift card sale', supplier: 'Stock purchase',
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
const axisMoney = (v: number) => (Math.abs(v) >= 1000 ? `£${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `£${v}`)
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function CashCardLedgerPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [method, setMethod] = useState<'all' | Method>('all')
  const [direction, setDirection] = useState<'all' | Direction>('all')

  const { data = null, isLoading: loading, refetch } = useQuery<LedgerData | null>({
    queryKey: ['report-cash-card-ledger', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'cash_card_ledger', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  const rows = useMemo(
    () => (data?.rows ?? []).filter(r => (method === 'all' || r.method === method) && (direction === 'all' || r.direction === direction)),
    [data, method, direction],
  )

  const columns = useMemo<ColumnDef<LedgerRow>[]>(() => [
    {
      accessorKey: 'occurred_at',
      header: 'Date',
      cell: ({ getValue }) => {
        const v = getValue() as string
        const d = new Date(v)
        const dateOnly = v.endsWith('T00:00:00+00:00') || v.endsWith('T00:00:00Z')
        return <span className="whitespace-nowrap tabular-nums">{d.toLocaleDateString('en-GB')}{!dateOnly && <span className="ml-1 text-on-surface-variant">{d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}</span>
      },
    },
    { accessorKey: 'source', header: 'Type', cell: ({ getValue }) => sourceLabel(getValue() as string) },
    {
      accessorKey: 'reference_label',
      header: 'Reference',
      cell: ({ row }) => {
        const r = row.original
        const label = r.source === 'cash_in' || r.source === 'cash_out'
          ? (PURPOSE_LABELS[r.reference_label ?? 'plain'] ?? r.reference_label)
          : r.reference_label
        return <span className="text-on-surface">{label ?? '—'}</span>
      },
    },
    { accessorKey: 'customer_name', header: 'Customer', cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ getValue }) => {
        const m = getValue() as Method
        return (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${m === 'cash' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>
            {m === 'cash' ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
            {m === 'cash' ? 'Cash' : 'Card'}
          </span>
        )
      },
    },
    {
      id: 'in',
      header: 'Money in',
      cell: ({ row }) => row.original.direction === 'in' ? <span className="font-medium tabular-nums text-green-700">{formatCurrency(row.original.amount)}</span> : <span className="text-outline">—</span>,
    },
    {
      id: 'out',
      header: 'Money out',
      cell: ({ row }) => row.original.direction === 'out' ? <span className="font-medium tabular-nums text-red-600">({formatCurrency(row.original.amount)})</span> : <span className="text-outline">—</span>,
    },
    { accessorKey: 'notes', header: 'Notes', cell: ({ getValue }) => <span className="text-on-surface-variant">{(getValue() as string | null) ?? ''}</span> },
  ], [])

  function exportLedger() {
    if (!data) return
    exportExcel(
      rows.map(r => ({
        Date: new Date(r.occurred_at).toLocaleString('en-GB'),
        Type: sourceLabel(r.source),
        Reference: r.reference_label ?? '',
        Customer: r.customer_name ?? '',
        Method: r.method === 'cash' ? 'Cash' : 'Card',
        'Money in': r.direction === 'in' ? r.amount : '',
        'Money out': r.direction === 'out' ? r.amount : '',
        Notes: r.notes ?? '',
      })),
      `cash-card-ledger-${dateFrom}-${dateTo}.xlsx`,
      'Ledger',
    )
  }

  const kpis = data ? [
    { label: 'Cash in',  value: data.summary.cash.in,  tone: 'text-green-700', icon: Banknote },
    { label: 'Cash out', value: data.summary.cash.out, tone: 'text-red-600',   icon: Banknote },
    { label: 'Cash net', value: data.summary.cash.net, tone: data.summary.cash.net >= 0 ? 'text-green-700' : 'text-red-600', icon: Banknote },
    { label: 'Card in',  value: data.summary.card.in,  tone: 'text-green-700', icon: CreditCard },
    { label: 'Card out', value: data.summary.card.out, tone: 'text-red-600',   icon: CreditCard },
    { label: 'Card net', value: data.summary.card.net, tone: data.summary.card.net >= 0 ? 'text-green-700' : 'text-red-600', icon: CreditCard },
  ] : []

  const inflow = (data?.by_source ?? []).filter(s => s.in > 0).sort((a, b) => b.in - a.in)
  const outflow = (data?.by_source ?? []).filter(s => s.out > 0).sort((a, b) => b.out - a.out)

  const dailyChart = (data?.daily ?? []).map(d => ({
    ...d,
    cash_out: -d.cash_out,
    card_out: -d.card_out,
    cash_net: d.cash_in - d.cash_out,
    card_net: d.card_in - d.card_out,
  }))

  const showCash = method !== 'card'
  const showCard = method !== 'cash'

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
              <ArrowLeft className="h-5 w-5" strokeWidth={3} />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Cash &amp; Card Ledger</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Every payment in and out, by cash and card</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={exportLedger} disabled={!data || rows.length === 0}>
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={refetch} />

      {loading && (
        <div className="rounded-xl border border-outline-variant bg-surface p-8 text-center text-sm text-on-surface-variant">Loading…</div>
      )}

      {!loading && data && !data.available && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>The ledger isn&apos;t set up yet — apply database migration 208 (<code>get_cash_card_ledger</code>) to enable this report.</span>
        </div>
      )}

      {data?.available && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {kpis.map(({ label, value, tone, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-outline-variant bg-surface p-4">
                <div className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                  <Icon className="h-3.5 w-3.5" /> {label}
                </div>
                <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant bg-surface p-5 lg:col-span-2">
              <h3 className="text-base font-semibold text-on-surface">Daily money in vs out</h3>
              <p className="mb-4 mt-0.5 text-xs text-on-surface-variant">Bars above the line are money in, below are money out; lines show the daily net</p>
              {dailyChart.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center text-sm text-on-surface-variant">No movements in this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={dailyChart} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={chartGridStroke} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={chartAxisTick} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tickFormatter={axisMoney} tick={chartAxisTick} axisLine={false} tickLine={false} width={52} />
                    <Tooltip formatter={(v) => formatCurrency(Math.abs(Number(v ?? 0)))} labelFormatter={(l) => shortDate(String(l))} {...chartTooltipStyle} />
                    <Legend {...chartLegendStyle} iconType="circle" />
                    {showCash && <Bar dataKey="cash_in" stackId="m" name="Cash in" fill="var(--success)" radius={[4, 4, 0, 0]} maxBarSize={26} />}
                    {showCash && <Bar dataKey="cash_out" stackId="m" name="Cash out" fill="var(--error)" fillOpacity={0.8} radius={[0, 0, 4, 4]} maxBarSize={26} />}
                    {showCard && <Bar dataKey="card_in" stackId="m" name="Card in" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={26} />}
                    {showCard && <Bar dataKey="card_out" stackId="m" name="Card out" fill="var(--warning)" fillOpacity={0.85} radius={[0, 0, 4, 4]} maxBarSize={26} />}
                    {showCash && <Line type="monotone" dataKey="cash_net" name="Cash net" stroke="var(--success)" strokeWidth={2} dot={false} />}
                    {showCard && <Line type="monotone" dataKey="card_net" name="Card net" stroke="var(--primary)" strokeWidth={2} strokeDasharray="4 3" dot={false} />}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <SourceBars title="Money in by source" rows={inflow.map(s => ({ name: sourceLabel(s.source), value: s.in }))} color="var(--success)" />
            <SourceBars title="Money out by source" rows={outflow.map(s => ({ name: sourceLabel(s.source), value: s.out }))} color="var(--error)" />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="mr-auto text-base font-semibold text-on-surface">Details</h3>
              <Segmented value={method} onChange={setMethod} options={[['all', 'All'], ['cash', 'Cash'], ['card', 'Card']]} />
              <Segmented value={direction} onChange={setDirection} options={[['all', 'In & out'], ['in', 'In'], ['out', 'Out']]} />
            </div>
            <DataTable data={rows} columns={columns} isLoading={loading} pageSize={50} emptyMessage="No cash or card movements for this selection." />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-surface-container-lowest px-3 py-2.5 text-xs text-on-surface-variant">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Only cash and card are shown — gift card, store credit, loyalty points and marketplace payments are excluded. Salaries, invoice payments and other income have no payment method recorded, so they aren&apos;t part of this ledger. Expenses taken as a POS cash-out appear once, as the cash movement.
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-lg bg-surface-container p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${value === v ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function SourceBars({ title, rows, color }: { title: string; rows: { name: string; value: number }[]; color: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-5">
      <h3 className="mb-4 text-base font-semibold text-on-surface">{title}</h3>
      {rows.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-on-surface-variant">Nothing in this period.</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 38)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={chartGridStroke} strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={axisMoney} tick={chartAxisTick} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={chartAxisTick} axisLine={false} tickLine={false} width={130} />
            <Tooltip cursor={{ fill: 'transparent' }} formatter={(v) => formatCurrency(Number(v ?? 0))} {...chartTooltipStyle} />
            <Bar dataKey="value" name="Amount" radius={[0, 6, 6, 0]} maxBarSize={22}>
              {rows.map(r => <Cell key={r.name} fill={color} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
