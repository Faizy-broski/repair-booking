'use client'
import { useState, useEffect, useRef } from 'react'
import { Megaphone, Plus, Send, Archive, Pencil, X, AlertTriangle, Info, Wrench, Clock, Globe, Building2, Search, ChevronDown } from 'lucide-react'
import type { SystemBroadcast, BroadcastType } from '@/backend/services/broadcast.service'

interface BusinessOption {
  id: string
  name: string
  subdomain: string
}

const TYPE_META: Record<BroadcastType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  info:        { label: 'Info',        icon: Info,          color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200' },
  warning:     { label: 'Warning',     icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  downtime:    { label: 'Downtime',    icon: AlertTriangle, color: 'text-red-600',   bg: 'bg-red-50 border-red-200' },
  maintenance: { label: 'Maintenance', icon: Wrench,        color: 'text-orange-600',bg: 'bg-orange-50 border-orange-200' },
}

const STATUS_PILL: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  active:   'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
}

interface FormState {
  type: BroadcastType
  title: string
  body: string
  target_scope: 'all' | 'business'
  target_business_id: string | null
  expires_at: string
}

const DEFAULT_FORM: FormState = {
  type: 'info',
  title: '',
  body: '',
  target_scope: 'all',
  target_business_id: null,
  expires_at: '',
}

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<SystemBroadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Business picker state
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [bizSearch, setBizSearch] = useState('')
  const [bizOpen, setBizOpen] = useState(false)
  const [bizLoading, setBizLoading] = useState(false)
  const bizRef = useRef<HTMLDivElement>(null)

  const selectedBiz = businesses.find((b) => b.id === form.target_business_id) ?? null
  const filteredBiz = businesses.filter(
    (b) =>
      b.name.toLowerCase().includes(bizSearch.toLowerCase()) ||
      b.subdomain.toLowerCase().includes(bizSearch.toLowerCase())
  )

  async function loadBusinesses() {
    if (businesses.length > 0) return
    setBizLoading(true)
    try {
      const res = await fetch('/api/businesses?limit=200')
      const j = await res.json()
      setBusinesses(
        (j.data ?? []).map((b: any) => ({ id: b.id, name: b.name, subdomain: b.subdomain }))
      )
    } finally {
      setBizLoading(false)
    }
  }

  // Close biz dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (bizOpen && !bizRef.current?.contains(e.target as Node)) setBizOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [bizOpen])

  async function loadBroadcasts() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/broadcasts')
      const j = await res.json()
      setBroadcasts(j.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBroadcasts() }, [])

  function openCreate() {
    setEditId(null)
    setForm(DEFAULT_FORM)
    setBizSearch('')
    setError(null)
    setShowForm(true)
  }

  function openEdit(b: SystemBroadcast) {
    setEditId(b.id)
    setForm({
      type: b.type,
      title: b.title,
      body: b.body,
      target_scope: b.target_scope,
      target_business_id: b.target_business_id,
      expires_at: b.expires_at ? b.expires_at.slice(0, 16) : '',
    })
    setBizSearch('')
    setError(null)
    setShowForm(true)
    if (b.target_scope === 'business') loadBusinesses()
  }

  async function handleSave(publishNow: boolean) {
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and body are required.')
      return
    }
    if (form.target_scope === 'business' && !form.target_business_id) {
      setError('Please select a business.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        target_business_id: form.target_scope === 'all' ? null : form.target_business_id,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        status: publishNow ? 'active' : 'draft',
      }

      let res: Response
      if (editId) {
        res = await fetch(`/api/admin/broadcasts/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/admin/broadcasts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const j = await res.json()
        setError(j?.error?.message ?? 'Failed to save')
        return
      }
      setShowForm(false)
      loadBroadcasts()
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish(id: string) {
    setPublishing(id)
    try {
      await fetch(`/api/admin/broadcasts/${id}/publish`, { method: 'POST' })
      loadBroadcasts()
    } finally {
      setPublishing(null)
    }
  }

  async function handleArchive(id: string) {
    setArchiving(id)
    try {
      await fetch(`/api/admin/broadcasts/${id}`, { method: 'DELETE' })
      loadBroadcasts()
    } finally {
      setArchiving(null)
    }
  }

  const drafts   = broadcasts.filter((b) => b.status === 'draft')
  const active   = broadcasts.filter((b) => b.status === 'active')
  const archived = broadcasts.filter((b) => b.status === 'archived')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">System Broadcasts</h1>
          <p className="text-sm text-gray-500">Create and publish platform-wide announcements to all businesses</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-dark transition-colors"
        >
          <Plus className="h-4 w-4" /> New Broadcast
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">{editId ? 'Edit Broadcast' : 'New Broadcast'}</h2>
            <button onClick={() => setShowForm(false)} className="rounded-lg p-1 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-4">
            {/* Type selector */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Type</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TYPE_META) as BroadcastType[]).map((t) => {
                  const m = TYPE_META[t]
                  const Icon = m.icon
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                        form.type === t ? `${m.bg} ${m.color} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {m.label}
                    </button>
                  )
                })}
              </div>
              {(form.type === 'downtime' || form.type === 'maintenance') && (
                <p className="mt-1.5 text-xs text-amber-600">
                  This type will display as a persistent top banner on every business dashboard.
                </p>
              )}
            </div>

            {/* Target scope */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Target</label>
              <div className="flex gap-2">
                {(['all', 'business'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, target_scope: scope, target_business_id: null }))
                      if (scope === 'business') loadBusinesses()
                    }}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      form.target_scope === scope
                        ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {scope === 'all' ? <Globe className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                    {scope === 'all' ? 'All Businesses' : 'Specific Business'}
                  </button>
                ))}
              </div>

              {/* Business picker — shown only when Specific Business is selected */}
              {form.target_scope === 'business' && (
                <div ref={bizRef} className="relative mt-2 w-72">
                  <button
                    type="button"
                    onClick={() => setBizOpen((v) => !v)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none ${
                      selectedBiz
                        ? 'border-brand-teal bg-brand-teal/5 text-brand-teal'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {selectedBiz ? (
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-teal text-[10px] font-bold text-white uppercase">
                          {selectedBiz.name.charAt(0)}
                        </span>
                        <span className="font-semibold truncate">{selectedBiz.name}</span>
                        <span className="text-brand-teal/60 text-xs shrink-0">{selectedBiz.subdomain}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        Select a business…
                      </span>
                    )}
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 ml-2 transition-transform ${bizOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {bizOpen && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                      {/* Search */}
                      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search…"
                          value={bizSearch}
                          onChange={(e) => setBizSearch(e.target.value)}
                          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
                        />
                        {bizSearch && (
                          <button onClick={() => setBizSearch('')} className="text-gray-300 hover:text-gray-500">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      <div className="max-h-48 overflow-y-auto">
                        {bizLoading ? (
                          <div className="px-4 py-5 text-center text-xs text-gray-400">Loading businesses…</div>
                        ) : filteredBiz.length === 0 ? (
                          <div className="px-4 py-5 text-center text-xs text-gray-400">No match found</div>
                        ) : (
                          filteredBiz.map((b) => {
                            const selected = form.target_business_id === b.id
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => {
                                  setForm((f) => ({ ...f, target_business_id: b.id }))
                                  setBizOpen(false)
                                  setBizSearch('')
                                }}
                                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                                  selected
                                    ? 'bg-brand-teal/8 text-brand-teal'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold uppercase ${
                                  selected ? 'bg-brand-teal text-white' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {b.name.charAt(0)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate text-xs">{b.name}</p>
                                  <p className="text-[10px] text-gray-400 truncate">{b.subdomain}</p>
                                </div>
                                {selected && <span className="text-brand-teal text-xs">✓</span>}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Title</label>
              <input
                type="text"
                maxLength={120}
                placeholder="e.g. Scheduled Maintenance — Sunday 2–4am"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
              />
            </div>

            {/* Body */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Message</label>
              <textarea
                rows={4}
                maxLength={2000}
                placeholder="Describe the issue or announcement in detail..."
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none resize-none"
              />
            </div>

            {/* Expiry */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Expires At <span className="font-normal text-gray-400 normal-case">(optional — leave blank for permanent)</span>
              </label>
              <div className="relative w-56">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save as Draft'}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-dark transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {saving ? 'Publishing…' : 'Publish Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Active broadcasts */}
          {active.length > 0 && (
            <Section title="Active" count={active.length} countColor="text-green-600 bg-green-100">
              {active.map((b) => <BroadcastRow key={b.id} b={b} onEdit={openEdit} onArchive={handleArchive} archiving={archiving} />)}
            </Section>
          )}

          {/* Drafts */}
          {drafts.length > 0 && (
            <Section title="Drafts" count={drafts.length} countColor="text-gray-600 bg-gray-100">
              {drafts.map((b) => (
                <BroadcastRow key={b.id} b={b} onEdit={openEdit} onPublish={handlePublish} onArchive={handleArchive} publishing={publishing} archiving={archiving} />
              ))}
            </Section>
          )}

          {/* Archived */}
          {archived.length > 0 && (
            <Section title="Archived" count={archived.length} countColor="text-gray-400 bg-gray-100" collapsed>
              {archived.map((b) => <BroadcastRow key={b.id} b={b} onEdit={openEdit} archiving={archiving} />)}
            </Section>
          )}

          {broadcasts.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 py-16 text-center">
              <Megaphone className="h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No broadcasts yet</p>
              <p className="text-xs text-gray-400">Create one to send a platform-wide announcement</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, count, countColor, children, collapsed: initCollapsed = false }: {
  title: string; count: number; countColor: string; children: React.ReactNode; collapsed?: boolean
}) {
  const [open, setOpen] = useState(!initCollapsed)
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${countColor}`}>{count}</span>
        </div>
        <span className={`text-xs text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && <div className="divide-y divide-gray-100">{children}</div>}
    </div>
  )
}

function BroadcastRow({ b, onEdit, onPublish, onArchive, publishing, archiving }: {
  b: SystemBroadcast
  onEdit: (b: SystemBroadcast) => void
  onPublish?: (id: string) => void
  onArchive?: (id: string) => void
  publishing?: string | null
  archiving?: string | null
}) {
  const m = TYPE_META[b.type]
  const Icon = m.icon

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${m.bg}`}>
        <Icon className={`h-4 w-4 ${m.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{b.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_PILL[b.status]}`}>
            {b.status.toUpperCase()}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.bg} ${m.color} border`}>
            {m.label}
          </span>
          {b.target_scope === 'all'
            ? <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><Globe className="h-2.5 w-2.5" /> All businesses</span>
            : <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><Building2 className="h-2.5 w-2.5" /> Targeted</span>
          }
        </div>
        <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{b.body}</p>
        <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400">
          <span>Created {new Date(b.created_at).toLocaleDateString()}</span>
          {b.expires_at && <span>Expires {new Date(b.expires_at).toLocaleDateString()}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {b.status !== 'archived' && (
          <button
            onClick={() => onEdit(b)}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {b.status === 'draft' && onPublish && (
          <button
            onClick={() => onPublish(b.id)}
            disabled={publishing === b.id}
            className="flex items-center gap-1 rounded-lg bg-brand-teal/10 px-2.5 py-1.5 text-xs font-semibold text-brand-teal hover:bg-brand-teal/20 transition-colors disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
            {publishing === b.id ? '…' : 'Publish'}
          </button>
        )}
        {b.status !== 'archived' && onArchive && (
          <button
            onClick={() => onArchive(b.id)}
            disabled={archiving === b.id}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
