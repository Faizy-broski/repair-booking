'use client'
import { useState, useEffect } from 'react'
import { Save, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared/page-header'
import { useAuthStore } from '@/store/auth.store'

interface LoyaltySettings {
  earn_rate: number; redeem_rate: number; min_redeem_points: number; is_enabled: boolean
}

export default function LoyaltySettingsPage() {
  const { activeBranch } = useAuthStore()
  const [settings, setSettings] = useState<LoyaltySettings>({
    earn_rate: 0.01, redeem_rate: 0.01, min_redeem_points: 100, is_enabled: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    if (!activeBranch) return
    fetch('/api/loyalty/settings')
      .then((r) => r.json())
      .then((j) => { if (j.data) setSettings(j.data) })
  }, [activeBranch])

  async function save() {
    setSaving(true)
    await fetch('/api/loyalty/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const exampleEarn   = (100 * settings.earn_rate * 100).toFixed(0)
  const exampleRedeem = (settings.min_redeem_points * settings.redeem_rate).toFixed(2)

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Loyalty Programme" description="Reward customers with points for purchases." />

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-5">
        <label className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Star className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold text-on-surface">Enable Loyalty Programme</span>
          </div>
          <input
            type="checkbox"
            checked={settings.is_enabled}
            onChange={(e) => setSettings((s) => ({ ...s, is_enabled: e.target.checked }))}
            className="h-4 w-4 rounded accent-primary"
          />
        </label>

        <div className={`space-y-4 transition-opacity ${settings.is_enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Earn Rate (points per £1)"
                type="number"
                step="0.001"
                min="0"
                value={settings.earn_rate}
                onChange={(e) => setSettings((s) => ({ ...s, earn_rate: Number(e.target.value) }))}
              />
              <p className="mt-1.5 text-xs text-on-surface-variant">A £100 sale earns {exampleEarn} points</p>
            </div>
            <div>
              <Input
                label="Redeem Rate (£ per point)"
                type="number"
                step="0.001"
                min="0"
                value={settings.redeem_rate}
                onChange={(e) => setSettings((s) => ({ ...s, redeem_rate: Number(e.target.value) }))}
              />
              <p className="mt-1.5 text-xs text-on-surface-variant">{settings.min_redeem_points} pts = £{exampleRedeem}</p>
            </div>
          </div>

          <Input
            label="Minimum Points to Redeem"
            type="number"
            min="0"
            value={settings.min_redeem_points}
            onChange={(e) => setSettings((s) => ({ ...s, min_redeem_points: Number(e.target.value) }))}
          />

          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-xs text-on-surface-variant">
            <p className="font-medium text-on-surface mb-1">How it works:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Customer spends £100 → earns {exampleEarn} points</li>
              <li>Customer redeems {settings.min_redeem_points} points → £{exampleRedeem} credit</li>
              <li>Points are awarded automatically on completed sales</li>
            </ul>
          </div>
        </div>

        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" />
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
