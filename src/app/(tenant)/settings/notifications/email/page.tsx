'use client'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Send, Eye as EyeIcon, EyeOff, CheckCircle2, Info,
  Mail, Globe, ArrowRight, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared/page-header'
import { useAuthStore } from '@/store/auth.store'

interface SmtpConfig {
  smtp_enabled: boolean
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_pass: string
  smtp_from: string
  smtp_secure: boolean
  is_configured: boolean
}

type Tab = 'simple' | 'business'

export default function EmailSmtpPage() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('simple')

  // ── Simple / Reply-To state ───────────────────────────────────────────────
  const [replyToEmail, setReplyToEmail]   = useState('')
  const [replyToSaving, setReplyToSaving] = useState(false)
  const [replyToMsg, setReplyToMsg]       = useState<{ ok: boolean; msg: string } | null>(null)

  // ── SMTP state ────────────────────────────────────────────────────────────
  const [smtpConfig, setSmtpConfig]   = useState<SmtpConfig | null>(null)
  const [smtpForm, setSmtpForm]       = useState({
    smtp_enabled: true,
    smtp_host: '', smtp_port: 587,
    smtp_user: '', smtp_pass: '', smtp_from: '',
    smtp_secure: false,
  })
  const [smtpShowPass, setSmtpShowPass] = useState(false)
  const [smtpTestTo, setSmtpTestTo]     = useState('')
  const [smtpMsg, setSmtpMsg]           = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving]             = useState(false)

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/settings/business')
      .then((r) => r.json())
      .then((j) => {
        if (j.data?.reply_to_email) setReplyToEmail(j.data.reply_to_email)
      })
      .catch(() => {})
  }, [])

  const { data: emailConfigData } = useQuery<SmtpConfig | null>({
    queryKey: ['settings-email', activeBranch?.id],
    queryFn:  async () => {
      const res  = await fetch('/api/settings/email')
      const json = await res.json()
      return json.data ?? null
    },
    enabled:   !!activeBranch,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!emailConfigData) return
    setSmtpConfig(emailConfigData)
    setSmtpForm({
      smtp_enabled: emailConfigData.smtp_enabled,
      smtp_host:    emailConfigData.smtp_host,
      smtp_port:    emailConfigData.smtp_port,
      smtp_user:    emailConfigData.smtp_user,
      smtp_pass:    emailConfigData.smtp_pass,
      smtp_from:    emailConfigData.smtp_from,
      smtp_secure:  emailConfigData.smtp_secure,
    })
    // Auto-select business tab if SMTP already configured
    if (emailConfigData.is_configured && emailConfigData.smtp_enabled) setTab('business')
  }, [emailConfigData])

  // ── Actions ───────────────────────────────────────────────────────────────
  async function saveReplyTo() {
    setReplyToSaving(true)
    setReplyToMsg(null)
    const res = await fetch('/api/settings/business', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reply_to_email: replyToEmail || null }),
    })
    setReplyToSaving(false)
    setReplyToMsg(res.ok ? { ok: true, msg: 'Saved! Customer replies will now go to this address.' } : { ok: false, msg: 'Failed to save.' })
    setTimeout(() => setReplyToMsg(null), 4000)
  }

  async function saveSmtpConfig() {
    setSaving(true)
    setSmtpMsg(null)
    const res  = await fetch('/api/settings/email', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(smtpForm),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['settings-email', activeBranch?.id] })
      setSmtpMsg({ ok: true, msg: 'SMTP configuration saved. Emails now send from your domain.' })
    } else {
      setSmtpMsg({ ok: false, msg: json.error?.message ?? 'Failed to save.' })
    }
  }

  async function testSmtpConfig() {
    if (!smtpTestTo) return
    setSaving(true)
    setSmtpMsg(null)
    const res  = await fetch('/api/settings/email/test', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        host: smtpForm.smtp_host, port: smtpForm.smtp_port,
        user: smtpForm.smtp_user, pass: smtpForm.smtp_pass,
        from: smtpForm.smtp_from, secure: smtpForm.smtp_secure,
        test_to: smtpTestTo,
      }),
    })
    const json = await res.json()
    setSaving(false)
    setSmtpMsg(res.ok && json.data?.success
      ? { ok: true,  msg: `Test email sent to ${smtpTestTo} — check your inbox.` }
      : { ok: false, msg: json.error?.message ?? 'Connection failed.' }
    )
  }

  const isSmtpActive = !!(smtpConfig?.is_configured && smtpForm.smtp_enabled)

  return (
    <div className="space-y-6 max-w-4xl">

      <PageHeader title="Email Settings" description="Choose how customers receive email notifications from your shop" />

      {/* ── Tab selector ── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setTab('simple')}
          className={`relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left cursor-pointer transition-colors ${
            tab === 'simple'
              ? 'border-primary bg-surface-container-lowest ring-1 ring-primary/20'
              : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
          }`}
        >
          {tab === 'simple' && (
            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            </span>
          )}
          <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tab === 'simple' ? 'bg-primary/10' : 'bg-surface-container'}`}>
            <Mail className={`h-4 w-4 ${tab === 'simple' ? 'text-primary' : 'text-on-surface-variant'}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface">
              Gmail / Personal Email
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant leading-relaxed">
              We send emails for you. Replies go to your inbox.
            </p>
          </div>
          {isSmtpActive
            ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">Inactive — SMTP active</span>
            : <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tab === 'simple' ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>Recommended</span>
          }
        </button>

        <button
          onClick={() => setTab('business')}
          className={`relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left cursor-pointer transition-colors ${
            tab === 'business'
              ? 'border-primary bg-surface-container-lowest ring-1 ring-primary/20'
              : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
          }`}
        >
          {tab === 'business' && (
            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            </span>
          )}
          {isSmtpActive && tab !== 'business' && (
            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            </span>
          )}
          <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tab === 'business' ? 'bg-primary/10' : 'bg-surface-container'}`}>
            <Globe className={`h-4 w-4 ${tab === 'business' ? 'text-primary' : 'text-on-surface-variant'}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface">
              Business Domain
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant leading-relaxed">
              Send from your own domain via SMTP.
            </p>
          </div>
          {isSmtpActive
            ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">Active</span>
            : <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tab === 'business' ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>Advanced</span>
          }
        </button>
      </div>

      {/* ── Tab: Gmail / Simple ── */}
      {tab === 'simple' && (
        <div className="space-y-4">

          {/* SMTP override warning */}
          {isSmtpActive && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-700">Business Domain SMTP is active</p>
                <p className="text-amber-700 mt-0.5">
                  Emails are currently sending from <strong>{smtpConfig?.smtp_from || smtpConfig?.smtp_user}</strong> via your SMTP.
                  The reply address below is saved but <strong>not in use</strong> while SMTP is enabled.
                  {' '}<button onClick={() => setTab('business')} className="underline hover:text-amber-700">Manage SMTP →</button>
                </p>
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-on-surface">How it works</h3>
            </div>
            <div className="space-y-2">
              {[
                { from: 'connect@repairbooking.co.uk', label: 'Sent from', sub: 'Platform handles delivery — no setup needed' },
                { from: replyToEmail || 'your email below', label: 'Replies go to', sub: 'Customer hits Reply → lands in your inbox' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-container-low px-4 py-2.5">
                  <span className="text-xs font-medium text-on-surface-variant w-16 shrink-0">{item.label}</span>
                  <ArrowRight className="h-3 w-3 text-on-surface-variant shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-on-surface font-mono">{item.from}</p>
                    <p className="text-[10px] text-on-surface-variant">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reply-to field */}
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Your Reply Address</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Customers who reply to notification emails will reach this address.</p>
            </div>
            <Input
              label="Email Address"
              type="email"
              placeholder="yourshop@gmail.com"
              value={replyToEmail}
              onChange={(e) => setReplyToEmail(e.target.value)}
            />
            {replyToMsg && (
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                replyToMsg.ok ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700' : 'border-red-500/20 bg-red-500/5 text-red-600'
              }`}>
                {replyToMsg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
                {replyToMsg.msg}
              </div>
            )}
            <Button onClick={saveReplyTo} loading={replyToSaving}>
              <CheckCircle2 className="h-4 w-4" /> Save
            </Button>
          </div>

        </div>
      )}

      {/* ── Tab: Business Domain / SMTP ── */}
      {tab === 'business' && (
        <div className="space-y-4">

          {/* Status */}
          {isSmtpActive && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Emails sending from <strong>{smtpConfig?.smtp_from || smtpConfig?.smtp_user}</strong></span>
            </div>
          )}
          {smtpConfig?.is_configured && !smtpForm.smtp_enabled && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
              <Info className="h-4 w-4 shrink-0" />
              SMTP configured but <strong className="mx-1">disabled</strong> — toggle on below to activate.
            </div>
          )}

          {/* SMTP form */}
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-on-surface">SMTP Configuration</h3>
                <p className="mt-0.5 text-xs text-on-surface-variant">Emails send directly from your domain</p>
              </div>
              <button
                type="button"
                onClick={() => setSmtpForm((f) => ({ ...f, smtp_enabled: !f.smtp_enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  smtpForm.smtp_enabled ? 'bg-primary' : 'bg-surface-container-high'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-surface-container-lowest shadow transition-transform ${
                  smtpForm.smtp_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="SMTP Host"
                value={smtpForm.smtp_host}
                onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_host: e.target.value }))}
                placeholder="mail.yourdomain.com"
              />
              <Input
                label="Port"
                type="number"
                value={smtpForm.smtp_port}
                onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_port: parseInt(e.target.value) || 587 }))}
                hint={smtpForm.smtp_secure ? '465 for SSL' : '587 for TLS'}
              />
            </div>

            <Input
              label="Username / Email"
              value={smtpForm.smtp_user}
              onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_user: e.target.value }))}
              placeholder="noreply@yourdomain.com"
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-on-surface-variant">Password / App Password</label>
              <div className="relative">
                <input
                  type={smtpShowPass ? 'text' : 'password'}
                  value={smtpForm.smtp_pass}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_pass: e.target.value }))}
                  placeholder={smtpConfig?.is_configured ? '••••••••  (leave blank to keep)' : 'Enter password'}
                  className="h-10 w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 pr-10 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSmtpShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  tabIndex={-1}
                >
                  {smtpShowPass ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Input
              label="From Address"
              value={smtpForm.smtp_from}
              onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_from: e.target.value }))}
              placeholder="repairs@yourdomain.com"
              hint="This is what customers see as the sender."
            />

            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setSmtpForm((f) => ({ ...f, smtp_secure: !f.smtp_secure, smtp_port: !f.smtp_secure ? 465 : 587 }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${smtpForm.smtp_secure ? 'bg-primary' : 'bg-surface-container-high'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface-container-lowest shadow transition-transform ${smtpForm.smtp_secure ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-on-surface-variant">Use SSL (port 465) — off means TLS/STARTTLS (port 587)</span>
            </label>

            {smtpMsg && (
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                smtpMsg.ok ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700' : 'border-red-500/20 bg-red-500/5 text-red-600'
              }`}>
                {smtpMsg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
                {smtpMsg.msg}
              </div>
            )}

            <Button
              onClick={saveSmtpConfig}
              loading={saving}
              disabled={!smtpForm.smtp_host || !smtpForm.smtp_user || !smtpForm.smtp_from}
            >
              Save Configuration
            </Button>
          </div>

          {/* Test connection */}
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-3">
            <h3 className="text-base font-semibold text-on-surface">Send Test Email</h3>
            <p className="text-xs text-on-surface-variant">Verify your settings work before going live. Uses the credentials entered above.</p>
            <div className="flex gap-2">
              <Input
                placeholder="test@example.com"
                value={smtpTestTo}
                onChange={(e) => setSmtpTestTo(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={testSmtpConfig}
                loading={saving}
                disabled={!smtpTestTo || !smtpForm.smtp_host || !smtpForm.smtp_user || !smtpForm.smtp_pass}
              >
                <Send className="h-4 w-4" /> Test
              </Button>
            </div>
          </div>

          {/* Provider hints */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-2">
            <p className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> Quick reference
            </p>
            <div className="space-y-1.5">
              {[
                { name: 'Gmail',           host: 'smtp.gmail.com',       port: '587', note: 'Use an App Password — not your main password' },
                { name: 'Outlook / 365',   host: 'smtp.office365.com',   port: '587', note: 'TLS, use your Microsoft email + password' },
                { name: 'Custom domain',   host: 'mail.yourdomain.com',  port: '465', note: 'Check cPanel / Plesk for exact credentials' },
              ].map((p) => (
                <div key={p.name} className="flex items-start gap-2 text-xs text-on-surface">
                  <span className="font-semibold w-24 shrink-0">{p.name}</span>
                  <span className="font-mono text-on-surface-variant">{p.host}:{p.port}</span>
                  <span className="text-on-surface-variant">— {p.note}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
