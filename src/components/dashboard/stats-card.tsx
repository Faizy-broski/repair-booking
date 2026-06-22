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
}

const COLOR_CLASSES = {
  blue:   { icon: 'text-blue-600',    iconBg: 'bg-blue-50   ring-1 ring-blue-200/70',   accent: 'bg-blue-500',    sub: 'text-blue-600' },
  green:  { icon: 'text-emerald-600', iconBg: 'bg-emerald-50 ring-1 ring-emerald-200/70', accent: 'bg-emerald-500', sub: 'text-emerald-600' },
  yellow: { icon: 'text-amber-600',   iconBg: 'bg-amber-50  ring-1 ring-amber-200/70',   accent: 'bg-amber-500',   sub: 'text-amber-600' },
  purple: { icon: 'text-violet-600',  iconBg: 'bg-violet-50 ring-1 ring-violet-200/70',  accent: 'bg-violet-500',  sub: 'text-violet-600' },
  red:    { icon: 'text-red-600',     iconBg: 'bg-red-50    ring-1 ring-red-200/70',     accent: 'bg-red-500',     sub: 'text-red-600' },
}

export function StatsCard({ title, value, subtitle, icon, trend, color = 'blue', className }: StatsCardProps) {
  const colors = COLOR_CLASSES[color]

  return (
    <div className={cn('relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-4 px-4 sm:pt-5 sm:px-5 shadow-sm', className)}>

      {/* Row 1: title (left) + icon (right) — both small, same line */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-h-[1.5rem] text-[9px] sm:text-[10px] font-bold uppercase leading-tight tracking-[0.05em] text-gray-700">{title}</p>
        {icon && (
          <div className={cn('flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl shadow-sm', colors.iconBg)}>
            <span className={colors.icon}>{icon}</span>
          </div>
        )}
      </div>

      {/* Row 2: large value — always full width, never blocked by icon */}
      <p className="mt-2 text-base sm:text-2xl font-bold tracking-tight text-gray-900 leading-none truncate" title={String(value)}>{value}</p>

      {/* Row 3: subtitle / trend */}
      {subtitle && (
        <p className={cn('mt-2 sm:mt-3 flex items-center gap-1 text-[11px] sm:text-xs font-medium', colors.sub)}>
          {trend !== undefined && (
            <>
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              <span>{Math.abs(trend)}%</span>
            </>
          )}
          <span>{subtitle}</span>
        </p>
      )}

      {/* Coloured bottom accent stripe */}
      <div className={cn('absolute bottom-0 left-0 right-0 h-1.5 sm:h-2', colors.accent)} />
    </div>
  )
}
