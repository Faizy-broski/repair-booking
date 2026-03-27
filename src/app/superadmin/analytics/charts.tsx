'use client'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface MonthBucket  { month: string; count: number }
interface PlanStat     { name: string; subscribers: number; mrr: number; pct: number }
interface StatusStat   { status: string; count: number; pct: number }
interface MrrBucket    { month: string; mrr: number }

interface Props {
  mrrByMonth:     MrrBucket[]
  signupsByMonth: MonthBucket[]
  statusStats:    StatusStat[]
  planStats:      PlanStat[]
}

// Brand / status colours
const BRAND_TEAL   = '#3BB3C3'
const BRAND_YELLOW = '#F8C301'

const STATUS_FILL: Record<string, string> = {
  active:    '#10b981',
  trialing:  '#3b82f6',
  past_due:  '#f59e0b',
  canceled:  '#f43f5e',
  suspended: '#9ca3af',
}

// ── Custom tooltip ─────────────────────────────────────────────────────────
function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: £{p.value.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

function CountTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold capitalize" style={{ color: payload[0].payload.fill }}>
        {payload[0].name.replace('_', ' ')}
      </p>
      <p className="text-gray-600">{payload[0].value} subscriptions ({payload[0].payload.pct}%)</p>
    </div>
  )
}

// ── Chart section wrapper ──────────────────────────────────────────────────
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────
export function AnalyticsCharts({ mrrByMonth, signupsByMonth, statusStats, planStats }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* MRR trend */}
      <ChartCard title="MRR Trend" subtitle="Monthly recurring revenue over the last 12 months">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={mrrByMonth} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={BRAND_TEAL} stopOpacity={0.2} />
                <stop offset="95%" stopColor={BRAND_TEAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `£${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
              width={52}
            />
            <Tooltip content={<CurrencyTooltip />} />
            <Area
              type="monotone"
              dataKey="mrr"
              name="MRR"
              stroke={BRAND_TEAL}
              strokeWidth={2}
              fill="url(#mrrGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* New signups */}
      <ChartCard title="New Business Signups" subtitle="Number of businesses registered each month">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={signupsByMonth} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip content={<CountTooltip />} />
            <Bar dataKey="count" name="Signups" fill={BRAND_TEAL} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Subscription status donut */}
      <ChartCard title="Subscription Status" subtitle="Current status breakdown across all subscriptions">
        {statusStats.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">No subscription data yet</div>
        ) : (
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie
                  data={statusStats}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {statusStats.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_FILL[entry.status] ?? '#9ca3af'} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2.5">
              {statusStats.map((s) => (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ background: STATUS_FILL[s.status] ?? '#9ca3af' }}
                    />
                    <span className="capitalize text-gray-600">{s.status.replace('_', ' ')}</span>
                  </div>
                  <span className="font-semibold text-gray-800 tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      {/* Plan subscriber bar chart */}
      <ChartCard title="Subscribers by Plan" subtitle="Active + trialing subscriptions per plan">
        {planStats.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">No plan data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={planStats}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              barSize={18}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={80} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-sm">
                      <p className="font-semibold text-gray-700 mb-1">{label}</p>
                      <p style={{ color: BRAND_TEAL }}>Subscribers: {payload[0]?.value}</p>
                      <p style={{ color: BRAND_YELLOW }}>MRR: £{payload[1]?.value?.toLocaleString()}</p>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="subscribers" name="Subscribers" fill={BRAND_TEAL} radius={[0, 4, 4, 0]} />
              <Bar dataKey="mrr" name="MRR (£)" fill={BRAND_YELLOW} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
