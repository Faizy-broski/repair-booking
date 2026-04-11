'use client'
import { useState, useEffect, useCallback } from 'react'
import { Clock, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth.store'

interface InvoiceReminderSettings {
  enabled: boolean
  days_before_due: number
  days_after_overdue: number[]
  channel: 'email' | 'sms' | 'both'
}

const CHANNEL_OPTIONS: SelectOption[] = [
  { value: 'email', label: 'Email Only' },
  { value: 'sms',   label: 'SMS Only' },
  { value: 'both',  label: 'Email + SMS' },
]

export default function InvoiceRemindersPage() {
  const { activeBranch } = useAuthStore()

  const [reminderSettings, setReminderSettings] = useState<InvoiceReminderSettings>({
    enabled: false,
    days_before_due: 3,
    days_after_overdue: [1, 7, 14],
    channel: 'email',
  })
  const [saving, setSaving] = useState(false)

  const fetchReminders = useCallback(async () => {
    const res = await fetch('/api/settings/invoice-reminders')
    const json = await res.json()
    if (json.data) setReminderSettings(json.data)
  }, [])

  useEffect(() => {
    if (!activeBranch) return
    fetchReminders()
  }, [activeBranch, fetchReminders])

  async function saveReminders() {
    setSaving(true)
    await fetch('/api/settings/invoice-reminders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reminderSettings),
    })
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
          <Clock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Reminders</h1>
          <p className="text-sm text-gray-500">Automatically notify customers about upcoming and overdue invoices</p>
        </div>
      </div>

      <div className="max-w-lg space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Automated Invoice Reminders</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={reminderSettings.enabled}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                onChange={(e) => setReminderSettings((s) => ({ ...s, enabled: e.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Enable automated invoice payment reminders</span>
            </label>

            {reminderSettings.enabled && (
              <>
                <Input
                  label="Days Before Due Date"
                  type="number"
                  min={0}
                  max={30}
                  value={reminderSettings.days_before_due}
                  onChange={(e) => setReminderSettings((s) => ({ ...s, days_before_due: parseInt(e.target.value) || 0 }))}
                  hint="Send a reminder this many days before the invoice due date"
                />

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Days After Overdue</label>
                  <p className="mb-2 text-xs text-gray-500">Send reminders this many days after the due date. Comma-separated.</p>
                  <Input
                    value={reminderSettings.days_after_overdue.join(', ')}
                    onChange={(e) => {
                      const days = e.target.value
                        .split(',')
                        .map((s) => parseInt(s.trim()))
                        .filter((n) => !isNaN(n) && n > 0)
                      setReminderSettings((s) => ({ ...s, days_after_overdue: days }))
                    }}
                    placeholder="1, 7, 14"
                  />
                </div>

                <Select
                  label="Reminder Channel"
                  options={CHANNEL_OPTIONS}
                  value={reminderSettings.channel}
                  onValueChange={(v) => setReminderSettings((s) => ({ ...s, channel: v as InvoiceReminderSettings['channel'] }))}
                />
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
              Make sure to configure the template in the{' '}
              <a href="/settings/notifications" className="underline font-medium">Templates</a> section.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
