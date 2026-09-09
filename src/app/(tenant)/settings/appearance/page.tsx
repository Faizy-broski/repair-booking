'use client'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'light', label: 'Light', description: 'Bright surfaces, best in well-lit rooms.', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Dimmed surfaces, easier on the eyes at night.', icon: Moon },
  { value: 'system', label: 'System', description: 'Matches your device\'s appearance setting.', icon: Monitor },
] as const

export default function AppearanceSettingsPage() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  // Avoid rendering theme-dependent state before the client has mounted, since
  // the server always renders as if no preference is set yet.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const previewIsDark = resolvedTheme === 'dark'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-outline-variant bg-surface p-6">
        <h3 className="mb-1 font-semibold text-on-surface">Appearance</h3>
        <p className="mb-4 text-sm text-on-surface-variant">
          Choose how your dashboard looks. This applies to this browser only.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 max-w-2xl">
          {OPTIONS.map(({ value, label, description, icon: Icon }) => {
            const isSelected = mounted && theme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  'relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all duration-150',
                  isSelected
                    ? 'border-primary bg-primary-container/20 shadow-md shadow-primary/10'
                    : 'border-outline-variant bg-surface-container-lowest hover:border-primary/40 hover:shadow-sm'
                )}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3">
                    <Check className="h-4 w-4 text-primary" />
                  </span>
                )}
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-container">
                  <Icon className="h-4.5 w-4.5 text-on-primary-container" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-on-surface">{label}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant leading-relaxed">{description}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Live preview of the resolved theme */}
        <div className="mt-5 max-w-2xl rounded-xl border border-outline-variant overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-xs font-medium uppercase tracking-wider text-on-surface-variant bg-surface-container-lowest">
            {mounted ? (previewIsDark ? 'Preview — Dark' : 'Preview — Light') : 'Preview'}
          </p>
          <div className="flex">
            <div className="w-28 bg-sidebar-bg px-3 py-4 flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-2 rounded-lg bg-primary/20 px-2 py-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="text-xs font-semibold text-primary">Dashboard</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
                <span className="text-xs text-white/60">Repairs</span>
              </div>
            </div>
            <div className="flex-1 bg-surface-container-low p-4 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary">
                  Primary button
                </button>
                <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-xs font-medium text-primary">Badge</span>
                </div>
              </div>
              <div className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
                <p className="text-xs font-semibold text-on-surface">Card title</p>
                <p className="text-[11px] text-on-surface-variant">Supporting text on a card surface.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
