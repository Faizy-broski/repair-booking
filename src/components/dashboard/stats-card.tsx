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
  blue:   { icon: 'text-[#1a5b99]', iconBg: 'bg-[#55b2ff]', accent: 'bg-[#155a94]', sub: 'text-[#1a5b99]' },
  green:  { icon: 'text-[#16605a]', iconBg: 'bg-[#82ebd9]', accent: 'bg-[#0f7d73]', sub: 'text-[#0f7d73]' },
  yellow: { icon: 'text-amber-800', iconBg: 'bg-amber-200',   accent: 'bg-amber-600', sub: 'text-amber-700' },
  purple: { icon: 'text-[#595a6f]', iconBg: 'bg-[#dfe0fa]', accent: 'bg-[#474a62]', sub: 'text-[#474a62]' },
  red:    { icon: 'text-[#ab1c1c]', iconBg: 'bg-[#fad1d2]', accent: 'bg-[#bd1818]', sub: 'text-[#bd1818]' },
}

export function StatsCard({ title, value, subtitle, icon, trend, color = 'blue', className }: StatsCardProps) {
  const colors = COLOR_CLASSES[color]

  return (
    <div className={cn('relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-4 px-4 sm:pt-5 sm:px-5 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="min-h-[1.5rem] text-[9px] sm:text-[10px] font-bold uppercase leading-tight tracking-[0.05em] text-gray-700">{title}</p>
          <p className="mt-1 text-xl sm:text-[28px] font-bold tracking-tight text-gray-900 leading-none truncate">{value}</p>
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
        </div>
        {icon && (
          <div className={cn('flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl', colors.iconBg)}>
            <span className={colors.icon}>{icon}</span>
          </div>
        )}
      </div>
      {/* Coloured bottom accent stripe */}
      <div className={cn('absolute bottom-0 left-0 right-0 h-1.5 sm:h-2', colors.accent)} />
    </div>
  )
}
