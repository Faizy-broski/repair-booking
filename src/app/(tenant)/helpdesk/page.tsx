'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Eye, Pencil, Plus, Search, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */
interface Ticket {
  id: string
  ticket_number: number
  title: string
  description: string | null
  category: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
  profiles?: { full_name: string | null } | null
  branches?: { name: string } | null
}

interface FormValues {
  title: string
  category: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

/* ── Constants ───────────────────────────────────────────────── */
const CATEGORIES = [
  'Technical Support', 'Billing', 'Feature Request',
  'Bug Report', 'General Inquiry', 'Account Management',
]

const PRIORITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const

const STATUSES = [
  { value: 'all',         label: 'All Tickets' },
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
] as const

/* ── Badge helpers ───────────────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  open:        'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  resolved:    'bg-green-50 text-green-700 ring-1 ring-green-200',
  closed:      'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
}
const STATUS_LABELS: Record<string, string> = {
  open: 'open', in_progress: 'in progress', resolved: 'resolved', closed: 'closed',
}
const PRIORITY_STYLES: Record<string, string> = {
  low:    'bg-green-50 text-green-700 ring-1 ring-green-200',
  medium: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  high:   'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  urgent: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500')}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', PRIORITY_STYLES[priority] ?? 'bg-gray-100 text-gray-500')}>
      {priority}
    </span>
  )
}

/* ── Page ────────────────────────────────────────────────────── */
export default function HelpdeskPage() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage]                 = useState(0)
  const pageSize                         = 10

  const [createOpen, setCreateOpen]         = useState(false)
  const [viewTicket, setViewTicket]         = useState<Ticket | null>(null)
  const [editTicket, setEditTicket]         = useState<Ticket | null>(null)
  const [deleteTarget, setDeleteTarget]     = useState<Ticket | null>(null)
  const [description, setDescription]       = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const [deleting, setDeleting]             = useState(false)
  const [editStatus, setEditStatus]         = useState<Ticket['status']>('open')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: { title: '', category: 'Technical Support', priority: 'medium' },
  })
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit, formState: { errors: editErrors } } = useForm<FormValues>()

  /* ── Query ─────────────────────────────────────────────────── */
  const queryKey = ['helpdesk', activeBranch?.id, page, pageSize, statusFilter, search]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page + 1),
        limit: String(pageSize),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
      })
      const res = await fetch(`/api/helpdesk?${params}`)
      return res.json()
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
  })

  const tickets: Ticket[] = data?.data ?? []
  const total: number     = data?.meta?.total ?? 0
  const totalPages        = Math.ceil(total / pageSize)

  /* ── Create ─────────────────────────────────────────────────── */
  async function onCreateSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/helpdesk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, description }),
      })
      if (!res.ok) { toast.error('Failed to create ticket'); return }
      toast.success('Ticket raised successfully')
      setCreateOpen(false)
      reset()
      setDescription('')
      queryClient.invalidateQueries({ queryKey: ['helpdesk'] })
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Edit ───────────────────────────────────────────────────── */
  function openEdit(ticket: Ticket) {
    setEditTicket(ticket)
    setEditStatus(ticket.status)
    setEditDescription(ticket.description ?? '')
    resetEdit({ title: ticket.title, category: ticket.category, priority: ticket.priority })
  }

  async function onEditSubmit(values: FormValues) {
    if (!editTicket) return
    setSubmitting(true)
    const prev = queryClient.getQueryData(queryKey)
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old?.data) return old
      return { ...old, data: old.data.map((t: Ticket) => t.id === editTicket.id ? { ...t, ...values, status: editStatus, description: editDescription } : t) }
    })
    setEditTicket(null)
    try {
      const res = await fetch(`/api/helpdesk/${editTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, status: editStatus, description: editDescription }),
      })
      if (!res.ok) {
        queryClient.setQueryData(queryKey, prev)
        toast.error('Failed to update ticket')
      } else {
        toast.success('Ticket updated')
        queryClient.invalidateQueries({ queryKey: ['helpdesk'] })
      }
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Delete ─────────────────────────────────────────────────── */
  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleting(true)
    const prev = queryClient.getQueryData(queryKey)
    setDeleteTarget(null)
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old?.data) return old
      return {
        ...old,
        data: old.data.filter((t: Ticket) => t.id !== target.id),
        meta: { ...old.meta, total: Math.max(0, (old.meta?.total ?? 1) - 1) },
      }
    })
    try {
      const res = await fetch(`/api/helpdesk/${target.id}`, { method: 'DELETE' })
      if (!res.ok) {
        queryClient.setQueryData(queryKey, prev)
        toast.error('Failed to delete ticket')
      } else {
        toast.success(`Ticket #${String(target.ticket_number).padStart(8, '0')} deleted`)
        queryClient.invalidateQueries({ queryKey: ['helpdesk'] })
      }
    } finally {
      setDeleting(false)
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="space-y-5 p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Helpdesk Tickets</h1>
          <p className="mt-0.5 text-sm text-gray-500">Raise and track support requests with the platform team</p>
        </div>
        <Button onClick={() => { reset(); setDescription(''); setCreateOpen(true) }} className="bg-brand-teal hover:bg-brand-teal-dark">
          <Plus className="h-4 w-4" /> New Ticket
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tickets…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-teal focus:outline-none"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0) }} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {STATUSES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setStatusFilter(value); setPage(0) }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                statusFilter === value
                  ? 'bg-brand-teal text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Ticket ID', 'Title', 'Category', 'Status', 'Priority', 'Created By', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded bg-gray-100" /></td>
                  ))}
                </tr>
              ))
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  No tickets found. Raise a new ticket to get support.
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => setViewTicket(t)} className="font-mono text-sm font-semibold text-brand-teal hover:underline">
                      #{String(t.ticket_number).padStart(8, '0')}
                    </button>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <span className="block truncate text-sm font-medium text-gray-900">{t.title}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.category}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.profiles?.full_name ?? 'You'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setViewTicket(t)} title="View" className="text-brand-teal hover:text-brand-teal-dark">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => openEdit(t)} title="Edit" className="text-blue-500 hover:text-blue-700">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(t)} title="Delete" className="text-red-400 hover:text-red-600">
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
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <span className="text-xs text-gray-500">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Prev</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create Modal ─────────────────────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Helpdesk Ticket" size="lg">
        <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label>
            <input
              {...register('title', { required: 'Title is required' })}
              placeholder="Enter ticket title"
              className={cn('w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-brand-teal', errors.title ? 'border-red-400' : 'border-gray-200')}
            />
            {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
          </div>
          <RichTextEditor label="Description" value={description} onChange={setDescription} placeholder="Describe your issue in detail…" minHeight={150} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
              <select {...register('category')} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
              <select {...register('priority')} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none">
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitting} className="bg-brand-teal hover:bg-brand-teal-dark">Create</Button>
          </div>
        </form>
      </Modal>

      {/* ── View Modal ───────────────────────────────────────────── */}
      {viewTicket && (
        <Modal open={!!viewTicket} onClose={() => setViewTicket(null)} title={`Ticket #${String(viewTicket.ticket_number).padStart(8, '0')}`} size="lg">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={viewTicket.status} />
              <PriorityBadge priority={viewTicket.priority} />
              <span className="text-xs text-gray-400">{viewTicket.category}</span>
            </div>
            <h3 className="text-base font-semibold text-gray-900">{viewTicket.title}</h3>
            {viewTicket.description ? (
              <div className="helpdesk-body rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: viewTicket.description }} />
            ) : (
              <p className="text-sm text-gray-400 italic">No description provided.</p>
            )}
            <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3">
              <span>Raised by {viewTicket.profiles?.full_name ?? 'You'}</span>
              <span>{new Date(viewTicket.created_at).toLocaleString()}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setViewTicket(null); openEdit(viewTicket) }}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button variant="destructive" onClick={() => { setViewTicket(null); setDeleteTarget(viewTicket) }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button variant="outline" onClick={() => setViewTicket(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Modal ───────────────────────────────────────────── */}
      {editTicket && (
        <Modal open={!!editTicket} onClose={() => setEditTicket(null)} title="Edit Ticket" size="lg">
          <form onSubmit={handleEditSubmit(onEditSubmit)} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label>
              <input
                {...regEdit('title', { required: 'Title is required' })}
                className={cn('w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-brand-teal', editErrors.title ? 'border-red-400' : 'border-gray-200')}
              />
              {editErrors.title && <p className="mt-1 text-xs text-red-500">{editErrors.title.message}</p>}
            </div>
            <RichTextEditor label="Description" value={editDescription} onChange={setEditDescription} minHeight={140} />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <select {...regEdit('category')} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
                <select {...regEdit('priority')} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none">
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Ticket['status'])} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none">
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditTicket(null)}>Cancel</Button>
              <Button type="submit" loading={submitting} className="bg-brand-teal hover:bg-brand-teal-dark">Save Changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────── */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Ticket" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete ticket{' '}
              <span className="font-mono font-semibold text-gray-900">
                #{String(deleteTarget.ticket_number).padStart(8, '0')}
              </span>
              ? This cannot be undone.
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
