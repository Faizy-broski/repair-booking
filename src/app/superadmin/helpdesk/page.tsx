'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Search, X, Trash2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */
interface AdminTicket {
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
  businesses?: { name: string } | null
}

/* ── Constants ───────────────────────────────────────────────── */
const STATUSES = [
  { value: 'all',         label: 'All' },
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
] as const

const STATUS_STYLES: Record<string, string> = {
  open:        'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  resolved:    'bg-green-50 text-green-700 ring-1 ring-green-200',
  closed:      'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
}
const PRIORITY_STYLES: Record<string, string> = {
  low:    'bg-green-50 text-green-700 ring-1 ring-green-200',
  medium: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  high:   'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  urgent: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500')}>
      {status.replace('_', ' ')}
    </span>
  )
}
function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', PRIORITY_STYLES[priority] ?? 'bg-gray-100 text-gray-500')}>
      {priority}
    </span>
  )
}

/* ── Page ────────────────────────────────────────────────────── */
export default function AdminHelpdeskPage() {
  const queryClient = useQueryClient()

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage]                 = useState(0)
  const pageSize                         = 15

  const [viewTicket, setViewTicket]     = useState<AdminTicket | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminTicket | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [updatingId, setUpdatingId]     = useState<string | null>(null)

  const queryKey = ['admin-helpdesk', page, pageSize, statusFilter, search]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page + 1),
        limit: String(pageSize),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
      })
      const res = await fetch(`/api/admin/helpdesk?${params}`)
      return res.json()
    },
    staleTime: 30_000,
  })

  const tickets: AdminTicket[] = data?.data ?? []
  const total: number          = data?.meta?.total ?? 0
  const totalPages             = Math.ceil(total / pageSize)

  /* ── Update status ──────────────────────────────────────────── */
  async function updateStatus(ticket: AdminTicket, newStatus: AdminTicket['status']) {
    if (ticket.status === newStatus) return
    setUpdatingId(ticket.id)
    const prev = queryClient.getQueryData(queryKey)
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old?.data) return old
      return { ...old, data: old.data.map((t: AdminTicket) => t.id === ticket.id ? { ...t, status: newStatus } : t) }
    })
    if (viewTicket?.id === ticket.id) setViewTicket({ ...viewTicket, status: newStatus })
    try {
      const res = await fetch(`/api/admin/helpdesk/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        queryClient.setQueryData(queryKey, prev)
        toast.error('Failed to update status')
      } else {
        toast.success('Status updated')
        queryClient.invalidateQueries({ queryKey: ['admin-helpdesk'] })
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
    setViewTicket(null)
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old?.data) return old
      return {
        ...old,
        data: old.data.filter((t: AdminTicket) => t.id !== target.id),
        meta: { ...old.meta, total: Math.max(0, (old.meta?.total ?? 1) - 1) },
      }
    })
    try {
      const res = await fetch(`/api/admin/helpdesk/${target.id}`, { method: 'DELETE' })
      if (!res.ok) {
        queryClient.setQueryData(queryKey, prev)
        toast.error('Failed to delete ticket')
      } else {
        toast.success(`Ticket #${String(target.ticket_number).padStart(8, '0')} deleted`)
        queryClient.invalidateQueries({ queryKey: ['admin-helpdesk'] })
      }
    } finally {
      setDeleting(false)
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-on-surface">Helpdesk Tickets</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">All support tickets from businesses across the platform</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline" />
          <input
            type="text"
            placeholder="Search tickets…"
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
              {['Ticket ID', 'Business', 'Title', 'Category', 'Status', 'Priority', 'Raised By', 'Date', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-outline">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded bg-surface-container" /></td>
                  ))}
                </tr>
              ))
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-on-surface-variant">
                  No tickets found.
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => setViewTicket(t)} className="font-mono text-sm font-semibold text-primary hover:underline">
                      #{String(t.ticket_number).padStart(8, '0')}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{t.businesses?.name ?? '—'}</td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="block truncate text-sm font-medium text-on-surface">{t.title}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{t.category}</td>
                  <td className="px-4 py-3">
                    <div className="relative group">
                      <button
                        disabled={updatingId === t.id}
                        className="flex items-center gap-1"
                        title="Click to change status"
                      >
                        <StatusBadge status={t.status} />
                        <ChevronDown className="h-3 w-3 text-outline opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <div className="absolute left-0 top-full z-10 mt-1 hidden w-36 rounded-lg border border-outline-variant bg-surface shadow-lg group-hover:block">
                        {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatus(t, s)}
                            className={cn(
                              'flex w-full items-center px-3 py-2 text-xs hover:bg-surface-container-low capitalize transition-colors',
                              t.status === s ? 'font-semibold text-primary' : 'text-on-surface'
                            )}
                          >
                            {s.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{t.profiles?.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-outline whitespace-nowrap">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setViewTicket(t)} title="View" className="text-primary hover:opacity-70">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(t)} title="Delete" className="text-error hover:opacity-70">
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
      {viewTicket && (
        <Modal open={!!viewTicket} onClose={() => setViewTicket(null)} title={`Ticket #${String(viewTicket.ticket_number).padStart(8, '0')}`} size="lg">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={viewTicket.status} />
              <PriorityBadge priority={viewTicket.priority} />
              <span className="text-xs text-on-surface-variant">{viewTicket.category}</span>
              {viewTicket.businesses?.name && (
                <span className="rounded bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">
                  {viewTicket.businesses.name}
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-on-surface">{viewTicket.title}</h3>
            {viewTicket.description ? (
              <div
                className="helpdesk-body rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface"
                dangerouslySetInnerHTML={{ __html: viewTicket.description }}
              />
            ) : (
              <p className="text-sm text-on-surface-variant italic">No description provided.</p>
            )}
            <div className="border-t border-outline-variant pt-3">
              <p className="text-xs text-on-surface-variant mb-2">Update status:</p>
              <div className="flex flex-wrap gap-2">
                {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(viewTicket, s)}
                    disabled={updatingId === viewTicket.id}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors border',
                      viewTicket.status === s
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container'
                    )}
                  >
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-on-surface-variant border-t border-outline-variant pt-3">
              <span>Raised by {viewTicket.profiles?.full_name ?? '—'}</span>
              <span>{new Date(viewTicket.created_at).toLocaleString()}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="destructive" onClick={() => { setViewTicket(null); setDeleteTarget(viewTicket) }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button variant="outline" onClick={() => setViewTicket(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────── */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Ticket" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">
              Are you sure you want to permanently delete ticket{' '}
              <span className="font-mono font-semibold text-on-surface">
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
