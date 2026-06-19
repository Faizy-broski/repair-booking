'use client'
// Stock Count feature is temporarily disabled.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function StockCountPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/inventory') }, [router])
  return null
}

/*
===== ORIGINAL STOCK COUNT PAGE — DISABLED =====

'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, CheckCircle2, XCircle, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'

interface CountRow {
  id: string; name: string; status: string
  created_at: string; completed_at: string | null
  profiles?: { full_name: string } | null
}

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'destructive'> = {
  in_progress: 'warning', completed: 'success', cancelled: 'destructive',
}

export default function StockCountPage() {
  const { activeBranch, profile } = useAuthStore()
  const router = useRouter()
  const [counts, setCounts] = useState<CountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const fetchCounts = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const res = await fetch(`/api/inventory/counts?branch_id=${activeBranch.id}`)
    const json = await res.json()
    setCounts(json.data ?? [])
    setLoading(false)
  }, [activeBranch])

  useEffect(() => { fetchCounts() }, [fetchCounts])

  async function createCount() {
    if (!activeBranch || !profile) return
    setCreating(true)
    const res = await fetch('/api/inventory/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: profile.business_id,
        branch_id: activeBranch.id,
        name: newName || `Stock Count ${formatDate(new Date().toISOString())}`,
      }),
    })
    const json = await res.json()
    setModalOpen(false)
    setNewName('')
    setCreating(false)
    if (json.data?.id) router.push(`/inventory/stock-count/${json.data.id}`)
  }

  return ( ... )
}

===== END ORIGINAL =====
*/
