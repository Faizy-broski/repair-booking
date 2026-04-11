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
  blue:   { icon: 'text-tertiary',      iconBg: 'bg-tertiary-container',      accent: 'bg-tertiary',      sub: 'text-tertiary' },
  green:  { icon: 'text-primary-dim',   iconBg: 'bg-primary-container',       accent: 'bg-primary',       sub: 'text-primary-dim' },
  yellow: { icon: 'text-secondary',     iconBg: 'bg-secondary-container',     accent: 'bg-secondary',     sub: 'text-secondary' },
  red:    { icon: 'text-error',         iconBg: 'bg-error-container/30',      accent: 'bg-error',         sub: 'text-error' },
  purple: { icon: 'text-secondary-dim', iconBg: 'bg-secondary-fixed-dim',     accent: 'bg-secondary-dim', sub: 'text-secondary-dim' },
}

export function StatsCard({ title, value, subtitle, icon, trend, color = 'blue', className }: StatsCardProps) {
  const colors = COLOR_CLASSES[color]

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="min-h-[2rem] text-[11px] font-semibold uppercase leading-tight tracking-wider text-on-surface-variant">{title}</p>
          <p className="text-3xl font-bold text-on-surface">{value}</p>
          {subtitle && (
            <p className={cn('mt-3 flex items-center gap-1 text-xs font-medium', colors.sub)}>
              {trend !== undefined ? (
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
              ) : (
                <TrendingUp className="h-3 w-3" />
              )}
              <span>{subtitle}</span>
            </p>
          )}
        </div>
        {icon && (
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', colors.iconBg)}>
            <span className={colors.icon}>{icon}</span>
          </div>
        )}
      </div>
      {/* Coloured bottom accent stripe */}
      <div className={cn('absolute bottom-0 left-0 right-0 h-1', colors.accent)} />
    </div>
  )
}
