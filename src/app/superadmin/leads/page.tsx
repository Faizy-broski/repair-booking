'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Search, X, Trash2, ChevronDown, Mail, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */
type LeadSource = 'contact_us' | 'demo_request' | 'enterprise_contact' | 'newsletter'
type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'closed'

interface AdminLead {
  id: string
  source: LeadSource
  name: string
  email: string
  phone: string | null
  company: string | null
  message: string | null
  page_url: string | null
  status: LeadStatus
  created_at: string
}

/* ── Constants ───────────────────────────────────────────────── */
const STATUSES = [
  { value: 'all',        label: 'All' },
  { value: 'new',        label: 'New' },
  { value: 'contacted',  label: 'Contacted' },
  { value: 'qualified',  label: 'Qualified' },
  { value: 'converted',  label: 'Converted' },
  { value: 'closed',     label: 'Closed' },
] as const

const SOURCES = [
  { value: 'all',                 label: 'All sources' },
  { value: 'contact_us',          label: 'Contact Us' },
  { value: 'demo_request',        label: 'Demo Request' },
  { value: 'enterprise_contact',  label: 'Enterprise' },
  { value: 'newsletter',          label: 'Newsletter' },
] as const

const STATUS_STYLES: Record<string, string> = {
  new:       'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  contacted: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  qualified: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  converted: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  closed:    'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
}
const SOURCE_STYLES: Record<string, string> = {
  contact_us:         'bg-slate-100 text-slate-700',
  demo_request:       'bg-teal-50 text-teal-700',
  enterprise_contact: 'bg-indigo-50 text-indigo-700',
  newsletter:         'bg-pink-50 text-pink-700',
}
const SOURCE_LABELS: Record<string, string> = {
  contact_us: 'Contact Us',
  demo_request: 'Demo Request',
  enterprise_contact: 'Enterprise',
  newsletter: 'Newsletter',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500')}>
      {status}
    </span>
  )
}
function SourceBadge({ source }: { source: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', SOURCE_STYLES[source] ?? 'bg-gray-100 text-gray-500')}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

/* ── Page ────────────────────────────────────────────────────── */
export default function AdminLeadsPage() {
  const queryClient = useQueryClient()

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [page, setPage]                 = useState(0)
  const pageSize                         = 15

  const [viewLead, setViewLead]         = useState<AdminLead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminLead | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [updatingId, setUpdatingId]     = useState<string | null>(null)

  const queryKey = ['admin-leads', page, pageSize, statusFilter, sourceFilter, search]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page + 1),
        limit: String(pageSize),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(sourceFilter !== 'all' ? { source: sourceFilter } : {}),
        ...(search ? { search } : {}),
      })
      const res = await fetch(`/api/admin/leads?${params}`)
      return res.json()
    },
    staleTime: 30_000,
  })

  const leads: AdminLead[] = data?.data ?? []
  const total: number      = data?.meta?.total ?? 0
  const totalPages         = Math.ceil(total / pageSize)

  /* ── Update status ──────────────────────────────────────────── */
  async function updateStatus(lead: AdminLead, newStatus: LeadStatus) {
    if (lead.status === newStatus) return
    setUpdatingId(lead.id)
    const prev = queryClient.getQueryData(queryKey)
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old?.data) return old
      return { ...old, data: old.data.map((l: AdminLead) => l.id === lead.id ? { ...l, status: newStatus } : l) }
    })
    if (viewLead?.id === lead.id) setViewLead({ ...viewLead, status: newStatus })
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        queryClient.setQueryData(queryKey, prev)
        toast.error('Failed to update status')
      } else {
        toast.success('Status updated')
        queryClient.invalidateQueries({ queryKey: ['admin-leads'] })
      }
    } finally {
      setUpdatingId(null)
    }
  }

  /* ── Delete ─────────────────────────────────────────────────── */
  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleting(true)
    const prev = queryClient.getQueryData(queryKey)
    setDeleteTarget(null)
    setViewLead(null)
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old?.data) return old
      return {
        ...old,
        data: old.data.filter((l: AdminLead) => l.id !== target.id),
        meta: { ...old.meta, total: Math.max(0, (old.meta?.total ?? 1) - 1) },
      }
    })
    try {
      const res = await fetch(`/api/admin/leads/${target.id}`, { method: 'DELETE' })
      if (!res.ok) {
        queryClient.setQueryData(queryKey, prev)
        toast.error('Failed to delete lead')
      } else {
        toast.success('Lead deleted')
        queryClient.invalidateQueries({ queryKey: ['admin-leads'] })
      }
    } finally {
      setDeleting(false)
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-on-surface">Leads</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">Every lead-gen form submission from the marketing site</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline" />
          <input
            type="text"
            placeholder="Search name, email, company…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="w-full rounded-lg border border-outline-variant bg-surface py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0) }} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-outline" />
            </button>
          )}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(0) }}
          className="h-9 rounded-lg border border-outline-variant bg-surface px-3 text-sm text-on-surface-variant focus:border-primary focus:outline-none"
        >
          {SOURCES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-lg border border-outline-variant bg-surface p-1">
          {STATUSES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setStatusFilter(value); setPage(0) }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                statusFilter === value
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <table className="min-w-full divide-y divide-outline-variant">
          <thead className="bg-surface-container-low">
            <tr>
              {['Name', 'Contact', 'Source', 'Company', 'Status', 'Date', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-outline">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded bg-surface-container" /></td>
                  ))}
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-on-surface-variant">
                  No leads found.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => setViewLead(lead)} className="text-sm font-semibold text-primary hover:underline">
                      {lead.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    <div>{lead.email}</div>
                    {lead.phone && <div className="text-xs text-outline">{lead.phone}</div>}
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={lead.source} /></td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{lead.company ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="relative group">
                      <button
                        disabled={updatingId === lead.id}
                        className="flex items-center gap-1"
                        title="Click to change status"
                      >
                        <StatusBadge status={lead.status} />
                        <ChevronDown className="h-3 w-3 text-outline opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <div className="absolute left-0 top-full z-10 mt-1 hidden w-36 rounded-lg border border-outline-variant bg-surface shadow-lg group-hover:block">
                        {(['new', 'contacted', 'qualified', 'converted', 'closed'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatus(lead, s)}
                            className={cn(
                              'flex w-full items-center px-3 py-2 text-xs hover:bg-surface-container-low capitalize transition-colors',
                              lead.status === s ? 'font-semibold text-primary' : 'text-on-surface'
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-outline whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setViewLead(lead)} title="View" className="text-primary hover:opacity-70">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(lead)} title="Delete" className="text-error hover:opacity-70">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-outline-variant px-4 py-3">
            <span className="text-xs text-on-surface-variant">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Prev</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── View Modal ───────────────────────────────────────────── */}
      {viewLead && (
        <Modal open={!!viewLead} onClose={() => setViewLead(null)} title={viewLead.name} size="lg">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={viewLead.status} />
              <SourceBadge source={viewLead.source} />
              {viewLead.company && (
                <span className="rounded bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">
                  {viewLead.company}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2 text-sm text-on-surface">
              <a href={`mailto:${viewLead.email}`} className="flex items-center gap-2 hover:text-primary">
                <Mail className="h-4 w-4 text-outline" /> {viewLead.email}
              </a>
              {viewLead.phone && (
                <a href={`tel:${viewLead.phone}`} className="flex items-center gap-2 hover:text-primary">
                  <Phone className="h-4 w-4 text-outline" /> {viewLead.phone}
                </a>
              )}
            </div>

            {viewLead.message ? (
              <div className="rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface whitespace-pre-wrap">
                {viewLead.message}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant italic">No message provided.</p>
            )}

            <div className="border-t border-outline-variant pt-3">
              <p className="text-xs text-on-surface-variant mb-2">Update status:</p>
              <div className="flex flex-wrap gap-2">
                {(['new', 'contacted', 'qualified', 'converted', 'closed'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(viewLead, s)}
                    disabled={updatingId === viewLead.id}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors border',
                      viewLead.status === s
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-on-surface-variant border-t border-outline-variant pt-3">
              <span>{viewLead.page_url ?? '—'}</span>
              <span>{new Date(viewLead.created_at).toLocaleString()}</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="destructive" onClick={() => { setViewLead(null); setDeleteTarget(viewLead) }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button variant="outline" onClick={() => setViewLead(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────── */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Lead" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">
              Are you sure you want to permanently delete the lead from{' '}
              <span className="font-semibold text-on-surface">{deleteTarget.name}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" loading={deleting} onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
