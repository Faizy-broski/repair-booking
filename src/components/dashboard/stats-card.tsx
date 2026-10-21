import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  trend?: number // percentage change
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
  className?: string
  /** Longer explanation (e.g. the formula), shown as a tooltip on hover */
  hint?: string
}

// Compact KPI tile (~76px tall): a thin coloured left edge + small tinted icon
// keep each metric identifiable without the big icon square / bottom bar, so a
// row of tiles doesn't push the page's real content below the fold.
const COLOR_CLASSES = {
  blue:   { icon: 'text-blue-600',    accent: 'bg-blue-500',    sub: 'text-blue-600' },
  green:  { icon: 'text-emerald-600', accent: 'bg-emerald-500', sub: 'text-emerald-600' },
  yellow: { icon: 'text-amber-600',   accent: 'bg-amber-500',   sub: 'text-amber-600' },
  purple: { icon: 'text-violet-600',  accent: 'bg-violet-500',  sub: 'text-violet-600' },
  red:    { icon: 'text-red-600',     accent: 'bg-red-500',     sub: 'text-red-600' },
}

// Values are always shown in full (no "…", no k/M abbreviations): the font
// steps down as the formatted number gets longer, e.g. £10,990.75 → text-xl,
// £1,234,567.89 → text-base, £123,456,789.00 → text-sm.
function valueSizeClass(value: string | number) {
  const len = String(value).length
  if (len <= 10) return 'text-xl'
  if (len <= 12) return 'text-lg'
  if (len <= 14) return 'text-base'
  return 'text-sm'
}

export function StatsCard({ title, value, subtitle, icon, trend, color = 'blue', className, hint }: StatsCardProps) {
  const colors = COLOR_CLASSES[color]

  return (
    <div
      // min-w-0: a grid/flex child must never grow past its column and push the page wider
      className={cn('relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest py-2.5 pl-4 pr-3', className)}
      title={hint}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', colors.accent)} aria-hidden />

      {/* Label + small icon on one line */}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant" title={title}>{title}</p>
        {icon && (
          <span className={cn('shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5', colors.icon)} aria-hidden>{icon}</span>
        )}
      </div>

      {/* Value */}
      <p className={cn('mt-1 whitespace-nowrap font-bold leading-tight tracking-tight text-on-surface tabular-nums', valueSizeClass(value))} title={String(value)}>{value}</p>

      {/* Subtitle / trend */}
      {subtitle && (
        // Wraps to a second line rather than cutting off mid-word
        <p className={cn('mt-0.5 flex items-start gap-1 text-[11px] font-medium leading-snug', colors.sub)}>
          {trend !== undefined && (
            <>
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3 shrink-0" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3 w-3 shrink-0" />
              ) : (
                <Minus className="h-3 w-3 shrink-0" />
              )}
              <span>{Math.abs(trend)}%</span>
            </>
          )}
          <span className="line-clamp-2">{subtitle}</span>
        </p>
      )}
    </div>
  )
}
