'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Clock, ClipboardList, Receipt, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, REPAIR_STATUS_VARIANTS } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { REPAIR_STATUSES } from '@/backend/config/constants'
import { RepairEmailPrompt } from '@/components/repairs/email-prompt-modal'
import { ConditionChecklist } from '@/components/repairs/condition-checklist'
import { LabelPicker } from '@/components/repairs/label-picker'
import { EstimatesPanel } from '@/components/repairs/estimates-panel'

const STATUS_OPTIONS = REPAIR_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))

interface Technician {
  id: string
  profile_id: string | null
  first_name: string
  last_name: string | null
  role: string | null
}

interface RepairDetail {
  id: string
  job_number: string
  branch_id: string
  customer_id: string | null
  status: string
  device_type: string | null
  device_brand: string | null
  device_model: string | null
  serial_number: string | null
  issue: string
  diagnosis: string | null
  estimated_cost: number | null
  actual_cost: number | null
  deposit_paid: number
  notify_customer: boolean
  created_at: string
  collected_at: string | null
  label_ids: string[]
  assigned_to: string | null
  customers: { first_name: string; last_name: string | null; email: string | null; phone: string | null } | null
  employees: { id: string; first_name: string; last_name: string | null } | null
  repair_items: {
    id: string
    name: string
    quantity: number
    unit_price: number
    warranty_days: number
    warranty_starts_at: string | null
  }[]
  repair_status_history: {
    id: string
    new_status: string
    old_status: string | null
    note: string | null
    email_sent: boolean
    created_at: string
    profiles: { full_name: string | null } | null
  }[]
}

export default function RepairDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { activeBranch } = useAuthStore()
  const [repair, setRepair] = useState<RepairDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [updating, setUpdating] = useState(false)
  const [emailPrompt, setEmailPrompt] = useState<{ repairId: string; jobNumber: string } | null>(null)
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [cannedResponses, setCannedResponses] = useState<Array<{ id: string; title: string; body: string }>>([])
  const [showCannedPicker, setShowCannedPicker] = useState(false)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [assigningTech, setAssigningTech] = useState(false)

  useEffect(() => {
    async function fetchRepair() {
      setLoading(true)
      const [repairRes, cannedRes, staffRes] = await Promise.all([
        fetch(`/api/repairs/${id}`),
        fetch('/api/canned-responses?type=note'),
        fetch(`/api/employees?branch_id=${activeBranch?.id ?? ''}&limit=100`),
      ])
      const [repairJson, cannedJson, staffJson] = await Promise.all([
        repairRes.json(), cannedRes.json(), staffRes.json(),
      ])
      setRepair(repairJson.data)
      if (repairJson.data) {
        setNewStatus(repairJson.data.status)
        setLabelIds(repairJson.data.label_ids ?? [])
      }
      setCannedResponses(cannedJson.data ?? [])
      setTechnicians(staffJson.data ?? [])
      setLoading(false)
    }
    fetchRepair()
  }, [id, activeBranch?.id])

  async function assignTechnician(employeeId: string | null) {
    setAssigningTech(true)
    const res = await fetch(`/api/repairs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: employeeId }),
    })
    if (res.ok) {
      const matched = technicians.find((t) => t.id === employeeId) ?? null
      setRepair((prev) => prev ? {
        ...prev,
        assigned_to: employeeId,
        employees: matched ? { id: matched.id, first_name: matched.first_name, last_name: matched.last_name ?? null } : null,
      } : prev)
    }
    setAssigningTech(false)
  }

  async function updateStatus() {
    if (!repair) return
    setUpdating(true)
    const res = await fetch(`/api/repairs/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, note: statusNote }),
    })
    if (res.ok) {
      setStatusModalOpen(false)
      setStatusNote('')
      // Reload repair
      const updated = await fetch(`/api/repairs/${id}`)
      const json = await updated.json()
      setRepair(json.data)
      // Show email prompt if customer has email and notifications enabled
      if (repair.notify_customer && repair.customers?.email) {
        setEmailPrompt({ repairId: id, jobNumber: repair.job_number })
      }
    }
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />)}
      </div>
    )
  }

  if (!repair) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p>Repair not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>Go back</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Job #{repair.job_number}</h1>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <p className="text-sm text-gray-500">{formatDateTime(repair.created_at)}</p>
            <LabelPicker repairId={repair.id} selectedIds={labelIds} onChange={setLabelIds} />
          </div>
        </div>
        <Badge variant={REPAIR_STATUS_VARIANTS[repair.status]}>
          {repair.status.replace('_', ' ')}
        </Badge>
        <Button onClick={() => setStatusModalOpen(true)}>
          <Edit className="h-4 w-4" />
          Update Status
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Device info */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Device</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Type" value={repair.device_type} />
            <InfoRow label="Brand" value={repair.device_brand} />
            <InfoRow label="Model" value={repair.device_model} />
            <InfoRow label="Serial" value={repair.serial_number} />
            <InfoRow label="Issue" value={repair.issue} />
            {repair.diagnosis && <InfoRow label="Diagnosis" value={repair.diagnosis} />}
          </CardContent>
        </Card>

        {/* Customer & Financial */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Customer & Financials</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {repair.customers && (
              <>
                <InfoRow label="Name" value={`${repair.customers.first_name} ${repair.customers.last_name ?? ''}`} />
                <InfoRow label="Email" value={repair.customers.email} />
                <InfoRow label="Phone" value={repair.customers.phone} />
              </>
            )}
            <hr className="border-gray-100" />
            <InfoRow label="Estimated" value={repair.estimated_cost ? formatCurrency(repair.estimated_cost) : null} />
            <InfoRow label="Actual cost" value={repair.actual_cost ? formatCurrency(repair.actual_cost) : null} />
            <InfoRow label="Deposit paid" value={formatCurrency(repair.deposit_paid)} />
            <div className="flex items-center justify-between py-0.5">
              <span className="text-gray-500">Assigned Technician</span>
              <div className="flex items-center gap-2">
                {assigningTech && <span className="text-xs text-gray-400">Saving…</span>}
                <select
                  value={repair.assigned_to ?? ''}
                  onChange={(e) => assignTechnician(e.target.value || null)}
                  disabled={assigningTech}
                  className="h-7 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="">— Unassigned —</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name ?? ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Parts used */}
      {repair.repair_items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Parts / Services Used</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="py-1 text-left">Item</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {repair.repair_items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="py-1.5">{item.name}</td>
                    <td className="py-1.5 text-right">{item.quantity}</td>
                    <td className="py-1.5 text-right">{formatCurrency(item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Status history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            Status History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {repair.repair_status_history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 text-sm">
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={REPAIR_STATUS_VARIANTS[h.new_status]} className="text-xs">
                      {h.new_status.replace('_', ' ')}
                    </Badge>
                    {h.email_sent && <span className="text-xs text-green-600">Email sent</span>}
                  </div>
                  {h.note && <p className="mt-0.5 text-gray-500">{h.note}</p>}
                  <p className="text-xs text-gray-400">
                    {formatDateTime(h.created_at)}
                    {h.profiles?.full_name && ` · ${h.profiles.full_name}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Parts warranty display */}
      {repair.repair_items.some((i) => i.warranty_days > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Receipt className="h-4 w-4" />
              Warranty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {repair.repair_items
                .filter((i) => i.warranty_days > 0)
                .map((item) => {
                  let daysLeft: number | null = null
                  if (item.warranty_starts_at) {
                    const started = new Date(item.warranty_starts_at)
                    const expires = new Date(started.getTime() + item.warranty_days * 86400000)
                    daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86400000)
                  }
                  return (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="text-gray-700">{item.name}</span>
                      <span className={`text-xs font-medium ${
                        daysLeft === null ? 'text-gray-400' :
                        daysLeft > 30 ? 'text-green-600' :
                        daysLeft > 0 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {daysLeft === null
                          ? `${item.warranty_days}d (starts on collection)`
                          : daysLeft > 0
                          ? `${daysLeft}d remaining`
                          : 'Expired'}
                      </span>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre/Post Condition Checklists */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4" />
            Condition Checklists
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ConditionChecklist repairId={repair.id} stage="pre" title="Pre-repair Condition" />
          <ConditionChecklist repairId={repair.id} stage="post" title="Post-repair Condition" />
        </CardContent>
      </Card>

      {/* Estimates */}
      {repair.customers && repair.customer_id && (
        <Card>
          <CardContent className="pt-4">
            <EstimatesPanel
              repairId={repair.id}
              customerId={repair.customer_id}
              branchId={repair.branch_id}
            />
          </CardContent>
        </Card>
      )}

      {/* Update status modal */}
      <Modal open={statusModalOpen} onClose={() => setStatusModalOpen(false)} title="Update Status" size="sm">
        <div className="space-y-4">
          <Select
            options={STATUS_OPTIONS}
            value={newStatus}
            onValueChange={setNewStatus}
            placeholder="Select status"
          />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Note (optional)</label>
              {cannedResponses.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCannedPicker((v) => !v)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <BookOpen className="h-3 w-3" /> Use template
                  </button>
                  {showCannedPicker && (
                    <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
                      {cannedResponses.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                          onClick={() => {
                            setStatusNote(c.body)
                            setShowCannedPicker(false)
                          }}
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <textarea
              rows={3}
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="Describe the update..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Button className="w-full" loading={updating} onClick={updateStatus}>
            Save Status
          </Button>
        </div>
      </Modal>

      {/* Non-blocking email prompt */}
      {emailPrompt && (
        <RepairEmailPrompt
          repairId={emailPrompt.repairId}
          jobNumber={emailPrompt.jobNumber}
          onClose={() => setEmailPrompt(null)}
        />
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-gray-400">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  )
}
