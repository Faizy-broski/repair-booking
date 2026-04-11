'use client'
import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Settings2, Send, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth.store'

interface SmsConfig {
  sms_gateway: string | null
  sms_api_key: string | null
  sms_api_secret: string | null
  sms_sender_id: string | null
  is_configured: boolean
}

const GATEWAY_OPTIONS: SelectOption[] = [
  { value: 'twilio',    label: 'Twilio' },
  { value: 'textlocal', label: 'TextLocal' },
  { value: 'smsglobal', label: 'SMSGlobal' },
]

export default function SmsGatewayPage() {
  const { activeBranch } = useAuthStore()

  const [smsConfig, setSmsConfig] = useState<SmsConfig | null>(null)
  const [smsForm, setSmsForm] = useState({ gateway: '', api_key: '', api_secret: '', sender_id: '' })
  const [smsTestNumber, setSmsTestNumber] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchSmsConfig = useCallback(async () => {
    const res = await fetch('/api/settings/sms')
    const json = await res.json()
    setSmsConfig(json.data ?? null)
  }, [])

  useEffect(() => {
    if (!activeBranch) return
    fetchSmsConfig()
  }, [activeBranch, fetchSmsConfig])

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
          <MessageSquare className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMS Gateway</h1>
          <p className="text-sm text-gray-500">Connect an SMS provider to send text notifications to customers</p>
        </div>
      </div>

      <div className="max-w-lg space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">SMS Gateway Configuration</h3>
          {smsConfig?.is_configured && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> SMS gateway is configured ({smsConfig.sms_gateway})
            </div>
          )}
          <div className="space-y-4">
            <Select
              label="Gateway Provider"
              options={GATEWAY_OPTIONS}
              value={smsForm.gateway}
              onValueChange={(v) => setSmsForm((f) => ({ ...f, gateway: v }))}
              required
            />
            <Input
              label="API Key / Account SID"
              value={smsForm.api_key}
              onChange={(e) => setSmsForm((f) => ({ ...f, api_key: e.target.value }))}
              required
              placeholder={smsConfig?.sms_api_key ?? 'Enter API key'}
            />
            <Input
              label="API Secret / Auth Token"
              value={smsForm.api_secret}
              onChange={(e) => setSmsForm((f) => ({ ...f, api_secret: e.target.value }))}
              type="password"
              placeholder="Enter secret (leave blank to keep existing)"
            />
            <Input
              label="Sender ID / From Number"
              value={smsForm.sender_id}
              onChange={(e) => setSmsForm((f) => ({ ...f, sender_id: e.target.value }))}
              placeholder={smsConfig?.sms_sender_id ?? '+447911123456'}
              hint="E.164 format for Twilio, alphanumeric for others"
            />
            <Button onClick={saveSmsConfig} loading={saving} disabled={!smsForm.gateway || !smsForm.api_key}>
              <Settings2 className="h-4 w-4" /> Save Configuration
            </Button>
          </div>
        </div>

        {/* Test SMS */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Send Test SMS</h3>
          <div className="flex gap-3">
            <Input
              placeholder="+447911123456"
              value={smsTestNumber}
              onChange={(e) => setSmsTestNumber(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={testSms} loading={saving} disabled={!smsTestNumber}>
              <Send className="h-4 w-4" /> Send Test
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
