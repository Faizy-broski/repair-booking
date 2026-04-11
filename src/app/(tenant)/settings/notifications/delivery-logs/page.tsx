'use client'
import { useState, useEffect, useCallback } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  const [logEntries, setLogEntries] = useState<NotificationLogEntry[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const fetchLog = useCallback(async (page = 1) => {
    setLoading(true)
    const res = await fetch(`/api/settings/notification-log?page=${page}&limit=20`)
    const json = await res.json()
    setLogEntries(json.data ?? [])
    setLogTotal(json.meta?.total ?? 0)
    setLogPage(page)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLog(1)
  }, [fetchLog])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
            <Bell className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Delivery Logs</h1>
            <p className="text-sm text-gray-500">History of all notifications sent to customers</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLog(1)} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {logEntries.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">No notifications sent yet.</p>
          <p className="text-sm text-gray-400 mt-1">Logs will appear here once notifications are triggered.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : logEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {TRIGGER_LABELS[entry.trigger_event] ?? entry.trigger_event}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={entry.channel === 'email' ? 'default' : 'success'}>
                            {entry.channel.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                          {entry.recipient}
                        </td>
                        <td className="px-4 py-3">
                          {entry.status === 'sent' && <Badge variant="success">Sent</Badge>}
                          {entry.status === 'failed' && (
                            <span title={entry.error_message ?? ''}>
                              <Badge variant="destructive">Failed</Badge>
                            </span>
                          )}
                          {entry.status === 'queued' && <Badge variant="warning">Queued</Badge>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
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
              <p className="text-sm text-gray-500">
                Showing {(logPage - 1) * 20 + 1}–{Math.min(logPage * 20, logTotal)} of {logTotal}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={logPage <= 1} onClick={() => fetchLog(logPage - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={logPage * 20 >= logTotal} onClick={() => fetchLog(logPage + 1)}>
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
