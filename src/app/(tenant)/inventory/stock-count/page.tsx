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
  const { activeBranch, activeProfile } = useAuthStore()
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
    if (!activeBranch || !activeProfile) return
    setCreating(true)
    const res = await fetch('/api/inventory/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: activeProfile.business_id,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock Counts</h1>
          <p className="text-sm text-gray-500">{counts.length} sessions</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> New Count
        </Button>
      </div>

      <div className="divide-y rounded-xl border border-gray-200 bg-white">
        {loading ? (
          [1,2,3].map((i) => <div key={i} className="h-16 animate-pulse bg-gray-50 m-2 rounded-lg" />)
        ) : counts.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">No stock counts yet.</p>
          </div>
        ) : (
          counts.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-800">{c.name}</p>
                <p className="text-xs text-gray-400">
                  Started {formatDate(c.created_at)}
                  {c.profiles?.full_name && ` · ${c.profiles.full_name}`}
                  {c.completed_at && ` · Completed ${formatDate(c.completed_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={STATUS_VARIANT[c.status] ?? 'default'}>
                  {c.status.replace('_', ' ')}
                </Badge>
                {c.status === 'in_progress' && (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/inventory/stock-count/${c.id}`)}>
                    Continue
                  </Button>
                )}
                {c.status === 'completed' && (
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/inventory/stock-count/${c.id}`)}>
                    View
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Stock Count" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            A snapshot of current inventory quantities will be taken. You can then enter actual counted quantities and apply adjustments.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Count Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Stock Count ${new Date().toLocaleDateString()}`}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
            />
          </div>
          <Button className="w-full" onClick={createCount} loading={creating}>
            Start Count
          </Button>
        </div>
      </Modal>
    </div>
  )
}
