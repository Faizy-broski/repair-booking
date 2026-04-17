import { create } from 'zustand'

export interface UnreadPreview {
  id: string
  subject: string | null
  body: string
  from_branch_id: string | null
  from_branch_name: string | null
  created_at: string
}

interface MessageState {
  unreadCount: number
  unreadMessages: UnreadPreview[]
  /** Thread ID that should be auto-opened on the messages page.
   *  Set by the topbar bell dropdown when the user clicks a notification;
   *  cleared by the messages page once it has opened that conversation. */
  pendingThreadId: string | null

  setUnreadCount: (n: number) => void
  setUnreadMessages: (msgs: UnreadPreview[]) => void
  addUnreadMessage: (msg: UnreadPreview) => void
  removeUnreadMessage: (id: string) => void
  increment: () => void
  decrement: () => void
  setPendingThreadId: (id: string | null) => void
}

export const useMessageStore = create<MessageState>((set, get) => ({
  unreadCount: 0,
  unreadMessages: [],
  pendingThreadId: null,

  setUnreadCount:    (n)    => set({ unreadCount: Math.max(0, n) }),
  setUnreadMessages: (msgs) => set({ unreadMessages: msgs }),
  addUnreadMessage:  (msg)  => set({ unreadMessages: [msg, ...get().unreadMessages] }),
  removeUnreadMessage: (id) =>
    set({ unreadMessages: get().unreadMessages.filter((m) => m.id !== id) }),
  increment: () => set({ unreadCount: get().unreadCount + 1 }),
  decrement: () => set({ unreadCount: Math.max(0, get().unreadCount - 1) }),
  setPendingThreadId: (id) => set({ pendingThreadId: id }),
}))
