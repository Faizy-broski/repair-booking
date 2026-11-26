import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  trend?: number // percentage change
  color?: 'teal' | 'blue' | 'green' | 'yellow' | 'red' | 'purple'
  className?: string
  /** Longer explanation (e.g. the formula), shown as a tooltip on hover */
  hint?: string
}

// KPI card (Figma "irepairly dashboard"): label top-left, a soft tinted icon
// tile top-right, a large value and a muted one-line note underneath.
const COLOR_CLASSES = {
  teal:   'bg-primary/10 text-primary',
  blue:   'bg-blue-500/10 text-blue-600',
  green:  'bg-emerald-500/10 text-emerald-600',
  yellow: 'bg-amber-500/10 text-amber-600',
  purple: 'bg-violet-500/10 text-violet-600',
  red:    'bg-red-500/10 text-red-600',
}

// Values are always shown in full (no "…", no k/M abbreviations): the font
// steps down as the formatted number gets longer.
function valueSizeClass(value: string | number) {
  const len = String(value).length
  if (len <= 10) return 'text-2xl'
  if (len <= 12) return 'text-xl'
  if (len <= 14) return 'text-lg'
  return 'text-base'
}

export function StatsCard({ title, value, subtitle, icon, trend, color = 'blue', className, hint }: StatsCardProps) {
  return (
    <div
      // min-w-0: a grid/flex child must never grow past its column and push the page wider
      className={cn('flex h-full min-w-0 flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-5', className)}
      title={hint}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="truncate pt-1 text-sm text-on-surface-variant" title={title}>{title}</p>
        {icon && (
          <span
            className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px]', COLOR_CLASSES[color])}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>

      <p className={cn('mt-3 whitespace-nowrap font-semibold leading-tight tracking-tight text-on-surface tabular-nums', valueSizeClass(value))} title={String(value)}>
        {value}
      </p>

      {subtitle && (
        <p className="mt-1.5 flex items-start gap-1 text-xs leading-snug text-on-surface-variant">
          {trend !== undefined && (
            <span className={cn('flex items-center gap-0.5 font-medium', trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : '')}>
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3 shrink-0" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3 w-3 shrink-0" />
              ) : (
                <Minus className="h-3 w-3 shrink-0" />
              )}
              {Math.abs(trend)}%
            </span>
          )}
          <span className="line-clamp-2">{subtitle}</span>
        </p>
      )}
    </div>
  )
}
