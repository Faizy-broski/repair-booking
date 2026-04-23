'use client'
import { useState, useEffect } from 'react'
import { Save, Store, ChevronRight, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'

const businessSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().default('GBP'),
  timezone: z.string().default('Europe/London'),
})
type BusinessFormData = z.infer<typeof businessSchema>

export default function GeneralSettingsPage() {
  const { setCurrency } = useAuthStore()
  const [savedBusiness, setSavedBusiness] = useState(false)
  const businessForm = useForm<BusinessFormData>({ resolver: zodResolver(businessSchema) })

  useEffect(() => {
    async function fetchBusinessInfo() {
      const res = await fetch('/api/settings/business')
      const json = await res.json()
      if (json.data) {
        businessForm.reset({
          name: json.data.name ?? '',
          email: json.data.email ?? '',
          phone: json.data.phone ?? '',
          country: json.data.country ?? '',
          currency: json.data.currency ?? 'GBP',
          timezone: json.data.timezone ?? 'Europe/London',
        })
      }
    }
    fetchBusinessInfo()
  }, [businessForm])

  async function onSaveBusiness(data: BusinessFormData) {
    await fetch('/api/settings/business', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (data.currency) setCurrency(data.currency)
    setSavedBusiness(true)
    setTimeout(() => setSavedBusiness(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Business Information</h3>
        <form onSubmit={businessForm.handleSubmit(onSaveBusiness)} className="space-y-4 max-w-lg">
          <Input label="Business Name" required {...businessForm.register('name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" {...businessForm.register('email')} />
            <Input label="Phone" {...businessForm.register('phone')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
              <select {...businessForm.register('currency')} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                <option value="GBP">GBP (£)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="AED">AED (د.إ)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Timezone</label>
              <select {...businessForm.register('timezone')} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                <option value="Europe/London">Europe/London</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
                <option value="Asia/Karachi">Asia/Karachi</option>
              </select>
            </div>
          </div>
          <Button type="submit" loading={businessForm.formState.isSubmitting}>
            <Save className="h-4 w-4" />
            {savedBusiness ? 'Saved!' : 'Save Changes'}
          </Button>
        </form>
      </div>

      {/* Quick links */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y">
        <div className="px-6 py-3">
          <h3 className="font-semibold text-gray-900 text-sm">Configuration</h3>
        </div>
        <Link
          href="/settings/loyalty"
          className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Star className="h-4 w-4 text-yellow-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Loyalty Programme</p>
              <p className="text-xs text-gray-400">Configure points earn &amp; redeem rates</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
        </Link>
      </div>
    </div>
  )
}
