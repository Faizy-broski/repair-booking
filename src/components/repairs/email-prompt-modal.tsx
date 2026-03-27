'use client'
import { useState } from 'react'
import { Mail, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RepairEmailPromptProps {
  repairId: string
  jobNumber: string
  newStatus?: string
  onClose: () => void
}

export function RepairEmailPrompt({ repairId, jobNumber, newStatus, onClose }: RepairEmailPromptProps) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function sendEmail() {
    setSending(true)
    await fetch(`/api/repairs/${repairId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, send_email: true }),
    })
    setSent(true)
    setSending(false)
    setTimeout(onClose, 2000)
  }

  return (
    // Toast-style — bottom right, non-blocking
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 flex w-80 items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg',
        'animate-in slide-in-from-bottom-4'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100">
        {sent ? <Check className="h-5 w-5 text-green-600" /> : <Mail className="h-5 w-5 text-blue-600" />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">
          {sent ? 'Email sent!' : 'Notify customer?'}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {sent ? `Customer notified about ${jobNumber}` : `Status updated for ${jobNumber}. Send email notification?`}
        </p>
        {!sent && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" loading={sending} onClick={sendEmail}>
              Send Email
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Skip
            </Button>
          </div>
        )}
      </div>
      <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
