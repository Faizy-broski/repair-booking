'use client'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageUpload } from '@/components/ui/image-upload'
import { useAuthStore } from '@/store/auth.store'
import {
  Save, Building2, Palette, Type, AlignLeft, Share2,
  FileText, Settings2, Eye, RefreshCw, CheckCircle2,
  Globe, Facebook, Instagram, Twitter, Phone, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_INVOICE_SETTINGS,
  type InvoiceSettings,
  type SocialLinks,
} from '@/types/invoice-settings'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAPER_OPTIONS = [
  { value: 'A4',        label: 'A4',            desc: '210 × 297 mm' },
  { value: 'A5',        label: 'A5',            desc: '148 × 210 mm' },
  { value: 'Letter',    label: 'US Letter',     desc: '216 × 279 mm' },
  { value: 'Receipt80', label: 'Receipt 80mm',  desc: 'Thermal printer' },
  { value: 'Receipt58', label: 'Receipt 58mm',  desc: 'Mini printer' },
]

const FONT_OPTIONS = [
  { value: 'Helvetica',   label: 'Helvetica (sans-serif)' },
  { value: 'Times-Roman', label: 'Times Roman (serif)' },
  { value: 'Courier',     label: 'Courier (monospace)' },
]

const SOCIAL_FIELDS: { key: keyof SocialLinks; label: string; icon: React.ElementType; placeholder: string }[] = [
  { key: 'website',   label: 'Website',   icon: Globe,     placeholder: 'https://yoursite.com' },
  { key: 'facebook',  label: 'Facebook',  icon: Facebook,  placeholder: 'https://facebook.com/yourpage' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/yourhandle' },
  { key: 'twitter',   label: 'Twitter / X', icon: Twitter, placeholder: 'https://x.com/yourhandle' },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: Phone,     placeholder: '+44 7700 900000' },
  { key: 'tiktok',    label: 'TikTok',    icon: Layers,    placeholder: 'https://tiktok.com/@yourhandle' },
]

// ── Toggle row ────────────────────────────────────────────────────────────────

function Toggle({ label, desc, checked, onChange }: {
  label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative shrink-0 h-5 w-9 rounded-full border-2 transition-colors focus:outline-none',
          checked ? 'bg-teal-500 border-teal-500' : 'bg-gray-200 border-gray-200'
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )} />
      </button>
    </label>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode
}) {
  const Icon = icon
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
        <Icon className="h-4 w-4 text-teal-600 shrink-0" />
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-5 space-y-3">
        {children}
      </div>
    </div>
  )
}

// ── Live HTML preview ─────────────────────────────────────────────────────────

function InvoicePreview({ s, businessName, branchName }: {
  s: InvoiceSettings; businessName: string; branchName: string
}) {
  const isReceipt = s.paper_size === 'Receipt80' || s.paper_size === 'Receipt58'
  const socials = Object.entries(s.social_links ?? {}).filter(([, v]) => v)
  const footerLines = [s.footer_line_1, s.footer_line_2, s.footer_line_3].filter(Boolean)

  const previewItems = [
    { desc: 'iPhone Screen Replacement', qty: 1, price: 79.99 },
    { desc: 'Labour & Parts',            qty: 2, price: 15.00 },
  ]
  const subtotal = previewItems.reduce((a, i) => a + i.qty * i.price, 0)
  const tax = 22.00
  const total = subtotal + tax
  const balanceDue = 36.98

  const fontMap: Record<string, string> = {
    'Helvetica': 'ui-sans-serif, system-ui, sans-serif',
    'Times-Roman': 'Georgia, "Times New Roman", serif',
    'Courier': '"Courier New", Courier, monospace',
  }
  const fontStyle = fontMap[s.font_family] ?? fontMap['Helvetica']

  if (isReceipt) {
    const width = s.paper_size === 'Receipt58' ? 165 : 227
    return (
      <div style={{ fontFamily: fontStyle, width: `${width * 0.75}px`, backgroundColor: '#fff', margin: '0 auto', padding: '12px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 9 }}>
        {s.show_logo && s.logo_url && <img src={s.logo_url} alt="" style={{ width: 40, height: 40, objectFit: 'contain', display: 'block', margin: '0 auto 6px' }} />}
        {s.show_business_name && <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, margin: '0 0 1px' }}>{businessName}</p>}
        {s.show_branch_name && <p style={{ textAlign: 'center', color: '#6b7280', margin: '0 0 4px' }}>{branchName}</p>}
        <hr style={{ border: 'none', borderTop: '1px dashed #d1d5db', margin: '6px 0' }} />
        <p style={{ fontWeight: 700, textAlign: 'center', margin: '0 0 4px' }}>INV-2024-0042</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#6b7280' }}>Customer</span><span>James Walker</span>
        </div>
        <hr style={{ border: 'none', borderTop: '1px dashed #d1d5db', margin: '6px 0' }} />
        {previewItems.map((item, i) => (
          <div key={i} style={{ marginBottom: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.desc}</span>
              <span>£{(item.qty * item.price).toFixed(2)}</span>
            </div>
            <div style={{ color: '#9ca3af', fontSize: 7 }}>x{item.qty} @ £{item.price.toFixed(2)}</div>
          </div>
        ))}
        <hr style={{ border: 'none', borderTop: '1px dashed #d1d5db', margin: '6px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#6b7280' }}>Subtotal</span><span>£{subtotal.toFixed(2)}</span>
        </div>
        {s.show_tax_breakdown && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ color: '#6b7280' }}>Tax</span><span>£{tax.toFixed(2)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 12, margin: '4px 0' }}>
          <span>Total</span><span style={{ color: s.primary_color }}>£{total.toFixed(2)}</span>
        </div>
        <div style={{ backgroundColor: s.primary_color, color: '#fff', borderRadius: 3, padding: '4px 8px', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontWeight: 700 }}>Balance Due</span><span style={{ fontWeight: 700 }}>£{balanceDue.toFixed(2)}</span>
        </div>
        <hr style={{ border: 'none', borderTop: '1px dashed #d1d5db', margin: '6px 0' }} />
        {s.thank_you_message && <p style={{ textAlign: 'center', fontWeight: 700, color: s.primary_color, margin: '0 0 2px' }}>{s.thank_you_message}</p>}
        {footerLines.map((l, i) => <p key={i} style={{ textAlign: 'center', color: '#9ca3af', margin: '1px 0' }}>{l}</p>)}
        {socials.map(([k, v]) => <p key={k} style={{ textAlign: 'center', color: '#9ca3af', margin: '1px 0' }}>{k}: {v as string}</p>)}
        {s.policy_text && <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 6.5, marginTop: 6, borderTop: '1px solid #e5e7eb', paddingTop: 5 }}>{s.policy_text}</p>}
      </div>
    )
  }

  return (
    <div style={{ fontFamily: fontStyle, backgroundColor: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden', fontSize: 9, color: s.text_color }}>
      {/* Header */}
      <div style={{ backgroundColor: s.primary_color, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {s.show_logo && s.logo_url && <img src={s.logo_url} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, marginBottom: 6 }} />}
          {s.show_business_name && <p style={{ color: '#fff', fontWeight: 700, fontSize: 12, margin: '0 0 2px' }}>{businessName}</p>}
          {s.show_branch_name && <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1px' }}>{branchName}</p>}
          {s.show_address && <p style={{ color: 'rgba(255,255,255,0.65)', margin: '0 0 1px' }}>123 High Street, London</p>}
          {s.show_phone && <p style={{ color: 'rgba(255,255,255,0.65)', margin: '0 0 1px' }}>+44 20 7946 0000</p>}
          {s.show_email && <p style={{ color: 'rgba(255,255,255,0.65)', margin: 0 }}>info@business.co.uk</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 20, letterSpacing: 2, margin: '0 0 2px' }}>INVOICE</p>
          <p style={{ color: 'rgba(255,255,255,0.8)', margin: '0 0 6px' }}>INV-2024-0042</p>
          <span style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 7, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>UNPAID</span>
        </div>
      </div>

      {/* Bill to / details */}
      <div style={{ backgroundColor: s.secondary_color, display: 'flex', padding: '12px 24px', borderBottom: `1px solid ${s.primary_color}22` }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 7, fontWeight: 700, color: s.primary_color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Bill To</p>
          <p style={{ fontWeight: 700, fontSize: 10, margin: '0 0 2px' }}>James Walker</p>
          <p style={{ color: '#6b7280', margin: '0 0 1px' }}>james@example.com</p>
          <p style={{ color: '#6b7280', margin: 0 }}>+44 7700 900000</p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 7, fontWeight: 700, color: s.primary_color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Invoice Details</p>
          {[['Issue Date', '14 Apr 2026'], ['Due Date', '28 Apr 2026'], ['Status', 'Unpaid']].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', marginBottom: 2 }}>
              <span style={{ width: 60, color: '#6b7280' }}>{l}</span>
              <span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: '12px 24px 0' }}>
        <div style={{ backgroundColor: s.primary_color, display: 'flex', padding: '6px 8px', borderRadius: 4, marginBottom: 1 }}>
          <span style={{ color: '#fff', fontWeight: 700, width: 20 }}>#</span>
          <span style={{ color: '#fff', fontWeight: 700, flex: 1 }}>Description</span>
          <span style={{ color: '#fff', fontWeight: 700, width: 30, textAlign: 'center' }}>Qty</span>
          <span style={{ color: '#fff', fontWeight: 700, width: 55, textAlign: 'right' }}>Unit</span>
          <span style={{ color: '#fff', fontWeight: 700, width: 55, textAlign: 'right' }}>Amount</span>
        </div>
        {previewItems.map((item, i) => (
          <div key={i} style={{ display: 'flex', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', backgroundColor: i % 2 ? '#fafafa' : '#fff' }}>
            <span style={{ color: '#9ca3af', width: 20 }}>{i + 1}</span>
            <span style={{ flex: 1 }}>{item.desc}</span>
            <span style={{ width: 30, textAlign: 'center' }}>{item.qty}</span>
            <span style={{ width: 55, textAlign: 'right' }}>£{item.price.toFixed(2)}</span>
            <span style={{ width: 55, textAlign: 'right', fontWeight: 700 }}>£{(item.qty * item.price).toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ padding: '8px 24px 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: 180 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#6b7280' }}>Subtotal</span><span>£{subtotal.toFixed(2)}</span>
          </div>
          {s.show_tax_breakdown && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: '#6b7280' }}>Tax</span><span>£{tax.toFixed(2)}</span>
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '5px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>
            <span>Total</span><span style={{ color: s.primary_color }}>£{total.toFixed(2)}</span>
          </div>
          <div style={{ backgroundColor: s.primary_color, borderRadius: 5, padding: '6px 10px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#fff', fontWeight: 700 }}>Balance Due</span>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 11 }}>£{balanceDue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '10px 24px' }}>
        {s.thank_you_message && <p style={{ textAlign: 'center', fontWeight: 700, color: s.primary_color, margin: '0 0 4px' }}>{s.thank_you_message}</p>}
        {footerLines.map((l, i) => <p key={i} style={{ textAlign: 'center', color: '#6b7280', margin: '1px 0' }}>{l}</p>)}
        {socials.length > 0 && (
          <p style={{ textAlign: 'center', color: '#9ca3af', margin: '4px 0 1px' }}>
            {socials.map(([k, v], i) => `${i > 0 ? '  ·  ' : ''}${k}: ${v as string}`).join('')}
          </p>
        )}
        {s.policy_text && (
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 7, marginTop: 6, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>{s.policy_text}</p>
        )}
      </div>
    </div>
  )
}

// ── Main tab component ────────────────────────────────────────────────────────

export function InvoiceDesignTab() {
  const { activeBranch, branches, profile, isOwner } = useAuthStore()
  const [settings, setSettings] = useState<InvoiceSettings>({ ...DEFAULT_INVOICE_SETTINGS })
  const [scope, setScope] = useState<'business' | 'branch'>('business')
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // On mount, default to the active branch
  useEffect(() => {
    if (activeBranch) setSelectedBranchId(activeBranch.id)
    if (!isOwner()) setScope('branch')
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const branchParam = scope === 'branch' && selectedBranchId ? `?branch_id=${selectedBranchId}` : ''
    const res = await fetch(`/api/settings/invoice${branchParam}`)
    const json = await res.json()
    if (json.data) setSettings(json.data)
    else setSettings({ ...DEFAULT_INVOICE_SETTINGS })
    setLoading(false)
  }, [scope, selectedBranchId])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  function patch(partial: Partial<InvoiceSettings>) {
    setSettings((s) => ({ ...s, ...partial }))
  }

  function patchSocial(key: keyof SocialLinks, value: string) {
    setSettings((s) => ({
      ...s,
      social_links: { ...(s.social_links ?? {}), [key]: value },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const body: Record<string, unknown> = {
      ...settings,
      branch_id: scope === 'branch' ? selectedBranchId : null,
    }
    delete body.id
    delete body.business_id

    const res = await fetch('/api/settings/invoice', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const previewBusinessName = profile?.full_name ?? 'Your Business'
  const previewBranchName = branches.find((b) => b.id === selectedBranchId)?.name ?? activeBranch?.name ?? 'Main Branch'

  return (
    <div className="space-y-5">
      {/* ── Scope bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {isOwner() && (
              <button
                onClick={() => setScope('business')}
                className={cn('px-4 py-2 font-medium transition-colors', scope === 'business' ? 'bg-teal-500 text-white' : 'text-gray-600 hover:bg-gray-50')}
              >
                Business Default
              </button>
            )}
            <button
              onClick={() => setScope('branch')}
              className={cn('px-4 py-2 font-medium transition-colors', scope === 'branch' ? 'bg-teal-500 text-white' : 'text-gray-600 hover:bg-gray-50')}
            >
              Branch Override
            </button>
          </div>
          {scope === 'branch' && (
            <select
              value={selectedBranchId ?? ''}
              onChange={(e) => setSelectedBranchId(e.target.value || null)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          {scope === 'branch' && (
            <p className="text-xs text-gray-400">Branch settings override the business default for this branch only.</p>
          )}
        </div>
        <Button onClick={handleSave} loading={saving} size="sm">
          {saved ? <><CheckCircle2 className="h-4 w-4 mr-1.5 text-green-300" />Saved!</> : <><Save className="h-4 w-4 mr-1.5" />Save Settings</>}
        </Button>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* ── Left: form ── */}
          <div className="space-y-4">

            {/* Page Setup */}
            <Section icon={FileText} title="Page Setup">
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">Paper Size</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PAPER_OPTIONS.map((opt) => (
                    <label key={opt.value} className={cn(
                      'flex cursor-pointer flex-col rounded-lg border p-3 transition-colors',
                      settings.paper_size === opt.value
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}>
                      <input
                        type="radio"
                        value={opt.value}
                        checked={settings.paper_size === opt.value}
                        onChange={() => patch({ paper_size: opt.value as any })}
                        className="sr-only"
                      />
                      <span className={cn('text-sm font-semibold', settings.paper_size === opt.value ? 'text-teal-700' : 'text-gray-800')}>{opt.label}</span>
                      <span className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</span>
                    </label>
                  ))}
                </div>
              </div>
              {!settings.paper_size.startsWith('Receipt') && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-600">Orientation</label>
                  <div className="flex gap-2">
                    {(['portrait', 'landscape'] as const).map((o) => (
                      <label key={o} className={cn(
                        'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors capitalize',
                        settings.orientation === o ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      )}>
                        <input type="radio" className="sr-only" checked={settings.orientation === o} onChange={() => patch({ orientation: o })} />
                        {o}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* Branding */}
            <Section icon={Palette} title="Branding & Colors">
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">Logo</label>
                <ImageUpload
                  value={settings.logo_url ?? ''}
                  onChange={(url) => patch({ logo_url: url || null })}
                  placeholder="Upload invoice logo"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'primary_color',   label: 'Primary (header)' },
                  { key: 'secondary_color', label: 'Header bg tint' },
                  { key: 'text_color',      label: 'Body text' },
                ] as const).map(({ key, label }) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-xs font-medium text-gray-600">{label}</label>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-1.5">
                      <input
                        type="color"
                        value={settings[key]}
                        onChange={(e) => patch({ [key]: e.target.value })}
                        className="h-7 w-10 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={settings[key]}
                        onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && patch({ [key]: e.target.value })}
                        className="min-w-0 flex-1 font-mono text-xs text-gray-700 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">Font</label>
                <select
                  value={settings.font_family}
                  onChange={(e) => patch({ font_family: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </Section>

            {/* Header */}
            <Section icon={Building2} title="Header Information">
              <div className="space-y-2">
                <Toggle label="Show Logo"          checked={settings.show_logo}          onChange={(v) => patch({ show_logo: v })} />
                <Toggle label="Show Business Name" checked={settings.show_business_name} onChange={(v) => patch({ show_business_name: v })} />
                <Toggle label="Show Branch Name"   checked={settings.show_branch_name}   onChange={(v) => patch({ show_branch_name: v })} />
                <Toggle label="Show Address"       checked={settings.show_address}        onChange={(v) => patch({ show_address: v })} />
                <Toggle label="Show Phone Number"  checked={settings.show_phone}          onChange={(v) => patch({ show_phone: v })} />
                <Toggle label="Show Email"         checked={settings.show_email}          onChange={(v) => patch({ show_email: v })} />
              </div>
            </Section>

            {/* Footer Content */}
            <Section icon={AlignLeft} title="Footer Lines & Messages">
              <Input
                label="Thank You Message"
                placeholder="Thank you for your business!"
                value={settings.thank_you_message ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ thank_you_message: e.target.value || null })}
              />
              <Input
                label="Footer Line 1"
                placeholder="e.g. All repairs come with a 90-day warranty"
                value={settings.footer_line_1 ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ footer_line_1: e.target.value || null })}
              />
              <Input
                label="Footer Line 2"
                placeholder="e.g. Free estimates · No fix, no fee"
                value={settings.footer_line_2 ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ footer_line_2: e.target.value || null })}
              />
              <Input
                label="Footer Line 3"
                placeholder="e.g. Open Mon–Sat 9am–6pm"
                value={settings.footer_line_3 ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ footer_line_3: e.target.value || null })}
              />
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Terms / Policy (printed small at bottom)</label>
                <textarea
                  rows={3}
                  placeholder="e.g. All sales are final. Warranty void if tampered with. Registered in England & Wales..."
                  value={settings.policy_text ?? ''}
                  onChange={(e) => patch({ policy_text: e.target.value || null })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
            </Section>

            {/* Social Links */}
            <Section icon={Share2} title="Social Links (shown in footer)">
              <div className="space-y-2.5">
                {SOCIAL_FIELDS.map(({ key, label, icon: Icon, placeholder }) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <Icon className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={(settings.social_links?.[key] as string) ?? ''}
                      onChange={(e) => patchSocial(key, e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                ))}
              </div>
            </Section>

            {/* Options */}
            <Section icon={Settings2} title="Display Options">
              <div className="space-y-2">
                <Toggle
                  label="Show Tax Breakdown"
                  desc="Display tax as a separate line in totals"
                  checked={settings.show_tax_breakdown}
                  onChange={(v) => patch({ show_tax_breakdown: v })}
                />
                <Toggle
                  label="Show Payment Method"
                  desc="Display how the customer paid"
                  checked={settings.show_payment_method}
                  onChange={(v) => patch({ show_payment_method: v })}
                />
                <Toggle
                  label="Unpaid Watermark"
                  desc="Show a faint 'UNPAID' watermark on outstanding invoices"
                  checked={settings.show_unpaid_watermark}
                  onChange={(v) => patch({ show_unpaid_watermark: v })}
                />
              </div>
            </Section>
          </div>

          {/* ── Right: live preview ── */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Eye className="h-4 w-4 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">Live Preview</p>
                <span className="ml-auto text-xs text-gray-400">Updates as you type</span>
              </div>
              <div className="overflow-hidden rounded-lg" style={{ transform: 'scale(0.92)', transformOrigin: 'top center' }}>
                <InvoicePreview s={settings} businessName={previewBusinessName} branchName={previewBranchName} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
