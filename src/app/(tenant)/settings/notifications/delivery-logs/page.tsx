'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/ui-kit'

interface NotificationLogEntry {
  id: string
  trigger_event: string
  channel: 'email' | 'sms'
  recipient: string
  subject: string | null
  body: string
  status: 'sent' | 'failed' | 'queued'
  error_message: string | null
  created_at: string
}

const TRIGGER_LABELS: Record<string, string> = {
  ticket_created:        'Ticket Created',
  ticket_status_changed: 'Ticket Status Changed',
  repair_ready:          'Repair Ready for Collection',
  invoice_created:       'Invoice Created',
  invoice_overdue:       'Invoice Overdue',
  part_arrived:          'Part Arrived',
  estimate_sent:         'Estimate Sent',
  estimate_approved:     'Estimate Approved',
  estimate_declined:     'Estimate Declined',
  appointment_reminder:  'Appointment Reminder',
}

export default function DeliveryLogsPage() {
  const [logPage, setLogPage] = useState(1)

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ['notification-log', logPage],
    queryFn: async () => {
      const res = await fetch(`/api/settings/notification-log?page=${logPage}&limit=20`)
      const json = await res.json()
      return { entries: (json.data ?? []) as NotificationLogEntry[], total: json.meta?.total ?? 0 }
    },
    staleTime: 30_000,
  })

  const logEntries = data?.entries ?? []
  const logTotal = data?.total ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery Logs"
        description="History of all notifications sent to customers"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {logEntries.length === 0 && !loading ? (
        <EmptyState icon={Bell} title="No notifications sent yet." hint="Logs will appear here once notifications are triggered." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
            <table className="min-w-full divide-y divide-outline-variant">
              <thead className="bg-primary">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3.5 text-left text-[13px] font-medium text-white">Event</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-left text-[13px] font-medium text-white">Channel</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-left text-[13px] font-medium text-white">Recipient</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-left text-[13px] font-medium text-white">Status</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-left text-[13px] font-medium text-white">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-24 animate-pulse rounded bg-surface-container" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : logEntries.map((entry) => (
                      <tr key={entry.id} className="transition-colors hover:bg-surface-container-low">
                        <td className="px-4 py-3 text-sm text-on-surface">
                          {TRIGGER_LABELS[entry.trigger_event] ?? entry.trigger_event}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={entry.channel === 'email' ? 'default' : 'success'}>
                            {entry.channel.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-on-surface-variant max-w-[200px] truncate">
                          {entry.recipient}
                        </td>
                        <td className="px-4 py-3">
                          {entry.status === 'sent' && <Badge variant="success">Sent</Badge>}
                          {entry.status === 'failed' && (
                            <div>
                              <Badge variant="destructive">Failed</Badge>
                              {entry.error_message && (
                                <p className="mt-1 max-w-[260px] text-[11px] leading-snug text-red-600 break-words">
                                  {entry.error_message}
                                </p>
                              )}
                            </div>
                          )}
                          {entry.status === 'queued' && <Badge variant="warning">Queued</Badge>}
                        </td>
                        <td className="px-4 py-3 text-sm text-on-surface-variant">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {logTotal > 20 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-on-surface-variant">
                Showing {(logPage - 1) * 20 + 1}–{Math.min(logPage * 20, logTotal)} of {logTotal}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={logPage <= 1} onClick={() => setLogPage(logPage - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={logPage * 20 >= logTotal} onClick={() => setLogPage(logPage + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
