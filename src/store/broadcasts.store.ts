import { create } from 'zustand'
import type { SystemBroadcast } from '@/backend/services/broadcast.service'

// ── helpers ──────────────────────────────────────────────────────────────────

function isRelevant(b: SystemBroadcast, businessId: string): boolean {
  if (b.status !== 'active') return false
  if (b.expires_at && new Date(b.expires_at) < new Date()) return false
  return b.target_scope === 'all' || b.target_business_id === businessId
}

function derive(broadcasts: SystemBroadcast[], readIds: Set<string>) {
  const unreadList = broadcasts.filter((b) => !readIds.has(b.id))
  const bannerBroadcast =
    unreadList.find((b) => b.type === 'downtime' || b.type === 'maintenance') ?? null
  return { unreadList, unreadCount: unreadList.length, bannerBroadcast }
}

// ── store ─────────────────────────────────────────────────────────────────────

interface BroadcastsState {
  broadcasts: SystemBroadcast[]
  readIds: Set<string>
  isLoaded: boolean

  // Pre-computed — stable references, safe to use in selectors
  unreadList: SystemBroadcast[]
  unreadCount: number
  bannerBroadcast: SystemBroadcast | null

  setLoaded: (broadcasts: SystemBroadcast[], readIds: string[]) => void
  addBroadcast: (b: SystemBroadcast, businessId: string) => void
  syncBroadcast: (b: SystemBroadcast, businessId: string) => void
  markRead: (id: string) => void
  reset: () => void
}

export const useBroadcastsStore = create<BroadcastsState>((set, get) => ({
  broadcasts: [],
  readIds: new Set(),
  isLoaded: false,
  unreadList: [],
  unreadCount: 0,
  bannerBroadcast: null,

  setLoaded: (broadcasts, readIds) => {
    const ids = new Set(readIds)
    const { unreadList, unreadCount, bannerBroadcast } = derive(broadcasts, ids)
    set({ broadcasts, readIds: ids, isLoaded: true, unreadList, unreadCount, bannerBroadcast })
  },

  addBroadcast: (b, businessId) => {
    if (!isRelevant(b, businessId)) return
    const { broadcasts, readIds } = get()
    if (broadcasts.some((x) => x.id === b.id)) return
    const next = [b, ...broadcasts]
    const { unreadList, unreadCount, bannerBroadcast } = derive(next, readIds)
    set({ broadcasts: next, unreadList, unreadCount, bannerBroadcast })
  },

  syncBroadcast: (b, businessId) => {
    const { broadcasts, readIds } = get()
    let next: SystemBroadcast[]

    if (b.status === 'archived' || !isRelevant(b, businessId)) {
      next = broadcasts.filter((x) => x.id !== b.id)
    } else {
      next = broadcasts.some((x) => x.id === b.id)
        ? broadcasts.map((x) => (x.id === b.id ? b : x))
        : [b, ...broadcasts]
    }

    const { unreadList, unreadCount, bannerBroadcast } = derive(next, readIds)
    set({ broadcasts: next, unreadList, unreadCount, bannerBroadcast })
  },

  markRead: (id) => {
    const { broadcasts, readIds } = get()
    const next = new Set(readIds)
    next.add(id)
    const { unreadList, unreadCount, bannerBroadcast } = derive(broadcasts, next)
    set({ readIds: next, unreadList, unreadCount, bannerBroadcast })
  },

  reset: () =>
    set({
      broadcasts: [],
      readIds: new Set(),
      isLoaded: false,
      unreadList: [],
      unreadCount: 0,
      bannerBroadcast: null,
    }),
}))
