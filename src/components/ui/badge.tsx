import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:     'bg-blue-100 text-blue-800',
        success:     'bg-green-100 text-green-800',
        warning:     'bg-yellow-100 text-yellow-800',
        destructive: 'bg-red-100 text-red-800',
        secondary:   'bg-gray-100 text-gray-700',
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
}

export const SUBSCRIPTION_STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  active:    'success',
  trialing:  'default',
  past_due:  'warning',
  canceled:  'destructive',
  suspended: 'destructive',
}
