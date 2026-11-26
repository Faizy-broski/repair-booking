'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/* Shared building blocks for the tenant app (Figma "irepairly dashboard").
   Visual primitives only — callers keep all their own state and behaviour. */

type TabItem<T extends string> = {
  value: T
  label: React.ReactNode
  icon?: React.ElementType
  /** Render as a link instead of a button */
  href?: string
  count?: number
}

/** Underline tabs: active tab is teal text with a 2px teal underline on a hairline. */
export function UnderlineTabs<T extends string>({
  items, value, onChange, className,
}: {
  items: TabItem<T>[]
  value: T
  onChange?: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('no-scrollbar flex gap-1 overflow-x-auto border-b border-outline-variant', className)}>
      {items.map((it) => {
        const active = it.value === value
        const cls = cn(
          '-mb-px flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm transition-colors',
          active
            ? 'border-primary bg-primary/5 font-semibold text-primary'
            : 'border-transparent font-medium text-on-surface-variant hover:text-on-surface'
        )
        const body = (
          <>
            {it.icon && <it.icon className="h-4 w-4 shrink-0" />}
            {it.label}
            {it.count !== undefined && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold', active ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant')}>
                {it.count}
              </span>
            )}
          </>
        )
        return it.href ? (
          <Link key={it.value} href={it.href} className={cls}>{body}</Link>
        ) : (
          <button key={it.value} type="button" onClick={() => onChange?.(it.value)} className={cls}>{body}</button>
        )
      })}
    </div>
  )
}

/** Segmented toggle: grey track, the active option is a white raised pill. */
export function SegmentedControl<T extends string>({
  options, value, onChange, className, size = 'md',
}: {
  options: { value: T; label: React.ReactNode }[]
  value: T
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('inline-flex w-fit flex-wrap gap-1 rounded-full bg-surface-container-low p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full font-medium transition-colors',
            size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
            value === o.value
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Empty state: round soft icon, one muted line, optional hint and action. */
export function EmptyState({
  icon: Icon, title, hint, action, className, bordered = true,
}: {
  icon?: React.ElementType
  title: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
  className?: string
  /** Draw the card border (turn off when already inside a card) */
  bordered?: boolean
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center px-6 py-16 text-center',
      bordered && 'rounded-2xl border border-outline-variant bg-surface-container-lowest',
      className
    )}>
      {Icon && (
        <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="text-sm font-medium text-on-surface-variant">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-outline">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** KPI tile used in page summary rows (smaller sibling of the dashboard StatsCard). */
export function MetricCard({
  label, value, icon: Icon, tone = 'bg-primary/10 text-primary', hint, className, onClick, active,
}: {
  label: React.ReactNode
  value: React.ReactNode
  icon?: React.ElementType
  /** Tint classes for the icon chip, e.g. 'bg-emerald-500/10 text-emerald-600' */
  tone?: string
  hint?: React.ReactNode
  className?: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'min-w-0 rounded-2xl border bg-surface-container-lowest p-4 sm:p-5',
        active ? 'border-primary ring-1 ring-primary/30' : 'border-outline-variant',
        onClick && 'cursor-pointer transition-colors hover:bg-surface-container-low',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="truncate pt-1 text-sm text-on-surface-variant">{label}</p>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-3 truncate text-2xl font-semibold leading-tight tracking-tight text-on-surface tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 truncate text-xs text-on-surface-variant">{hint}</p>}
    </div>
  )
}
