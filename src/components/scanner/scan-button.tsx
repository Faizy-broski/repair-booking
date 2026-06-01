'use client'
import { ScanLine } from 'lucide-react'

interface ScanButtonProps {
  onClick: () => void
  label?: string
  className?: string
}

export function ScanButton({ onClick, label = 'Scan', className = '' }: ScanButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-teal bg-white px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-teal-50 active:bg-teal-100 ${className}`}
    >
      <ScanLine className="h-4 w-4" />
      {label}
    </button>
  )
}
