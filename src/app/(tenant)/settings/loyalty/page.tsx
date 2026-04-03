'use client'
import { useState, useEffect } from 'react'
import { Save, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Loyalty Programme</h1>
        <p className="text-sm text-gray-500 mt-0.5">Reward customers with points for purchases.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <label className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="font-medium text-gray-800">Enable Loyalty Programme</span>
          </div>
          <input
            type="checkbox"
            checked={settings.is_enabled}
            onChange={(e) => setSettings((s) => ({ ...s, is_enabled: e.target.checked }))}
            className="h-4 w-4 rounded"
          />
        </label>

        <div className={`space-y-4 transition-opacity ${settings.is_enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label="Earn Rate (points per £1)"
                type="number"
                step="0.001"
                min="0"
                value={settings.earn_rate}
                onChange={(e) => setSettings((s) => ({ ...s, earn_rate: Number(e.target.value) }))}
              />
              <p className="mt-1 text-xs text-gray-400">A £100 sale earns {exampleEarn} points</p>
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
              <p className="mt-1 text-xs text-gray-400">{settings.min_redeem_points} pts = £{exampleRedeem}</p>
            </div>
          </div>

          <Input
            label="Minimum Points to Redeem"
            type="number"
            min="0"
            value={settings.min_redeem_points}
            onChange={(e) => setSettings((s) => ({ ...s, min_redeem_points: Number(e.target.value) }))}
          />

          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            <p className="font-medium mb-1">How it works:</p>
            <ul className="space-y-0.5 list-disc list-inside text-blue-600">
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
