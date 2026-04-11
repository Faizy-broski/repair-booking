'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Server, Settings2, Send, Eye as EyeIcon, EyeOff,
  CheckCircle2, Info, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export default function EmailSmtpPage() {
  const { activeBranch } = useAuthStore()

  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig | null>(null)
  const [smtpForm, setSmtpForm] = useState({
    smtp_enabled: true,
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_secure: false,
  })
  const [smtpShowPass, setSmtpShowPass] = useState(false)
  const [smtpTestTo, setSmtpTestTo] = useState('')
  const [smtpTestMsg, setSmtpTestMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchSmtpConfig = useCallback(async () => {
    const res = await fetch('/api/settings/email')
    const json = await res.json()
    const cfg: SmtpConfig | null = json.data ?? null
    setSmtpConfig(cfg)
    if (cfg) {
      setSmtpForm({
        smtp_enabled: cfg.smtp_enabled,
        smtp_host: cfg.smtp_host,
        smtp_port: cfg.smtp_port,
        smtp_user: cfg.smtp_user,
        smtp_pass: cfg.smtp_pass,
        smtp_from: cfg.smtp_from,
        smtp_secure: cfg.smtp_secure,
      })
    }
  }, [])

  useEffect(() => {
    if (!activeBranch) return
    fetchSmtpConfig()
  }, [activeBranch, fetchSmtpConfig])

  async function saveSmtpConfig() {
    setSaving(true)
    setSmtpTestMsg(null)
    const res = await fetch('/api/settings/email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(smtpForm),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok) {
      await fetchSmtpConfig()
      setSmtpTestMsg({ ok: true, msg: 'Configuration saved successfully.' })
    } else {
      setSmtpTestMsg({ ok: false, msg: json.error?.message ?? json.error ?? 'Failed to save.' })
    }
  }

  async function testSmtpConfig() {
    if (!smtpTestTo) return
    setSaving(true)
    setSmtpTestMsg(null)
    const res = await fetch('/api/settings/email/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: smtpForm.smtp_host,
        port: smtpForm.smtp_port,
        user: smtpForm.smtp_user,
        pass: smtpForm.smtp_pass,
        from: smtpForm.smtp_from,
        secure: smtpForm.smtp_secure,
        test_to: smtpTestTo,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok && json.data?.success) {
      setSmtpTestMsg({ ok: true, msg: `Test email sent to ${smtpTestTo}. Check your inbox.` })
    } else {
      setSmtpTestMsg({ ok: false, msg: json.error?.message ?? json.error ?? 'Connection failed.' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
          <Server className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email (SMTP)</h1>
          <p className="text-sm text-gray-500">Configure your outbound email server for customer notifications</p>
        </div>
      </div>

      <div className="max-w-lg space-y-6">
        {/* Status badge */}
        {smtpConfig?.is_configured && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Custom SMTP is configured. Emails send from <strong>{smtpConfig.smtp_from || smtpConfig.smtp_user}</strong>
          </div>
        )}

        {/* Main config card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">SMTP Configuration</h3>
            <button
              type="button"
              onClick={() => setSmtpForm((f) => ({ ...f, smtp_enabled: !f.smtp_enabled }))}
              className="flex items-center gap-2 text-sm font-medium text-gray-700"
              title={smtpForm.smtp_enabled ? 'Disable custom SMTP' : 'Enable custom SMTP'}
            >
              {smtpForm.smtp_enabled
                ? <ToggleRight className="h-6 w-6 text-blue-600" />
                : <ToggleLeft className="h-6 w-6 text-gray-400" />
              }
              {smtpForm.smtp_enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <p className="text-sm text-gray-500">
            When enabled, all customer emails (repair updates, invoices, etc.) are sent through your own SMTP server instead of the platform default.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Input
                label="SMTP Host"
                value={smtpForm.smtp_host}
                onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_host: e.target.value }))}
                placeholder="smtp.gmail.com"
                required
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Input
                label="Port"
                type="number"
                value={smtpForm.smtp_port}
                onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_port: parseInt(e.target.value) || 587 }))}
                placeholder="587"
                hint={smtpForm.smtp_secure ? '465 for SSL' : '587 for TLS (recommended)'}
              />
            </div>
          </div>

          <Input
            label="Username / Email"
            value={smtpForm.smtp_user}
            onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_user: e.target.value }))}
            placeholder="you@yourdomain.com"
            required
          />

          <div className="relative">
            <Input
              label="Password / App Password"
              type={smtpShowPass ? 'text' : 'password'}
              value={smtpForm.smtp_pass}
              onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_pass: e.target.value }))}
              placeholder={smtpConfig?.is_configured ? 'Leave blank to keep existing password' : 'Enter SMTP password'}
              hint="For Gmail, use an App Password. Never use your main Google password."
            />
            <button
              type="button"
              onClick={() => setSmtpShowPass((v) => !v)}
              className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {smtpShowPass ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>

          <Input
            label="From Address"
            value={smtpForm.smtp_from}
            onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_from: e.target.value }))}
            placeholder="repairs@myshop.com"
            hint='Shown as the sender to your customers. e.g. "My Shop <repairs@myshop.com>"'
            required
          />

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={smtpForm.smtp_secure}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              onChange={(e) => setSmtpForm((f) => ({
                ...f,
                smtp_secure: e.target.checked,
                smtp_port: e.target.checked ? 465 : 587,
              }))}
            />
            <span className="text-sm text-gray-700">
              Use SSL (port 465) — leave unchecked for TLS/STARTTLS (port 587)
            </span>
          </label>

          {smtpTestMsg && (
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              smtpTestMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {smtpTestMsg.ok
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <Info className="h-4 w-4 shrink-0" />
              }
              {smtpTestMsg.msg}
            </div>
          )}

          <Button
            onClick={saveSmtpConfig}
            loading={saving}
            disabled={!smtpForm.smtp_host || !smtpForm.smtp_user || !smtpForm.smtp_from}
          >
            <Settings2 className="h-4 w-4" /> Save Configuration
          </Button>
        </div>

        {/* Test connection card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Test Connection</h3>
          <p className="text-sm text-gray-500">
            Send a test email using the settings above (saves are not required — credentials above are used directly).
          </p>
          <div className="flex gap-3">
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
              <Send className="h-4 w-4" /> Send Test
            </Button>
          </div>
        </div>

        {/* Help */}
        <div className="rounded-md bg-blue-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div className="text-sm text-blue-700 space-y-1">
              <p><strong>Gmail users:</strong> Enable 2-Step Verification, then create an App Password at myaccount.google.com/apppasswords.</p>
              <p><strong>Outlook / Microsoft 365:</strong> Use smtp.office365.com, port 587, TLS.</p>
              <p><strong>Custom domain:</strong> Check your hosting panel (cPanel / Plesk) for SMTP credentials.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
