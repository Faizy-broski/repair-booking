'use client'
import { useNotificationStore } from '@/store/notification.store'
import { X, Info, CheckCircle, AlertTriangle, XCircle, MessageSquare } from 'lucide-react'

const ICONS = {
  info:    <MessageSquare className="h-4 w-4" />,
  success: <CheckCircle   className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error:   <XCircle       className="h-4 w-4" />,
}

const STYLES = {
  info:    'bg-primary text-on-primary border-primary/20',
  success: 'bg-[#1b8c4e] text-white border-green-700/20',
  warning: 'bg-[#b36a00] text-white border-yellow-700/20',
  error:   'bg-error text-on-error border-error/20',
}

export function NotificationToasts() {
  const { notifications, remove } = useNotificationStore()

  if (notifications.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {notifications.map((n) => (
        <div
          key={n.id}
          className={[
            'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg',
            'min-w-[280px] max-w-[360px] animate-in slide-in-from-right-4 fade-in duration-200',
            STYLES[n.type],
          ].join(' ')}
        >
          <span className="mt-0.5 shrink-0 opacity-90">{ICONS[n.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">{n.title}</p>
            {n.message && (
              <p className="mt-0.5 text-xs opacity-80 truncate">{n.message}</p>
            )}
            {n.action && (
              <button
                onClick={n.action.onClick}
                className="mt-1.5 text-xs font-medium underline underline-offset-2 opacity-90 hover:opacity-100"
              >
                {n.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => remove(n.id)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
