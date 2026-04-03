import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
  duration?: number
  createdAt: number
}

interface NotificationState {
  notifications: Notification[]
  add: (notification: Omit<Notification, 'id' | 'createdAt'>) => string
  remove: (id: string) => void
  clear: () => void
}

let notifCounter = 0

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  add: (notification) => {
    const id = `notif-${++notifCounter}`
    const notif: Notification = { ...notification, id, createdAt: Date.now() }
    set({ notifications: [...get().notifications, notif] })

    // Auto-remove after duration
    const duration = notification.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => get().remove(id), duration)
    }

    return id
  },

  remove: (id) => set({ notifications: get().notifications.filter((n) => n.id !== id) }),
  clear: () => set({ notifications: [] }),
}))
