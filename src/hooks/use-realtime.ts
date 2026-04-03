'use client'
import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseRealtimeOptions<T> {
  /** Supabase table name */
  table: string
  /** Filter column, e.g. 'branch_id' */
  filterColumn?: string
  /** Filter value */
  filterValue?: string
  /** Called when a row is inserted */
  onInsert?: (payload: T) => void
  /** Called when a row is updated */
  onUpdate?: (payload: T) => void
  /** Called when a row is deleted */
  onDelete?: (payload: { old: T }) => void
}

/**
 * Generic Supabase Realtime subscription hook.
 * Automatically subscribes on mount and unsubscribes on unmount.
 *
 * @example
 * useRealtime<Message>({
 *   table: 'messages',
 *   filterColumn: 'business_id',
 *   filterValue: businessId,
 *   onInsert: (msg) => setMessages(prev => [msg, ...prev]),
 * })
 */
export function useRealtime<T extends Record<string, unknown>>({
  table,
  filterColumn,
  filterValue,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient()
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!filterValue && filterColumn) return

    const supabase = createClient()

    const filter = filterColumn && filterValue
      ? `${filterColumn}=eq.${filterValue}`
      : undefined

    const channel = supabase
      .channel(`realtime:${table}:${filterValue ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter,
        },
        (payload) => onInsert?.(payload.new as T)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table,
          filter,
        },
        (payload) => onUpdate?.(payload.new as T)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table,
          filter,
        },
        (payload) => onDelete?.({ old: payload.old as T })
      )
      .subscribe()

    channelRef.current = channel

    return cleanup
  }, [table, filterColumn, filterValue, onInsert, onUpdate, onDelete, cleanup])
}

/**
 * Subscribes to Supabase Realtime broadcast events on a named channel.
 * Used for WebRTC signaling and other non-DB events.
 */
export function useRealtimeBroadcast(
  channelName: string,
  events: Record<string, (payload: unknown) => void>,
  presenceKey?: string
) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!channelName) return

    const supabase = createClient()
    let channel = supabase.channel(channelName)

    Object.entries(events).forEach(([event, handler]) => {
      channel = channel.on('broadcast', { event }, ({ payload }) => handler(payload))
    })

    if (presenceKey) {
      channel.track({ online_at: new Date().toISOString(), key: presenceKey })
    }

    channel.subscribe()
    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [channelName, presenceKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
