'use client'
import { useState, useEffect } from 'react'
import { Save, Store, ChevronRight, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { useForm, Controller } from 'react-hook-form'
import { Select } from '@/components/ui/select'
import { CURRENCIES } from '@/lib/currencies'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'
import { ImageUpload } from '@/components/ui/image-upload'

const businessSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().default('GBP'),
  timezone: z.string().default('Europe/London'),
  logo_url: z.string().optional().nullable(),
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
          logo_url: json.data.logo_url ?? '',
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
          <Controller
            name="logo_url"
            control={businessForm.control}
            render={({ field }) => (
              <ImageUpload
                label="Business Logo"
                value={field.value ?? ''}
                onChange={(url) => field.onChange(url || null)}
              />
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" {...businessForm.register('email')} />
            <Input label="Phone" {...businessForm.register('phone')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="currency"
              control={businessForm.control}
              render={({ field }) => (
                <Select
                  label="Currency"
                  options={CURRENCIES}
                  value={field.value}
                  onValueChange={field.onChange}
                />
              )}
            />
            <Controller
              name="timezone"
              control={businessForm.control}
              render={({ field }) => (
                <Select
                  label="Timezone"
                  options={[
                    { value: 'Europe/London', label: 'Europe/London' },
                    { value: 'America/New_York', label: 'America/New_York' },
                    { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
                    { value: 'Asia/Dubai', label: 'Asia/Dubai' },
                    { value: 'Asia/Karachi', label: 'Asia/Karachi' },
                    { value: 'Africa/Lagos', label: 'Africa/Lagos' },
                    { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg' },
                  ]}
                  value={field.value}
                  onValueChange={field.onChange}
                />
              )}
            />
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
