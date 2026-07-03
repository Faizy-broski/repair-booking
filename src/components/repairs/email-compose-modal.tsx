'use client'
import { useState } from 'react'
import { Mail, X, Check, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { cn } from '@/lib/utils'

interface EmailComposeModalProps {
  repairId: string
  jobNumber: string
  customerEmail: string
  customerName: string
  onClose: () => void
}

export function EmailComposeModal({
  repairId,
  jobNumber,
  customerEmail,
  customerName,
  onClose,
}: EmailComposeModalProps) {
  const [subject, setSubject] = useState(`Update on your repair — Job #${jobNumber}`)
  const [html, setHtml] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSend = subject.trim().length > 0 && html.trim().length > 0 && !sending

  async function sendEmail() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/repairs/${repairId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html }),
      })
      if (res.ok) {
        setSent(true)
        setTimeout(onClose, 2400)
      } else {
        const json = await res.json().catch(() => null) as { error?: { message?: string } | string } | null
        const msg = typeof json?.error === 'string' ? json.error : json?.error?.message
        setError(msg ?? 'Could not send the email. Please try again.')
      }
    } catch {
      setError('Could not send the email. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!sending ? onClose : undefined} />

      <div className="relative z-10 flex w-full max-w-lg max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
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
              {sent ? 'Email Sent!' : 'Compose Email'}
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Email sent successfully</p>
                <p className="mt-1 text-sm text-gray-500">Sent to {customerName} for job <span className="font-medium text-gray-700">{jobNumber}</span>.</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">To</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {customerName} &lt;{customerEmail}&gt;
                </div>
              </div>

              <Input
                label="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />

              <RichTextEditor
                label="Message"
                value={html}
                onChange={setHtml}
                placeholder="Write your email to the customer…"
                minHeight={180}
              />

              {error && (
                <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {!sent && (
          <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 px-6 py-4 shrink-0">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button disabled={!canSend} loading={sending} onClick={sendEmail}>
              <Send className="h-4 w-4" />
              Send Email
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
