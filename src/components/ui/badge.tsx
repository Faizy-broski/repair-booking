import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:     'bg-primary-container text-on-primary-container',
        success:     'bg-success/15 text-success',
        warning:     'bg-warning/15 text-warning',
        destructive: 'bg-error-container text-on-error-container',
        secondary:   'bg-surface-container-high text-on-surface-variant',
        purple:      'bg-purple-100 text-purple-800',
        orange:      'bg-orange-100 text-orange-800',
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
}
