'use client'
import { useState } from 'react'
import { Mail, X, Check, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RepairEmailPromptProps {
  repairId: string
  jobNumber: string
  currentStatus?: string
  /** @deprecated prefer currentStatus */
  newStatus?: string
  /** When true: renders as a centered full-screen modal. Default: bottom-right toast. */
  modal?: boolean
  onClose: () => void
}

export function RepairEmailPrompt({
  repairId,
  jobNumber,
  currentStatus,
  newStatus,
  modal = false,
  onClose,
}: RepairEmailPromptProps) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(false)

  async function sendEmail() {
    setSending(true)
    setError(false)
    try {
      const res = await fetch(`/api/repairs/${repairId}/notify`, { method: 'POST' })
      if (res.ok) {
        setSent(true)
        setTimeout(onClose, 2400)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setSending(false)
    }
  }

  if (modal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!sending ? onClose : undefined} />

        {/* Panel */}
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full',
                sent ? 'bg-green-100' : error ? 'bg-red-100' : 'bg-blue-100'
              )}>
                {sending
                  ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  : sent
                    ? <Check className="h-5 w-5 text-green-600" />
                    : <Mail className={cn('h-5 w-5', error ? 'text-red-500' : 'text-blue-600')} />
                }
              </div>
              <h2 className="text-base font-semibold text-gray-900">
                {sent ? 'Email Sent!' : error ? 'Failed to Send' : 'Send Customer Notification'}
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={sending}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6 space-y-4">
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900">Email sent successfully</p>
                  <p className="mt-1 text-sm text-gray-500">Customer has been notified for job <span className="font-medium text-gray-700">{jobNumber}</span>.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-blue-900">Job #{jobNumber}</p>
                      <p className="text-xs text-blue-700">
                        An email notification will be sent to the customer with the current repair status update.
                      </p>
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                    Could not send the email. Please check your notification settings and try again.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {!sent && (
            <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 px-6 py-4">
              <Button variant="outline" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button
                disabled={sending}
                loading={sending}
                onClick={sendEmail}
              >
                <Send className="h-4 w-4" />
                Send Notification
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Bottom-right toast (status change feedback) ──────────────────────────────
  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 flex w-80 items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-xl',
        'animate-in slide-in-from-bottom-4 duration-300'
      )}
    >
      <div className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
        sent ? 'bg-green-100' : error ? 'bg-red-100' : 'bg-blue-100'
      )}>
        {sending
          ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          : sent
            ? <Check className="h-5 w-5 text-green-600" />
            : <Mail className={cn('h-5 w-5', error ? 'text-red-500' : 'text-blue-600')} />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">
          {sent ? 'Email sent!' : error ? 'Failed to send' : 'Notify customer?'}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
          {sent
            ? `Customer notified for job ${jobNumber}.`
            : error
              ? 'Could not send email. Please try again.'
              : `Status updated for ${jobNumber}. Send email?`
          }
        </p>
        {!sent && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={sending} loading={sending} onClick={sendEmail}>
              <Mail className="h-3.5 w-3.5" /> Send Email
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={sending}>
              Skip
            </Button>
          </div>
        )}
      </div>

      <button onClick={onClose} disabled={sending} className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors disabled:opacity-30">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
