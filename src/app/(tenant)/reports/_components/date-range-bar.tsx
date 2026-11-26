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
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* From + To side by side on all sizes */}
        <div className="grid grid-cols-2 gap-3 flex-1">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-on-surface-variant">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onFrom(e.target.value)}
              className="h-10 w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-sm text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-on-surface-variant">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onTo(e.target.value)}
              className="h-10 w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-sm text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        {/* Apply full-width on mobile, auto on desktop */}
        <Button variant="outline" onClick={onApply} className="w-full shrink-0 sm:w-auto">
          <RefreshCw className="h-3.5 w-3.5" /> Apply
        </Button>
      </div>
    </div>
  )
}
