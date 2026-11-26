import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Small "‹ Back to …" link above the title */
  back?: { href: string; label: string }
  /** Buttons shown on the right */
  actions?: React.ReactNode
  className?: string
}

/** Page title block (Figma design): optional back link, large title, muted line, actions on the right. */
export function PageHeader({ title, description, back, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-on-surface-variant transition-colors hover:text-on-surface">
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface">{title}</h1>
          {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

interface FilterPillsProps<T extends string> {
  options: { value: T; label: React.ReactNode }[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** Row of pill filters (Figma design): the active one is a soft teal pill. */
export function FilterPills<T extends string>({ options, value, onChange, className }: FilterPillsProps<T>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
            value === o.value
              ? 'bg-primary/10 text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
