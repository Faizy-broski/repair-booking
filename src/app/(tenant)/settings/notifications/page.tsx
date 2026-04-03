'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Bell, Mail, MessageSquare, Send, Eye, ChevronDown, ChevronRight,
  RefreshCw, Settings2, Clock, CheckCircle2, XCircle, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Select, type SelectOption } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth.store'

// ── Types ────────────────────────────────────────────────────────────────────

interface NotificationTemplate {
  id: string
  trigger_event: string
  channel: 'email' | 'sms' | 'both'
  subject: string | null
  email_body: string | null
  sms_body: string | null
  is_active: boolean
  updated_at: string
}

interface NotificationLogEntry {
  id: string
  trigger_event: string
  channel: 'email' | 'sms'
  recipient: string
  subject: string | null
  body: string
  status: 'sent' | 'failed' | 'queued'
  error_message: string | null
  created_at: string
}

interface InvoiceReminderSettings {
  enabled: boolean
  days_before_due: number
  days_after_overdue: number[]
  channel: 'email' | 'sms' | 'both'
}

interface SmsConfig {
  sms_gateway: string | null
  sms_api_key: string | null
  sms_api_secret: string | null
  sms_sender_id: string | null
  is_configured: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  ticket_created:         'Ticket Created',
  ticket_status_changed:  'Ticket Status Changed',
  repair_ready:           'Repair Ready for Collection',
  invoice_created:        'Invoice Created',
  invoice_overdue:        'Invoice Overdue',
  part_arrived:           'Part Arrived',
  estimate_sent:          'Estimate Sent',
  estimate_approved:      'Estimate Approved',
  estimate_declined:      'Estimate Declined',
  appointment_reminder:   'Appointment Reminder',
}

const CHANNEL_OPTIONS: SelectOption[] = [
  { value: 'email', label: 'Email Only' },
  { value: 'sms',   label: 'SMS Only' },
  { value: 'both',  label: 'Email + SMS' },
]

const GATEWAY_OPTIONS: SelectOption[] = [
  { value: 'twilio',     label: 'Twilio' },
  { value: 'textlocal',  label: 'TextLocal' },
  { value: 'smsglobal',  label: 'SMSGlobal' },
]

type Tab = 'templates' | 'sms' | 'reminders' | 'log'

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
  const { activeBranch, isOwner } = useAuthStore()
  const [tab, setTab] = useState<Tab>('templates')

  // Data
  const [templates, setTemplates]           = useState<NotificationTemplate[]>([])
  const [macroCatalog, setMacroCatalog]     = useState<Record<string, string[]>>({})
  const [smsConfig, setSmsConfig]           = useState<SmsConfig | null>(null)
  const [reminderSettings, setReminderSettings] = useState<InvoiceReminderSettings>({
    enabled: false, days_before_due: 3, days_after_overdue: [1, 7, 14], channel: 'email',
  })
  const [logEntries, setLogEntries] = useState<NotificationLogEntry[]>([])
  const [logTotal, setLogTotal]     = useState(0)
  const [logPage, setLogPage]       = useState(1)

  // Template editing
  const [editModal, setEditModal] = useState<{ open: boolean; template: NotificationTemplate | null }>({ open: false, template: null })
  const [editForm, setEditForm]   = useState({ channel: 'email' as string, subject: '', email_body: '', sms_body: '', is_active: true })

  // Preview modal
  const [previewModal, setPreviewModal] = useState<{ open: boolean; subject: string; emailBody: string; smsBody: string }>({ open: false, subject: '', emailBody: '', smsBody: '' })

  // SMS config form
  const [smsForm, setSmsForm] = useState({ gateway: '', api_key: '', api_secret: '', sender_id: '' })
  const [smsTestNumber, setSmsTestNumber] = useState('')

  // Test notification
  const [testModal, setTestModal] = useState<{ open: boolean; triggerEvent: string }>({ open: false, triggerEvent: '' })
  const [testChannel, setTestChannel] = useState<'email' | 'sms'>('email')
  const [testRecipient, setTestRecipient] = useState('')

  // Loading states
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    const res = await fetch('/api/settings/notifications')
    const json = await res.json()
    setTemplates(json.data?.templates ?? [])
    setMacroCatalog(json.data?.macro_catalog ?? {})
  }, [])

  const fetchSmsConfig = useCallback(async () => {
    const res = await fetch('/api/settings/sms')
    const json = await res.json()
    setSmsConfig(json.data ?? null)
  }, [])

  const fetchReminders = useCallback(async () => {
    const res = await fetch('/api/settings/invoice-reminders')
    const json = await res.json()
    if (json.data) setReminderSettings(json.data)
  }, [])

  const fetchLog = useCallback(async (page = 1) => {
    const res = await fetch(`/api/settings/notification-log?page=${page}&limit=20`)
    const json = await res.json()
    setLogEntries(json.data ?? [])
    setLogTotal(json.meta?.total ?? 0)
    setLogPage(page)
  }, [])

  useEffect(() => {
    if (!activeBranch) return
    fetchTemplates()
    fetchSmsConfig()
    fetchReminders()
  }, [activeBranch, fetchTemplates, fetchSmsConfig, fetchReminders])

  useEffect(() => {
    if (tab === 'log') fetchLog(1)
  }, [tab, fetchLog])

  // ── Seed defaults ──────────────────────────────────────────────────────────

  async function seedDefaults() {
    setLoading(true)
    await fetch('/api/settings/notifications/seed', { method: 'POST' })
    await fetchTemplates()
    setLoading(false)
  }

  // ── Template CRUD ──────────────────────────────────────────────────────────

  function openEditTemplate(t: NotificationTemplate) {
    setEditForm({
      channel: t.channel,
      subject: t.subject ?? '',
      email_body: t.email_body ?? '',
      sms_body: t.sms_body ?? '',
      is_active: t.is_active,
    })
    setEditModal({ open: true, template: t })
  }

  async function saveTemplate() {
    if (!editModal.template) return
    setSaving(true)
    await fetch(`/api/settings/notifications/${editModal.template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    setEditModal({ open: false, template: null })
    await fetchTemplates()
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  async function previewTemplate(triggerEvent: string) {
    const res = await fetch('/api/settings/notifications/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger_event: triggerEvent }),
    })
    const json = await res.json()
    if (json.data) {
      setPreviewModal({
        open: true,
        subject: json.data.subject ?? '',
        emailBody: json.data.emailBody ?? '',
        smsBody: json.data.smsBody ?? '',
      })
    }
  }

  // ── Test Notification ──────────────────────────────────────────────────────

  async function sendTestNotification() {
    setSaving(true)
    await fetch('/api/settings/notifications/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger_event: testModal.triggerEvent, channel: testChannel, recipient: testRecipient }),
    })
    setSaving(false)
    setTestModal({ open: false, triggerEvent: '' })
    setTestRecipient('')
  }

  // ── SMS Config ─────────────────────────────────────────────────────────────

  async function saveSmsConfig() {
    setSaving(true)
    await fetch('/api/settings/sms', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sms_gateway: smsForm.gateway,
        sms_api_key: smsForm.api_key,
        sms_api_secret: smsForm.api_secret || undefined,
        sms_sender_id: smsForm.sender_id || undefined,
      }),
    })
    setSaving(false)
    await fetchSmsConfig()
  }

  async function testSms() {
    if (!smsTestNumber) return
    setSaving(true)
    const res = await fetch('/api/settings/sms/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_number: smsTestNumber }),
    })
    const json = await res.json()
    setSaving(false)
    alert(json.data?.success ? 'Test SMS sent successfully!' : `Failed: ${json.error?.message ?? 'Unknown error'}`)
  }

  // ── Invoice Reminders ──────────────────────────────────────────────────────

  async function saveReminders() {
    setSaving(true)
    await fetch('/api/settings/invoice-reminders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reminderSettings),
    })
    setSaving(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabClasses = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
      tab === t ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">Configure automated email and SMS notifications for your business</p>
        </div>
        {tab === 'templates' && templates.length === 0 && (
          <Button onClick={seedDefaults} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Load Default Templates
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button className={tabClasses('templates')} onClick={() => setTab('templates')}>
          <Mail className="mr-1.5 inline h-4 w-4" /> Templates
        </button>
        <button className={tabClasses('sms')} onClick={() => setTab('sms')}>
          <MessageSquare className="mr-1.5 inline h-4 w-4" /> SMS Gateway
        </button>
        <button className={tabClasses('reminders')} onClick={() => setTab('reminders')}>
          <Clock className="mr-1.5 inline h-4 w-4" /> Invoice Reminders
        </button>
        <button className={tabClasses('log')} onClick={() => setTab('log')}>
          <Bell className="mr-1.5 inline h-4 w-4" /> Delivery Log
        </button>
      </div>

      {/* ── Tab: Templates ──────────────────────────────────────────────────── */}
      {tab === 'templates' && (
        <div className="space-y-3">
          {templates.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
              <Bell className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-gray-500">No notification templates configured yet.</p>
              <Button className="mt-3" onClick={seedDefaults} loading={loading}>Load Default Templates</Button>
            </div>
          )}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{TRIGGER_LABELS[t.trigger_event] ?? t.trigger_event}</span>
                  <Badge variant={t.is_active ? 'success' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                  <Badge variant={t.channel === 'email' ? 'default' : t.channel === 'sms' ? 'success' : 'purple'}>
                    {t.channel === 'both' ? 'Email + SMS' : t.channel.toUpperCase()}
                  </Badge>
                </div>
                {t.subject && <p className="mt-1 text-sm text-gray-500 truncate max-w-xl">{t.subject}</p>}
                {/* Available macros */}
                {macroCatalog[t.trigger_event] && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {macroCatalog[t.trigger_event].map((m) => (
                      <code key={m} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{`{{${m}}}`}</code>
                    ))}
                  </div>
                )}
              </div>
              <div className="ml-4 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => previewTemplate(t.trigger_event)} title="Preview">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setTestModal({ open: true, triggerEvent: t.trigger_event }); setTestChannel('email') }} title="Send Test">
                  <Send className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEditTemplate(t)}>Edit</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: SMS Gateway ────────────────────────────────────────────────── */}
      {tab === 'sms' && (
        <div className="max-w-lg space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">SMS Gateway Configuration</h3>
            {smsConfig?.is_configured && (
              <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" /> SMS gateway is configured ({smsConfig.sms_gateway})
              </div>
            )}
            <div className="space-y-4">
              <Select label="Gateway Provider" options={GATEWAY_OPTIONS} value={smsForm.gateway}
                onValueChange={(v) => setSmsForm((f) => ({ ...f, gateway: v }))} required />
              <Input label="API Key / Account SID" value={smsForm.api_key}
                onChange={(e) => setSmsForm((f) => ({ ...f, api_key: e.target.value }))} required
                placeholder={smsConfig?.sms_api_key ?? 'Enter API key'} />
              <Input label="API Secret / Auth Token" value={smsForm.api_secret}
                onChange={(e) => setSmsForm((f) => ({ ...f, api_secret: e.target.value }))}
                type="password" placeholder="Enter secret (leave blank to keep existing)" />
              <Input label="Sender ID / From Number" value={smsForm.sender_id}
                onChange={(e) => setSmsForm((f) => ({ ...f, sender_id: e.target.value }))}
                placeholder={smsConfig?.sms_sender_id ?? '+447911123456'} hint="E.164 format for Twilio, alphanumeric for others" />
              <div className="flex gap-3">
                <Button onClick={saveSmsConfig} loading={saving} disabled={!smsForm.gateway || !smsForm.api_key}>
                  <Settings2 className="h-4 w-4" /> Save Configuration
                </Button>
              </div>
            </div>
          </div>

          {/* Test SMS */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Send Test SMS</h3>
            <div className="flex gap-3">
              <Input placeholder="+447911123456" value={smsTestNumber}
                onChange={(e) => setSmsTestNumber(e.target.value)} className="flex-1" />
              <Button variant="outline" onClick={testSms} loading={saving} disabled={!smsTestNumber}>
                <Send className="h-4 w-4" /> Send Test
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Invoice Reminders ──────────────────────────────────────────── */}
      {tab === 'reminders' && (
        <div className="max-w-lg space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Automated Invoice Reminders</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={reminderSettings.enabled} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  onChange={(e) => setReminderSettings((s) => ({ ...s, enabled: e.target.checked }))} />
                <span className="text-sm font-medium text-gray-700">Enable automated invoice payment reminders</span>
              </label>

              {reminderSettings.enabled && (
                <>
                  <Input label="Days Before Due Date" type="number" min={0} max={30}
                    value={reminderSettings.days_before_due}
                    onChange={(e) => setReminderSettings((s) => ({ ...s, days_before_due: parseInt(e.target.value) || 0 }))}
                    hint="Send a reminder this many days before the invoice due date" />

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Days After Overdue</label>
                    <p className="mb-2 text-xs text-gray-500">Send reminders this many days after the due date. Comma-separated.</p>
                    <Input
                      value={reminderSettings.days_after_overdue.join(', ')}
                      onChange={(e) => {
                        const days = e.target.value.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n) && n > 0)
                        setReminderSettings((s) => ({ ...s, days_after_overdue: days }))
                      }}
                      placeholder="1, 7, 14" />
                  </div>

                  <Select label="Reminder Channel" options={CHANNEL_OPTIONS} value={reminderSettings.channel}
                    onValueChange={(v) => setReminderSettings((s) => ({ ...s, channel: v as any }))} />
                </>
              )}

              <Button onClick={saveReminders} loading={saving}>Save Reminder Settings</Button>
            </div>
          </div>

          <div className="rounded-md bg-blue-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 text-blue-600" />
              <p className="text-sm text-blue-700">
                Invoice reminders use the <strong>Invoice Overdue</strong> notification template.
                Make sure to configure the template in the Templates tab.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Delivery Log ───────────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="space-y-3">
          {logEntries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
              <Bell className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-gray-500">No notifications sent yet.</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {logEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{TRIGGER_LABELS[entry.trigger_event] ?? entry.trigger_event}</td>
                        <td className="px-4 py-3">
                          <Badge variant={entry.channel === 'email' ? 'default' : 'success'}>{entry.channel.toUpperCase()}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{entry.recipient}</td>
                        <td className="px-4 py-3">
                          {entry.status === 'sent' && <Badge variant="success">Sent</Badge>}
                          {entry.status === 'failed' && (
                            <span title={entry.error_message ?? ''}><Badge variant="destructive">Failed</Badge></span>
                          )}
                          {entry.status === 'queued' && <Badge variant="warning">Queued</Badge>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{new Date(entry.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {logTotal > 20 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Showing {(logPage - 1) * 20 + 1}–{Math.min(logPage * 20, logTotal)} of {logTotal}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={logPage <= 1} onClick={() => fetchLog(logPage - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={logPage * 20 >= logTotal} onClick={() => fetchLog(logPage + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Edit Template Modal ─────────────────────────────────────────────── */}
      <Modal open={editModal.open} onClose={() => setEditModal({ open: false, template: null })}
        title={`Edit: ${TRIGGER_LABELS[editModal.template?.trigger_event ?? ''] ?? 'Template'}`}
        size="xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select label="Channel" options={CHANNEL_OPTIONS} value={editForm.channel}
              onValueChange={(v) => setEditForm((f) => ({ ...f, channel: v }))} />
            <label className="mt-5 flex items-center gap-2">
              <input type="checkbox" checked={editForm.is_active} className="h-4 w-4 rounded border-gray-300 text-blue-600"
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))} />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>

          {(editForm.channel === 'email' || editForm.channel === 'both') && (
            <>
              <Input label="Email Subject" value={editForm.subject}
                onChange={(e) => setEditForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Subject line with {{macros}}" />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email Body (HTML)</label>
                <textarea rows={8} value={editForm.email_body}
                  onChange={(e) => setEditForm((f) => ({ ...f, email_body: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="HTML email body with {{macros}}" />
              </div>
            </>
          )}

          {(editForm.channel === 'sms' || editForm.channel === 'both') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">SMS Body</label>
              <textarea rows={3} value={editForm.sms_body}
                onChange={(e) => setEditForm((f) => ({ ...f, sms_body: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="SMS text with {{macros}} (160 char segments)" />
              <p className="mt-1 text-xs text-gray-500">{editForm.sms_body.length} characters ({Math.ceil(editForm.sms_body.length / 160) || 1} SMS segment{editForm.sms_body.length > 160 ? 's' : ''})</p>
            </div>
          )}

          {/* Available macros */}
          {editModal.template && macroCatalog[editModal.template.trigger_event] && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Available Macros</label>
              <div className="flex flex-wrap gap-1.5">
                {macroCatalog[editModal.template.trigger_event].map((m) => (
                  <button key={m} type="button"
                    className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 transition-colors font-mono"
                    onClick={() => navigator.clipboard.writeText(`{{${m}}}`)}
                    title={`Click to copy {{${m}}}`}>
                    {`{{${m}}}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditModal({ open: false, template: null })}>Cancel</Button>
            <Button onClick={saveTemplate} loading={saving}>Save Template</Button>
          </div>
        </div>
      </Modal>

      {/* ── Preview Modal ───────────────────────────────────────────────────── */}
      <Modal open={previewModal.open} onClose={() => setPreviewModal({ open: false, subject: '', emailBody: '', smsBody: '' })}
        title="Template Preview" size="xl">
        <div className="space-y-4">
          {previewModal.subject && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Subject</label>
              <p className="mt-1 text-sm font-medium text-gray-900">{previewModal.subject}</p>
            </div>
          )}
          {previewModal.emailBody && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Email Preview</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-4"
                dangerouslySetInnerHTML={{ __html: previewModal.emailBody }} />
            </div>
          )}
          {previewModal.smsBody && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">SMS Preview</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-green-50 p-3">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{previewModal.smsBody}</p>
                <p className="mt-1 text-xs text-gray-500">{previewModal.smsBody.length} chars</p>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Test Notification Modal ─────────────────────────────────────────── */}
      <Modal open={testModal.open} onClose={() => setTestModal({ open: false, triggerEvent: '' })}
        title={`Send Test: ${TRIGGER_LABELS[testModal.triggerEvent] ?? testModal.triggerEvent}`}>
        <div className="space-y-4">
          <Select label="Channel" options={[{ value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }]}
            value={testChannel} onValueChange={(v) => setTestChannel(v as 'email' | 'sms')} />
          <Input label={testChannel === 'email' ? 'Email Address' : 'Phone Number'}
            value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
            placeholder={testChannel === 'email' ? 'test@example.com' : '+447911123456'} required />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setTestModal({ open: false, triggerEvent: '' })}>Cancel</Button>
            <Button onClick={sendTestNotification} loading={saving} disabled={!testRecipient}>
              <Send className="h-4 w-4" /> Send Test
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
