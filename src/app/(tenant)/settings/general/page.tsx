'use client'
import { useState, useEffect, useMemo } from 'react'
import { Save, Store, ChevronRight, Star, ShieldCheck, Eye, EyeOff, Globe, MapPin, Link2, User, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Toggle } from '@/components/ui/toggle'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { useForm, Controller } from 'react-hook-form'
import { Select } from '@/components/ui/select'
import { CURRENCIES } from '@/lib/currencies'
import { COUNTRIES } from '@/lib/countries'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'
import { ImageUpload } from '@/components/ui/image-upload'
import { toast } from 'sonner'
import { parseGoogleMapsLink } from '@/lib/maps-link'
import { cn } from '@/lib/utils'

const businessSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  whatsapp: z.string().optional(),
  mapsUrl: z.string().optional(),
  currency: z.string().default('GBP'),
  timezone: z.string().default('Europe/London'),
  logo_url: z.string().optional().nullable(),
})
type BusinessFormData = z.infer<typeof businessSchema>

function InfoRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-on-surface-variant mb-0.5">{label}</p>
      <p className={cn('text-sm font-semibold text-on-surface', capitalize && 'capitalize')}>{value}</p>
    </div>
  )
}

export default function GeneralSettingsPage() {
  const { setCurrency, verticalTemplateSlug, profile, isOwner, activeBranch } = useAuthStore()
  const isRetailTemplate = verticalTemplateSlug === 'retail-store'
  const isTyreShop = verticalTemplateSlug === 'mobile-tyre-fitting'
  const canEdit = isOwner()

  const { configs, isModuleEnabled, invalidate: invalidateConfigs, fetchConfigs } = useModuleConfigStore()
  const [savingPos, setSavingPos] = useState(false)

  async function handlePosToggle(enabled: boolean) {
    setSavingPos(true)
    try {
      const res = await fetch('/api/settings/modules/pos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: enabled }),
      })
      if (!res.ok) throw new Error('Failed')
      invalidateConfigs()
      if (activeBranch) await fetchConfigs(activeBranch.id)
      toast.success(enabled ? 'POS switched on' : 'POS switched off')
    } catch {
      toast.error('Could not update POS. Please try again.')
    } finally {
      setSavingPos(false)
    }
  }

  const [savedBusiness, setSavedBusiness] = useState(false)
  const [subdomain, setSubdomain] = useState('')
  const businessForm = useForm<BusinessFormData>({ resolver: zodResolver(businessSchema) })
  const mapsUrlValue = businessForm.watch('mapsUrl')
  const mapsEmbedSrc = useMemo(() => parseGoogleMapsLink(mapsUrlValue ?? ''), [mapsUrlValue]).embedSrc

  // ── Delete PIN state ─────────────────────────────────────────────────────
  const [hasPinSet, setHasPinSet] = useState(false)
  const [pinModalMode, setPinModalMode] = useState<'set' | 'change' | null>(null)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showNewPin, setShowNewPin] = useState(false)
  const [showConfirmPin, setShowConfirmPin] = useState(false)
  const [pinSaving, setPinSaving] = useState(false)
  const [pinError, setPinError] = useState('')

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
          city: json.data.city ?? '',
          address: json.data.address ?? '',
          website: json.data.website ?? '',
          whatsapp: json.data.whatsapp ?? '',
          mapsUrl: json.data.maps_url ?? '',
          currency: json.data.currency ?? 'GBP',
          timezone: json.data.timezone ?? 'Europe/London',
          logo_url: json.data.logo_url ?? '',
        })
        setSubdomain(json.data.subdomain ?? '')
        setHasPinSet(!!json.data.has_delete_pin)
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

  async function savePin() {
    setPinError('')
    if (!/^\d{4,6}$/.test(newPin)) { setPinError('PIN must be 4–6 digits'); return }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return }
    setPinSaving(true)
    const res = await fetch('/api/settings/business', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete_pin: newPin }),
    })
    setPinSaving(false)
    if (res.ok) {
      setHasPinSet(true)
      setPinModalMode(null)
      setNewPin(''); setConfirmPin('')
      toast.success('Delete protection PIN saved')
    } else {
      const j = await res.json().catch(() => ({}))
      setPinError(j?.error?.message ?? 'Failed to save PIN')
    }
  }

  async function clearPin() {
    const res = await fetch('/api/settings/business', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete_pin: null }),
    })
    if (res.ok) {
      setHasPinSet(false)
      toast.success('Delete protection PIN removed')
    }
  }

  function closePinModal() {
    setPinModalMode(null)
    setNewPin(''); setConfirmPin(''); setPinError('')
  }

  return (
    <div className="space-y-4">
      {/* POS on/off — tyre template only. First on the page so it's seen without scrolling. */}
      {isTyreShop && canEdit && configs !== null && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShoppingCart className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-on-surface">Point of Sale</p>
              <p className="mt-0.5 text-sm text-on-surface-variant">
                Show POS, Sales and Customer Credit in the menu. Your existing sales are kept when this is off.
              </p>
            </div>
          </div>
          <Toggle
            checked={isModuleEnabled('pos')}
            onChange={handlePosToggle}
            disabled={savingPos}
            aria-label="Switch Point of Sale on or off"
          />
        </div>
      )}

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="mb-5 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Store className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-on-surface">Business Information</h3>
              <p className="mt-0.5 text-sm text-on-surface-variant">Your business name, contact details and location.</p>
            </div>
          </div>
        <form onSubmit={businessForm.handleSubmit(onSaveBusiness)} className="space-y-4 max-w-4xl">
          <Input label="Business Name" required disabled={!canEdit} {...businessForm.register('name')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface-variant">Subdomain</label>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3.5 text-sm text-on-surface-variant">
              <span>{subdomain || '—'}</span>
              <span className="text-on-surface-variant">.repairbooking.co.uk</span>
            </div>
          </div>
          {canEdit ? (
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
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Business Logo</label>
              {businessForm.watch('logo_url') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={businessForm.watch('logo_url') ?? ''} alt="Business logo" className="h-16 w-16 rounded-xl object-cover border border-outline-variant" />
              ) : (
                <p className="text-sm text-on-surface-variant">No logo set</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" disabled={!canEdit} {...businessForm.register('email')} />
            <Input label="Phone" disabled={!canEdit} {...businessForm.register('phone')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Website</label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="https://yourwebsite.com"
                  disabled={!canEdit}
                  className="w-full h-10 w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 pl-9 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant"
                  {...businessForm.register('website')}
                />
              </div>
            </div>
            <Input label="WhatsApp number" placeholder="+44 7700 900000" disabled={!canEdit} {...businessForm.register('whatsapp')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Country</label>
              <select
                disabled={!canEdit}
                className="h-10 w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant"
                {...businessForm.register('country')}
              >
                <option value="">Select country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
                <option value="OTHER">Other</option>
              </select>
            </div>
            <Input label="City" placeholder="London" disabled={!canEdit} {...businessForm.register('city')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface-variant">Full Address</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="123 High Street, London, E1 6RF"
                disabled={!canEdit}
                className="w-full h-10 w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 pl-9 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant"
                {...businessForm.register('address')}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface-variant">
              Google Maps Link <span className="font-normal text-on-surface-variant">(optional)</span>
            </label>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="https://maps.google.com/... or https://maps.app.goo.gl/..."
                disabled={!canEdit}
                className="w-full h-10 w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 pl-9 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant"
                {...businessForm.register('mapsUrl')}
              />
            </div>
            {mapsUrlValue && (
              mapsEmbedSrc ? (
                <iframe
                  src={mapsEmbedSrc}
                  loading="lazy"
                  className="mt-2 h-48 w-full rounded-lg border border-outline-variant"
                />
              ) : (
                <p className="mt-1 text-xs text-on-surface-variant">
                  Can&apos;t preview shortened links — it&apos;ll still be saved and linked on your profile.{' '}
                  <a href={mapsUrlValue} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Open link
                  </a>
                </p>
              )
            )}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                />
              )}
            />
          </div>
          {canEdit && (
            <Button type="submit" loading={businessForm.formState.isSubmitting}>
              <Save className="h-4 w-4" />
              {savedBusiness ? 'Saved!' : 'Save Changes'}
            </Button>
          )}
        </form>
      </div>

      {/* ── Business Owner Details (read-only, from your personal profile) ── */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="mb-5 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-on-surface">Business Owner Details</h3>
              <p className="mt-0.5 text-sm text-on-surface-variant">Read-only, taken from your personal profile.</p>
            </div>
          </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl">
          <InfoRow label="Full name" value={profile?.full_name ?? '—'} />
          <InfoRow label="Email" value={profile?.email ?? '—'} />
          <InfoRow label="Phone" value={profile?.phone ?? '—'} />
          <InfoRow label="Role" value={profile?.role?.replace(/_/g, ' ') ?? '—'} capitalize />
        </div>
        <Link href="/account" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Manage your account <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* ── Delete Protection PIN (retail template only) ── */}
      {isRetailTemplate && (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-on-surface">Delete Protection PIN</h3>
              <p className="mt-0.5 text-sm text-on-surface-variant max-w-md">
            When set, this PIN must be entered by any manager before a sale can be deleted. Protects against accidental or unauthorized deletions.
              </p>
            </div>
          </div>
          {hasPinSet ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success">PIN active</Badge>
              <Button size="sm" variant="outline" onClick={() => { setPinModalMode('change'); setPinError('') }}>
                Change PIN
              </Button>
              <Button size="sm" variant="destructive" onClick={clearPin}>
                Remove PIN
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => { setPinModalMode('set'); setPinError('') }}>
              Set Delete PIN
            </Button>
          )}

          {/* ── PIN set/change modal ── */}
          {pinModalMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl bg-surface-container-lowest shadow-2xl">
                <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-red-500" />
                    <span className="font-semibold text-on-surface">
                      {pinModalMode === 'set' ? 'Set Delete PIN' : 'Change Delete PIN'}
                    </span>
                  </div>
                  <button onClick={closePinModal} className="text-on-surface-variant hover:text-on-surface">✕</button>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-sm text-on-surface-variant">
                    Choose a 4–6 digit PIN. You will need this PIN each time a sale is deleted.
                  </p>
                  <div className="space-y-3">
                    <div className="relative">
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">New PIN</label>
                      <input
                        type={showNewPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="4–6 digits"
                        className="h-10 w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 pr-10 text-sm tracking-widest focus:border-red-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPin(v => !v)}
                        className="absolute right-3 top-[34px] text-on-surface-variant hover:text-on-surface"
                      >
                        {showNewPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Confirm PIN</label>
                      <input
                        type={showConfirmPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        value={confirmPin}
                        onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Re-enter PIN"
                        className="h-10 w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-3.5 pr-10 text-sm tracking-widest focus:border-red-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPin(v => !v)}
                        className="absolute right-3 top-[34px] text-on-surface-variant hover:text-on-surface"
                      >
                        {showConfirmPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {pinError && <p className="text-xs text-red-600">{pinError}</p>}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={closePinModal}>Cancel</Button>
                    <Button
                      className="flex-1 bg-red-600 hover:bg-red-700"
                      loading={pinSaving}
                      onClick={savePin}
                      disabled={newPin.length < 4}
                    >
                      Save PIN
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest divide-y divide-outline-variant">
        <div className="px-5 py-3.5">
          <h3 className="text-sm font-semibold text-on-surface">Configuration</h3>
        </div>
        <Link
          href="/settings/loyalty"
          className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-container-low transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Star className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-on-surface">Loyalty Programme</p>
              <p className="mt-0.5 text-sm text-on-surface-variant">Configure points earn &amp; redeem rates</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-on-surface-variant group-hover:text-on-surface" />
        </Link>
      </div>
    </div>
  )
}
