'use client'
import { useState, useEffect } from 'react'
import { Save, Check, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { getBrandStyle } from '@/lib/brand-theme'

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/

const brandingSchema = z.object({
  brand_color: z.string().regex(HEX_PATTERN, 'Enter a valid hex color (e.g. #009C9C)'),
})
type BrandingFormData = z.infer<typeof brandingSchema>

const PRESET_COLORS = [
  '#009C9C', // teal (default)
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
  const { resolvedTheme } = useTheme()
  const previewMode = resolvedTheme === 'dark' ? 'dark' : 'light'
  const [saved, setSaved] = useState(false)
  const form = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    defaultValues: { brand_color: '#009C9C' },
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
    <div>
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Palette className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-on-surface">Brand Color</h3>
            <p className="mt-0.5 text-sm text-on-surface-variant">Choose the color used across your dashboard sidebar, buttons, and customer-facing pricing widget.</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSave)} className="space-y-5 max-w-4xl">
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
                        ? 'border-on-surface scale-110'
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
                  value={isValidHex ? field.value : '#009C9C'}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-xl border border-outline-variant p-0.5"
                />
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder="#009C9C"
                  className="h-10 w-36 rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 text-sm font-mono focus:border-primary focus:outline-none"
                />
                {form.formState.errors.brand_color && (
                  <p className="text-xs text-error">{form.formState.errors.brand_color.message}</p>
                )}
              </div>
            )}
          />

          {/* Live preview — reflects your currently active theme (light/dark) */}
          <div className="rounded-xl border border-outline-variant overflow-hidden" style={isValidHex ? getBrandStyle(color, previewMode) : undefined}>
            <p className="px-4 pt-3 pb-2 text-xs font-medium text-on-surface-variant bg-surface-container-lowest">Preview</p>
            <div className="flex">
              {/* Sidebar strip */}
              <div className="w-32 sidebar-surface px-3 py-4 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2 rounded-lg bg-primary/20 px-2 py-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="text-xs font-semibold text-primary">Dashboard</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-surface-container-lowest/30" />
                  <span className="text-xs text-white/60">Customers</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-surface-container-lowest/30" />
                  <span className="text-xs text-white/60">Repairs</span>
                </div>
              </div>
              {/* Main area */}
              <div className="flex-1 bg-surface-container-low p-4 flex items-start gap-3">
                <button
                  type="button"
                  className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-on-primary"
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
