'use client'
import { useState } from 'react'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

// lucide-react has no WhatsApp brand glyph — same path used elsewhere in the
// app (receipt-print.ts's footer social icons) for a consistent brand mark.
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.36a9.85 9.85 0 0 0 4.62 1.17h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.64-1.03-5.13-2.9-7C17.17 3.03 14.68 2 12.04 2zm5.86 14.11c-.25.7-1.45 1.34-2 1.43-.5.08-1.14.11-1.84-.12-.42-.14-.96-.31-1.65-.61-2.9-1.26-4.8-4.17-4.94-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.77-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.72.81 2.02.96.3.15.5.22.57.35.07.13.07.75-.18 1.45z" />
    </svg>
  )
}

/** Sends a document via WhatsApp (GET → wa.me link) — shared by every invoice/receipt surface. */
export async function sendWhatsAppFromUrl(url: string): Promise<boolean> {
  const res = await fetch(url)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.data?.url) {
    toast.error(json.error?.message ?? 'Failed to prepare WhatsApp message.')
    return false
  }
  window.open(json.data.url, '_blank')
  return true
}

/** Sends a document via email (POST) and toasts the outcome. */
export async function sendEmailFromUrl(url: string, email?: string | null): Promise<boolean> {
  const res = await fetch(url, { method: 'POST' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.data?.sent) {
    toast.error(json.error?.message ?? 'Failed to send email.')
    return false
  }
  toast.success(email ? `Sent to ${email}.` : 'Email sent.')
  return true
}

interface Props {
  whatsappUrl: string
  emailUrl: string
  phone?: string | null
  email?: string | null
}

/** WhatsApp + Email buttons. Each only renders when the customer has that contact detail. */
export function SendDocumentActions({ whatsappUrl, emailUrl, phone, email }: Props) {
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)

  async function wa() {
    setSendingWhatsApp(true)
    try { await sendWhatsAppFromUrl(whatsappUrl) } finally { setSendingWhatsApp(false) }
  }
  async function mail() {
    setSendingEmail(true)
    try { await sendEmailFromUrl(emailUrl, email) } finally { setSendingEmail(false) }
  }

  return (
    <>
      {!!phone && (
        <Button variant="success" className="whitespace-nowrap shrink-0" loading={sendingWhatsApp} onClick={wa}>
          <WhatsAppIcon className="h-4 w-4 mr-2" />
          WhatsApp
        </Button>
      )}
      {!!email && (
        <Button className="whitespace-nowrap shrink-0 bg-blue-600 text-white hover:bg-blue-700" loading={sendingEmail} onClick={mail}>
          <Mail className="h-4 w-4 mr-2" />
          Email
        </Button>
      )}
    </>
  )
}
