'use client'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  dateFrom: string
  dateTo: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  onApply: () => void
}

export function DateRangeBar({ dateFrom, dateTo, onFrom, onTo, onApply }: Props) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* From + To side by side on all sizes */}
        <div className="grid grid-cols-2 gap-3 flex-1">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-on-surface-variant">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onFrom(e.target.value)}
              className="h-9 w-full rounded-md border border-outline bg-surface px-2 text-sm text-on-surface"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-on-surface-variant">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onTo(e.target.value)}
              className="h-9 w-full rounded-md border border-outline bg-surface px-2 text-sm text-on-surface"
            />
          </div>
        </div>
        {/* Apply full-width on mobile, auto on desktop */}
        <Button size="sm" variant="outline" onClick={onApply} className="w-full sm:w-auto shrink-0">
          <RefreshCw className="h-3.5 w-3.5" /> Apply
        </Button>
      </div>
    </div>
  )
}
