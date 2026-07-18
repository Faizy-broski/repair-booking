import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export interface SectionCardProps {
  title: React.ReactNode
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

export function SectionCard({ title, description, action, children, className, contentClassName }: SectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn('space-y-4', contentClassName)}>{children}</CardContent>
    </Card>
  )
}
