'use client'
import { useState, useEffect, useCallback } from 'react'
import { Save, Plus, Trash2, Copy, Check, AlertCircle } from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface BusinessHour {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

interface BookingSettings {
  is_enabled: boolean
  slot_duration_minutes: number
  buffer_minutes: number
  max_per_slot: number
  max_advance_days: number
  min_advance_hours: number
  require_approval: boolean
  cancellation_hours: number
  widget_accent_color: string
  widget_welcome_text: string
}

interface BlockedDate {
  id: string
  blocked_date: string
  reason: string | null
}

const DEFAULT_SETTINGS: BookingSettings = {
  is_enabled: false,
  slot_duration_minutes: 30,
  buffer_minutes: 0,
  max_per_slot: 1,
  max_advance_days: 30,
  min_advance_hours: 1,
  require_approval: false,
  cancellation_hours: 24,
  widget_accent_color: '#2563eb',
  widget_welcome_text: 'Book an appointment with us',
}

export default function BookingSettingsPage() {
  const { activeBranch } = useAuthStore()
  const [activeTab, setActiveTab] = useState('hours')
  const [hours, setHours] = useState<BusinessHour[]>([])
  const [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS)
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [copied, setCopied] = useState(false)
  const [newBlockDate, setNewBlockDate] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')

  const branchId = activeBranch?.id

  // ── Fetch all data ──────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!branchId) return

    const [hoursRes, settingsRes, blockedRes] = await Promise.all([
      fetch(`/api/settings/business-hours?branch_id=${branchId}`),
      fetch(`/api/settings/booking?branch_id=${branchId}`),
      fetch(`/api/settings/blocked-dates?branch_id=${branchId}`),
    ])

    const [hoursJson, settingsJson, blockedJson] = await Promise.all([
      hoursRes.json(), settingsRes.json(), blockedRes.json(),
    ])

    if (hoursJson.data?.length) {
      setHours(hoursJson.data.map((h: BusinessHour) => ({
        day_of_week: h.day_of_week,
        open_time: h.open_time?.slice(0, 5) ?? '09:00',
        close_time: h.close_time?.slice(0, 5) ?? '17:00',
        is_closed: h.is_closed,
      })))
    } else {
      // Default hours
      setHours(DAY_NAMES.map((_, i) => ({
        day_of_week: i,
        open_time: i === 0 ? '10:00' : '09:00',
        close_time: i === 0 ? '16:00' : '17:30',
        is_closed: i === 0,
      })))
    }

    if (settingsJson.data) setSettings({ ...DEFAULT_SETTINGS, ...settingsJson.data })
    setBlockedDates(blockedJson.data ?? [])
  }, [branchId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Save handlers ───────────────────────────────────────────────────────

  async function saveHours() {
    setSaving(true)
    await fetch(`/api/settings/business-hours?branch_id=${branchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours }),
    })
    setSaving(false)
    setSaved('hours')
    setTimeout(() => setSaved(''), 2000)
  }

  async function saveSettings() {
    setSaving(true)
    const { ...payload } = settings
    await fetch(`/api/settings/booking?branch_id=${branchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    setSaved('settings')
    setTimeout(() => setSaved(''), 2000)
  }

  async function addBlockedDate() {
    if (!newBlockDate || !branchId) return
    const res = await fetch(`/api/settings/blocked-dates?branch_id=${branchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocked_date: newBlockDate, reason: newBlockReason || undefined }),
    })
    if (res.ok) {
      setNewBlockDate('')
      setNewBlockReason('')
      fetchData()
    }
  }

  async function removeBlockedDate(id: string) {
    await fetch(`/api/settings/blocked-dates/${id}`, { method: 'DELETE' })
    fetchData()
  }

  function updateHour(idx: number, field: keyof BusinessHour, value: string | boolean) {
    setHours((prev) => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h))
  }

  function copyEmbedCode() {
    const code = `<iframe src="${window.location.origin}/book/${branchId}" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;"></iframe>`
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Online Booking</h1>
        <p className="text-sm text-gray-500">
          Configure business hours, appointment slots, and the public booking widget
        </p>
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {['hours', 'settings', 'blocked', 'widget'].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 transition-colors data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
            >
              {tab === 'hours' ? 'Business Hours' : tab === 'settings' ? 'Booking Config' : tab === 'blocked' ? 'Blocked Dates' : 'Widget & Embed'}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ── Business Hours Tab ─────────────────────────────────────────── */}
        <Tabs.Content value="hours" className="mt-4">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Weekly Schedule</h3>
              <Button onClick={saveHours} loading={saving && saved !== 'hours'} size="sm">
                {saved === 'hours' ? <><Check className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save Hours</>}
              </Button>
            </div>

            <div className="space-y-3">
              {hours.map((h, idx) => (
                <div key={h.day_of_week} className="flex items-center gap-4 rounded-lg border border-gray-100 p-3">
                  <div className="w-28">
                    <p className="text-sm font-medium text-gray-700">{DAY_NAMES[h.day_of_week]}</p>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!h.is_closed}
                      onChange={(e) => updateHour(idx, 'is_closed', !e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Open
                  </label>

                  {!h.is_closed && (
                    <>
                      <input
                        type="time"
                        value={h.open_time}
                        onChange={(e) => updateHour(idx, 'open_time', e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <span className="text-gray-400">to</span>
                      <input
                        type="time"
                        value={h.close_time}
                        onChange={(e) => updateHour(idx, 'close_time', e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </>
                  )}
                  {h.is_closed && <Badge variant="default">Closed</Badge>}
                </div>
              ))}
            </div>
          </div>
        </Tabs.Content>

        {/* ── Booking Config Tab ─────────────────────────────────────────── */}
        <Tabs.Content value="settings" className="mt-4">
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Booking Configuration</h3>
              <Button onClick={saveSettings} loading={saving && saved !== 'settings'} size="sm">
                {saved === 'settings' ? <><Check className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save Settings</>}
              </Button>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.is_enabled}
                onChange={(e) => setSettings((s) => ({ ...s, is_enabled: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Enable Online Booking</p>
                <p className="text-xs text-gray-400">Allow customers to book appointments through the public widget</p>
              </div>
            </label>

            {settings.is_enabled && (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Slot Duration (minutes)"
                  type="number"
                  min={5} max={480}
                  value={settings.slot_duration_minutes}
                  onChange={(e) => setSettings((s) => ({ ...s, slot_duration_minutes: Number(e.target.value) }))}
                />
                <Input
                  label="Buffer Between Slots (minutes)"
                  type="number"
                  min={0} max={120}
                  value={settings.buffer_minutes}
                  onChange={(e) => setSettings((s) => ({ ...s, buffer_minutes: Number(e.target.value) }))}
                />
                <Input
                  label="Max Appointments Per Slot"
                  type="number"
                  min={1} max={100}
                  value={settings.max_per_slot}
                  onChange={(e) => setSettings((s) => ({ ...s, max_per_slot: Number(e.target.value) }))}
                />
                <Input
                  label="Max Advance Booking (days)"
                  type="number"
                  min={1} max={365}
                  value={settings.max_advance_days}
                  onChange={(e) => setSettings((s) => ({ ...s, max_advance_days: Number(e.target.value) }))}
                />
                <Input
                  label="Min Advance Notice (hours)"
                  type="number"
                  min={0} max={168}
                  value={settings.min_advance_hours}
                  onChange={(e) => setSettings((s) => ({ ...s, min_advance_hours: Number(e.target.value) }))}
                />
                <Input
                  label="Cancellation Window (hours)"
                  type="number"
                  min={0} max={168}
                  value={settings.cancellation_hours}
                  onChange={(e) => setSettings((s) => ({ ...s, cancellation_hours: Number(e.target.value) }))}
                />

                <label className="flex items-center gap-2 col-span-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.require_approval}
                    onChange={(e) => setSettings((s) => ({ ...s, require_approval: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Require Manual Approval</p>
                    <p className="text-xs text-gray-400">New bookings stay as &quot;Scheduled&quot; until you confirm them</p>
                  </div>
                </label>
              </div>
            )}
          </div>
        </Tabs.Content>

        {/* ── Blocked Dates Tab ──────────────────────────────────────────── */}
        <Tabs.Content value="blocked" className="mt-4">
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Blocked Dates (Holidays / Closures)</h3>

            <div className="flex items-end gap-3">
              <Input
                label="Date"
                type="date"
                value={newBlockDate}
                onChange={(e) => setNewBlockDate(e.target.value)}
              />
              <Input
                label="Reason (optional)"
                placeholder="e.g. Bank Holiday"
                value={newBlockReason}
                onChange={(e) => setNewBlockReason(e.target.value)}
              />
              <Button onClick={addBlockedDate} size="sm">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            {blockedDates.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <AlertCircle className="h-4 w-4" />
                No blocked dates configured
              </div>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {blockedDates.map((bd) => (
                  <div key={bd.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {new Date(bd.blocked_date + 'T00:00:00').toLocaleDateString('en-GB', {
                          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </p>
                      {bd.reason && <p className="text-xs text-gray-400">{bd.reason}</p>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeBlockedDate(bd.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tabs.Content>

        {/* ── Widget & Embed Tab ─────────────────────────────────────────── */}
        <Tabs.Content value="widget" className="mt-4">
          <div className="space-y-4">
            {/* Branding */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Widget Branding</h3>
                <Button onClick={saveSettings} loading={saving} size="sm">
                  {saved === 'settings' ? <><Check className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save</>}
                </Button>
              </div>

              <Input
                label="Welcome Text"
                placeholder="Book an appointment with us"
                value={settings.widget_welcome_text}
                onChange={(e) => setSettings((s) => ({ ...s, widget_welcome_text: e.target.value }))}
              />
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Accent Color</label>
                <input
                  type="color"
                  value={settings.widget_accent_color}
                  onChange={(e) => setSettings((s) => ({ ...s, widget_accent_color: e.target.value }))}
                  className="h-8 w-12 rounded border border-gray-300 cursor-pointer"
                />
                <span className="text-sm text-gray-500">{settings.widget_accent_color}</span>
              </div>
            </div>

            {/* Embed Code */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Embed Code</h3>
              <p className="text-xs text-gray-400">
                Copy this code and paste it into your website to embed the booking widget.
              </p>

              <div className="relative">
                <pre className="rounded-lg bg-gray-50 p-4 text-xs text-gray-700 overflow-x-auto border border-gray-200">
{`<iframe
  src="${typeof window !== 'undefined' ? window.location.origin : ''}/book/${branchId}"
  width="100%"
  height="700"
  frameborder="0"
  style="border:none;border-radius:12px;"
></iframe>`}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={copyEmbedCode}
                >
                  {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                </Button>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <AlertCircle className="h-3 w-3" />
                Direct link: {typeof window !== 'undefined' ? window.location.origin : ''}/book/{branchId}
              </div>
            </div>

            {/* Widget Status */}
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${settings.is_enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Widget is {settings.is_enabled ? 'Active' : 'Disabled'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {settings.is_enabled
                      ? 'Customers can book appointments through the public widget'
                      : 'Enable online booking in the Booking Config tab to activate the widget'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
