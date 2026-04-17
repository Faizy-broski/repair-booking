'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Bell, Mail, Send, Eye as EyeIcon, RefreshCw,
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

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  ticket_created:        'Ticket Created',
  ticket_status_changed: 'Ticket Status Changed',
  repair_ready:          'Repair Ready for Collection',
  invoice_created:       'Invoice Created',
  invoice_overdue:       'Invoice Overdue',
  part_arrived:          'Part Arrived',
  estimate_sent:         'Estimate Sent',
  estimate_approved:     'Estimate Approved',
  estimate_declined:     'Estimate Declined',
  appointment_reminder:  'Appointment Reminder',
}

const CHANNEL_OPTIONS: SelectOption[] = [
  { value: 'email', label: 'Email Only' },
  { value: 'sms',   label: 'SMS Only' },
  { value: 'both',  label: 'Email + SMS' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationTemplatesPage() {
  const { activeBranch } = useAuthStore()

  const [templates, setTemplates]       = useState<NotificationTemplate[]>([])
  const [macroCatalog, setMacroCatalog] = useState<Record<string, string[]>>({})
  const [loading, setLoading]           = useState(false)
  const [saving, setSaving]             = useState(false)

  // Template editing
  const [editModal, setEditModal] = useState<{ open: boolean; template: NotificationTemplate | null }>({ open: false, template: null })
  const [editForm, setEditForm]   = useState({ channel: 'email' as string, subject: '', email_body: '', sms_body: '', is_active: true })

  // Preview modal
  const [previewModal, setPreviewModal] = useState<{ open: boolean; subject: string; emailBody: string; smsBody: string }>({ open: false, subject: '', emailBody: '', smsBody: '' })

  // Test notification modal
  const [testModal, setTestModal]       = useState<{ open: boolean; triggerEvent: string }>({ open: false, triggerEvent: '' })
  const [testChannel, setTestChannel]   = useState<'email' | 'sms'>('email')
  const [testRecipient, setTestRecipient] = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    const res = await fetch('/api/settings/notifications')
    const json = await res.json()
    setTemplates(json.data?.templates ?? [])
    setMacroCatalog(json.data?.macro_catalog ?? {})
  }, [])

  useEffect(() => {
    if (!activeBranch) return
    fetchTemplates()
  }, [activeBranch, fetchTemplates])

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
            <Mail className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Notification Templates</h1>
            <p className="text-sm text-gray-500">Customize the messages sent to customers for each event</p>
          </div>
        </div>
        {templates.length === 0 && (
          <Button onClick={seedDefaults} loading={loading} className="self-start sm:self-auto">
            <RefreshCw className="h-4 w-4" /> Load Default Templates
          </Button>
        )}
      </div>

      {/* Template list */}
      <div className="space-y-3">
        {templates.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <Bell className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-gray-500">No notification templates configured yet.</p>
            <Button className="mt-3" onClick={seedDefaults} loading={loading}>Load Default Templates</Button>
          </div>
        )}
        {templates.map((t) => (
          <div key={t.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">{TRIGGER_LABELS[t.trigger_event] ?? t.trigger_event}</span>
                <Badge variant={t.is_active ? 'success' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                <Badge variant={t.channel === 'email' ? 'default' : t.channel === 'sms' ? 'success' : 'purple'}>
                  {t.channel === 'both' ? 'Email + SMS' : t.channel.toUpperCase()}
                </Badge>
              </div>
              {t.subject && <p className="mt-1 text-sm text-gray-500 truncate max-w-xl">{t.subject}</p>}
              {macroCatalog[t.trigger_event] && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {macroCatalog[t.trigger_event].map((m) => (
                    <code key={m} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{`{{${m}}}`}</code>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:ml-4 sm:shrink-0">
              <Button variant="ghost" size="sm" onClick={() => previewTemplate(t.trigger_event)} title="Preview">
                <EyeIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setTestModal({ open: true, triggerEvent: t.trigger_event }); setTestChannel('email') }}
                title="Send Test"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => openEditTemplate(t)}>Edit</Button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Edit Template Modal ──────────────────────────────────────────────── */}
      <Modal
        open={editModal.open}
        onClose={() => setEditModal({ open: false, template: null })}
        title={`Edit: ${TRIGGER_LABELS[editModal.template?.trigger_event ?? ''] ?? 'Template'}`}
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select
              label="Channel"
              options={CHANNEL_OPTIONS}
              value={editForm.channel}
              onValueChange={(v) => setEditForm((f) => ({ ...f, channel: v }))}
            />
            <label className="mt-5 flex items-center gap-2">
              <input
                type="checkbox"
                checked={editForm.is_active}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>

          {(editForm.channel === 'email' || editForm.channel === 'both') && (
            <>
              <Input
                label="Email Subject"
                value={editForm.subject}
                onChange={(e) => setEditForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Subject line with {{macros}}"
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email Body (HTML)</label>
                <textarea
                  rows={8}
                  value={editForm.email_body}
                  onChange={(e) => setEditForm((f) => ({ ...f, email_body: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="HTML email body with {{macros}}"
                />
              </div>
            </>
          )}

          {(editForm.channel === 'sms' || editForm.channel === 'both') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">SMS Body</label>
              <textarea
                rows={3}
                value={editForm.sms_body}
                onChange={(e) => setEditForm((f) => ({ ...f, sms_body: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="SMS text with {{macros}} (160 char segments)"
              />
              <p className="mt-1 text-xs text-gray-500">
                {editForm.sms_body.length} characters ({Math.ceil(editForm.sms_body.length / 160) || 1} SMS segment{editForm.sms_body.length > 160 ? 's' : ''})
              </p>
            </div>
          )}

          {editModal.template && macroCatalog[editModal.template.trigger_event] && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Available Macros</label>
              <div className="flex flex-wrap gap-1.5">
                {macroCatalog[editModal.template.trigger_event].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 transition-colors font-mono"
                    onClick={() => navigator.clipboard.writeText(`{{${m}}}`)}
                    title={`Click to copy {{${m}}}`}
                  >
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

      {/* ── Preview Modal ──────────────────────────────────────────────────────── */}
      <Modal
        open={previewModal.open}
        onClose={() => setPreviewModal({ open: false, subject: '', emailBody: '', smsBody: '' })}
        title="Template Preview"
        size="xl"
      >
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
              <div
                className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-4"
                dangerouslySetInnerHTML={{ __html: previewModal.emailBody }}
              />
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

      {/* ── Test Notification Modal ────────────────────────────────────────────── */}
      <Modal
        open={testModal.open}
        onClose={() => setTestModal({ open: false, triggerEvent: '' })}
        title={`Send Test: ${TRIGGER_LABELS[testModal.triggerEvent] ?? testModal.triggerEvent}`}
      >
        <div className="space-y-4">
          <Select
            label="Channel"
            options={[{ value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }]}
            value={testChannel}
            onValueChange={(v) => setTestChannel(v as 'email' | 'sms')}
          />
          <Input
            label={testChannel === 'email' ? 'Email Address' : 'Phone Number'}
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder={testChannel === 'email' ? 'test@example.com' : '+447911123456'}
            required
          />
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
