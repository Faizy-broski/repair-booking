import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:     'bg-primary/10 text-primary',
        success:     'bg-success/10 text-success',
        warning:     'bg-warning/10 text-warning',
        destructive: 'bg-error/10 text-error',
        secondary:   'bg-surface-container text-on-surface-variant',
        purple:      'bg-violet-500/10 text-violet-600',
        orange:      'bg-orange-500/10 text-orange-600',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

// Status badge helpers
export const REPAIR_STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  received:       'secondary',
  in_progress:    'warning',
  waiting_parts:  'orange',
  repaired:       'success',
  unrepairable:   'destructive',
  collected:      'default',
  refunded:       'destructive',
}

export const SUBSCRIPTION_STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  active:    'success',
  trialing:  'default',
  past_due:  'warning',
  canceled:  'destructive',
  suspended: 'destructive',
  expired:   'destructive',
  incomplete: 'warning',
}
