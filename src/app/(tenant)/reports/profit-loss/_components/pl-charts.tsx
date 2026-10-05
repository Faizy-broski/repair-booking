'use client'
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line, BarChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { CHART_COLORS, chartAxisTick, chartGridStroke, chartTooltipStyle, chartLegendStyle } from '@/lib/chart-theme'

export interface DailyPoint { date: string; revenue: number; expenses: number; net: number }
export interface CategoryAmount { category: string; amount: number }

interface Props {
  daily: DailyPoint[]
  totalRevenue: number
  cogs: number
  expenses: number
  salaries: number
  grossProfit: number
  netProfit: number
  expenseBreakdown: CategoryAmount[]
}

const money = (v: unknown) => formatCurrency(Number(v ?? 0))
const axisMoney = (v: number) => (Math.abs(v) >= 1000 ? `£${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `£${v}`)
const shortDate = (d: string) => {
  const dt = new Date(`${d}T00:00:00`)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function ChartCard({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-outline-variant bg-surface p-5 ${className}`}>
      <h3 className="text-base font-semibold text-on-surface">{title}</h3>
      {subtitle && <p className="mt-0.5 mb-4 text-xs text-on-surface-variant">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-[220px] items-center justify-center text-sm text-on-surface-variant">{text}</div>
}

export function ProfitLossCharts({ daily, totalRevenue, cogs, expenses, salaries, grossProfit, netProfit, expenseBreakdown }: Props) {
  // Cost composition donut
  const costSlices = [
    { name: 'Cost of goods', value: Math.max(cogs, 0), color: 'var(--primary)' },
    { name: 'Operating expenses', value: Math.max(expenses, 0), color: 'var(--tertiary)' },
    { name: 'Salaries', value: Math.max(salaries, 0), color: 'var(--warning)' },
  ].filter(s => s.value > 0)
  const totalCosts = costSlices.reduce((s, c) => s + c.value, 0)

  // Revenue → net profit bridge: each bar floats from `base` to `base + value`.
  const afterCogs = totalRevenue - cogs
  const afterExpenses = afterCogs - expenses
  const bridge = [
    { name: 'Revenue',   base: 0,                                   value: Math.max(totalRevenue, 0), color: 'var(--primary)' },
    { name: 'COGS',      base: Math.max(afterCogs, 0),              value: Math.min(cogs, Math.max(totalRevenue, 0)), color: 'var(--error)' },
    { name: 'Expenses',  base: Math.max(afterExpenses, 0),          value: Math.min(expenses, Math.max(afterCogs, 0)), color: 'var(--error)' },
    { name: 'Salaries',  base: Math.max(netProfit, 0),              value: Math.min(salaries, Math.max(afterExpenses, 0)), color: 'var(--error)' },
    { name: 'Net profit', base: 0,                                  value: Math.max(netProfit, 0), color: netProfit >= 0 ? 'var(--success)' : 'var(--error)' },
  ]

  const categories = [...expenseBreakdown].sort((a, b) => b.amount - a.amount).slice(0, 8)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Sales vs expenses" subtitle="Daily sales revenue against expenses counted in P&L" className="lg:col-span-2">
        {daily.length === 0 ? <Empty text="No activity in this period." /> : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="plRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={chartGridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={chartAxisTick} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={axisMoney} tick={chartAxisTick} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v) => money(v)} labelFormatter={(l) => shortDate(String(l))} {...chartTooltipStyle} />
              <Legend {...chartLegendStyle} iconType="circle" />
              <Area type="monotone" dataKey="revenue" name="Sales revenue" stroke="var(--primary)" strokeWidth={2.5} fill="url(#plRevenueFill)" />
              <Bar dataKey="expenses" name="Expenses" fill="var(--error)" fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Line type="monotone" dataKey="net" name="Sales − expenses" stroke="var(--success)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Where the money goes" subtitle="Share of total costs">
        {totalCosts === 0 ? <Empty text="No costs in this period." /> : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative h-[220px] w-full sm:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={costSlices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} cornerRadius={6} stroke="none">
                    {costSlices.map(s => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} {...chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-on-surface-variant">Total costs</span>
                <span className="text-lg font-bold tabular-nums text-on-surface">{formatCurrency(totalCosts)}</span>
              </div>
            </div>
            <ul className="w-full space-y-2.5 sm:w-1/2">
              {costSlices.map(s => (
                <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-on-surface-variant">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}
                  </span>
                  <span className="tabular-nums text-on-surface">
                    {formatCurrency(s.value)} <span className="text-xs text-on-surface-variant">· {Math.round((s.value / totalCosts) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Revenue to net profit" subtitle={`Gross profit ${formatCurrency(grossProfit)}`}>
        {totalRevenue <= 0 ? <Empty text="No revenue in this period." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bridge} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={chartGridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={chartAxisTick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={axisMoney} tick={chartAxisTick} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                formatter={(v, _n, item) => (item?.dataKey === 'base' ? [null, null] : money(v)) as never}
                {...chartTooltipStyle}
              />
              <Bar dataKey="base" stackId="a" fill="transparent" legendType="none" isAnimationActive={false} />
              <Bar dataKey="value" stackId="a" name="Amount" radius={[6, 6, 6, 6]} maxBarSize={44}>
                {bridge.map(b => <Cell key={b.name} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Expenses by category" subtitle="Only categories counted in P&L" className="lg:col-span-2">
        {categories.length === 0 ? <Empty text="No categorised expenses in this period." /> : (
          <ResponsiveContainer width="100%" height={Math.max(180, categories.length * 40)}>
            <BarChart data={categories} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={chartGridStroke} strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={axisMoney} tick={chartAxisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="category" tick={chartAxisTick} axisLine={false} tickLine={false} width={120} />
              <Tooltip cursor={{ fill: 'transparent' }} formatter={(v) => money(v)} {...chartTooltipStyle} />
              <Bar dataKey="amount" name="Amount" radius={[0, 6, 6, 0]} maxBarSize={22}>
                {categories.map((c, i) => <Cell key={c.category} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
