'use client'
import { useState, useEffect } from 'react'
import { Save, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { getBrandStyle } from '@/lib/brand-theme'

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/

const brandingSchema = z.object({
  brand_color: z.string().regex(HEX_PATTERN, 'Enter a valid hex color (e.g. #008080)'),
})
type BrandingFormData = z.infer<typeof brandingSchema>

const PRESET_COLORS = [
  '#008080', // teal (default)
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#dc2626', // red
  '#ea580c', // orange
  '#16a34a', // green
  '#0891b2', // cyan
]

export default function BrandingSettingsPage() {
  const { setBrandColor } = useAuthStore()
  const [saved, setSaved] = useState(false)
  const form = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    defaultValues: { brand_color: '#008080' },
  })

  const color = form.watch('brand_color')

  useEffect(() => {
    async function fetchBrandColor() {
      const res = await fetch('/api/settings/business')
      const json = await res.json()
      if (json.data?.brand_color) {
        form.reset({ brand_color: json.data.brand_color })
      }
    }
    fetchBrandColor()
  }, [form])

  async function onSave(data: BrandingFormData) {
    await fetch('/api/settings/business', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setBrandColor(data.brand_color)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isValidHex = HEX_PATTERN.test(color ?? '')

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-1 font-semibold text-gray-900">Brand Color</h3>
        <p className="mb-4 text-sm text-gray-500">
          Choose the color used across your dashboard sidebar, buttons, and customer-facing
          pricing widget.
        </p>

        <form onSubmit={form.handleSubmit(onSave)} className="space-y-5 max-w-lg">
          <Controller
            name="brand_color"
            control={form.control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => field.onChange(preset)}
                    className={cn(
                      'h-9 w-9 rounded-full border-2 transition-transform',
                      field.value?.toLowerCase() === preset.toLowerCase()
                        ? 'border-gray-900 scale-110'
                        : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: preset }}
                    aria-label={preset}
                  >
                    {field.value?.toLowerCase() === preset.toLowerCase() && (
                      <Check className="mx-auto h-4 w-4 text-white" />
                    )}
                  </button>
                ))}
              </div>
            )}
          />

          <Controller
            name="brand_color"
            control={form.control}
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={isValidHex ? field.value : '#008080'}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded-lg border border-gray-300 p-0.5"
                />
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder="#008080"
                  className="h-9 w-32 rounded-lg border border-gray-300 px-3 text-sm font-mono focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                />
                {form.formState.errors.brand_color && (
                  <p className="text-xs text-red-600">{form.formState.errors.brand_color.message}</p>
                )}
              </div>
            )}
          />

          {/* Live preview */}
          <div className="rounded-xl border border-gray-200 overflow-hidden" style={isValidHex ? getBrandStyle(color) : undefined}>
            <p className="px-4 pt-3 pb-2 text-xs font-medium uppercase tracking-wider text-gray-400 bg-white">Preview</p>
            <div className="flex">
              {/* Sidebar strip */}
              <div className="w-32 bg-sidebar-bg px-3 py-4 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2 rounded-lg bg-primary/20 px-2 py-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="text-xs font-semibold text-primary">Dashboard</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  <span className="text-xs text-white/60">Customers</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  <span className="text-xs text-white/60">Repairs</span>
                </div>
              </div>
              {/* Main area */}
              <div className="flex-1 bg-gray-50 p-4 flex items-start gap-3">
                <button
                  type="button"
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary"
                >
                  Primary button
                </button>
                <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-xs font-medium text-primary">Badge</span>
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" loading={form.formState.isSubmitting} disabled={!isValidHex}>
            <Save className="h-4 w-4" />
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </form>
      </div>

    </div>
  )
}
