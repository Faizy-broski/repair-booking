'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, Info } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
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

  const { data: remindersData } = useQuery<InvoiceReminderSettings | null>({
    queryKey: ['settings-invoice-reminders', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch('/api/settings/invoice-reminders')
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (remindersData) setReminderSettings(remindersData)
  }, [remindersData])

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
      <PageHeader title="Invoice Reminders" description="Automatically notify customers about upcoming and overdue invoices" />

      <div className="max-w-4xl space-y-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-on-surface">Automated Invoice Reminders</h3>
              <p className="mt-0.5 text-sm text-on-surface-variant">Send payment reminders before the due date and after an invoice goes overdue.</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={reminderSettings.enabled}
                className="h-4 w-4 rounded accent-primary"
                onChange={(e) => setReminderSettings((s) => ({ ...s, enabled: e.target.checked }))}
              />
              <span className="text-sm font-medium text-on-surface-variant">Enable automated invoice payment reminders</span>
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
                  <label className="mb-1 block text-sm font-medium text-on-surface-variant">Days After Overdue</label>
                  <p className="mb-2 text-xs text-on-surface-variant">Send reminders this many days after the due date. Comma-separated.</p>
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

        <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">
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
