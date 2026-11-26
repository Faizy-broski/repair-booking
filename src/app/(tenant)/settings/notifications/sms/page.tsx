'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings2, Send, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth.store'
import { PageHeader } from '@/components/shared/page-header'

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

  const queryClient = useQueryClient()

  const [smsForm, setSmsForm] = useState({ gateway: '', api_key: '', api_secret: '', sender_id: '' })
  const [smsTestNumber, setSmsTestNumber] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: smsConfig = null } = useQuery<SmsConfig | null>({
    queryKey: ['settings-sms', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch('/api/settings/sms')
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

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
    queryClient.invalidateQueries({ queryKey: ['settings-sms', activeBranch?.id] })
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
    if (json.data?.success) { toast.success('Test SMS sent successfully!') } else { toast.error(`Failed: ${json.error?.message ?? 'Unknown error'}`) }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="SMS Gateway" description="Connect an SMS provider to send text notifications to customers" />

      <div className="max-w-4xl space-y-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Settings2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-on-surface">SMS Gateway Configuration</h3>
              <p className="mt-0.5 text-sm text-on-surface-variant">Enter your provider credentials to start sending texts.</p>
            </div>
          </div>
          {smsConfig?.is_configured && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
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
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Send className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-on-surface">Send Test SMS</h3>
              <p className="mt-0.5 text-sm text-on-surface-variant">Check the connection by sending a test message.</p>
            </div>
          </div>
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
