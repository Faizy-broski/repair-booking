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
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   iconBg: 'bg-blue-100' },
  green:  { bg: 'bg-green-50',  icon: 'text-green-600',  iconBg: 'bg-green-100' },
  yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-600', iconBg: 'bg-yellow-100' },
  red:    { bg: 'bg-red-50',    icon: 'text-red-600',    iconBg: 'bg-red-100' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', iconBg: 'bg-purple-100' },
}

export function StatsCard({ title, value, subtitle, icon, trend, color = 'blue', className }: StatsCardProps) {
  const colors = COLOR_CLASSES[color]

  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-5', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 flex items-center gap-1 text-xs">
              {trend !== undefined && (
                <>
                  {trend > 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : trend < 0 ? (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  ) : (
                    <Minus className="h-3 w-3 text-gray-400" />
                  )}
                  <span className={trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-400'}>
                    {Math.abs(trend)}%
                  </span>
                </>
              )}
              <span className="text-gray-400">{subtitle}</span>
            </p>
          )}
        </div>
        {icon && (
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', colors.iconBg)}>
            <span className={colors.icon}>{icon}</span>
          </div>
        )}
      </div>
    </div>
  )
}
