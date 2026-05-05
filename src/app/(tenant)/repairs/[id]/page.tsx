'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Edit, Clock, ClipboardList, Receipt, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils'
import { RepairEmailPrompt } from '@/components/repairs/email-prompt-modal'
import { ConditionChecklist } from '@/components/repairs/condition-checklist'
import { LabelPicker } from '@/components/repairs/label-picker'
import { EstimatesPanel } from '@/components/repairs/estimates-panel'
import { CustomFieldRenderer, useCustomFieldDefs } from '@/components/shared/custom-field-renderer'
import { PatternLock } from '@/components/ui/pattern-lock'


interface Technician {
  id: string
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
  lock_type: string | null
  passcode: string | null
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
  custom_fields: Record<string, any> | null
}

export default function RepairDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()

  // ── UI-only state ─────────────────────────────────────────────────────────────
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [updating, setUpdating] = useState(false)
  const [emailPrompt, setEmailPrompt] = useState<{ repairId: string; jobNumber: string } | null>(null)
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [showCannedPicker, setShowCannedPicker] = useState(false)
  const [assigningTech, setAssigningTech] = useState(false)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({})

  // ── Main repair data ──────────────────────────────────────────────────────────
  const { data: repair, isLoading: loading } = useQuery<RepairDetail | null>({
    queryKey: ['repair-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/repairs/${id}`)
      const j = await res.json()
      return j.data ?? null
    },
    enabled: !!id,
  })

  // Sync derived local state once when this repair first loads
  useEffect(() => {
    if (repair) {
      setNewStatus(repair.status)
      setLabelIds(repair.label_ids ?? [])
      setCustomFieldValues((repair.custom_fields as Record<string, unknown>) ?? {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repair?.id])

  // ── Custom statuses — reuses the same cache as the repairs list page ──────────
  // If the user navigated here from the list, this is already populated (0 requests).
  const { data: metaData } = useQuery({
    queryKey: ['repairs-meta', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/repairs/meta?branch_id=${activeBranch!.id}`)
      const j = await res.json()
      return j.data || { customStatuses: [], faults: [], employees: [] }
    },
    enabled: !!activeBranch,
    staleTime: Infinity,
  })
  const customStatuses = (metaData?.customStatuses ?? []) as { name: string; color: string }[]

  // ── Employees — shared cache key with the repairs list page ──────────────────
  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ['employees', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/employees?branch_id=${activeBranch!.id}&limit=100`)
      const j = await res.json()
      return j.data ?? []
    },
    enabled: !!activeBranch,
    staleTime: Infinity,
  })

  // ── Canned responses — warm cache, shared across pages ───────────────────────
  const { data: cannedResponses = [] } = useQuery<{ id: string; title: string; body: string }[]>({
    queryKey: ['canned-responses', 'note'],
    queryFn: async () => {
      const res = await fetch('/api/canned-responses?type=note')
      const j = await res.json()
      return j.data ?? []
    },
    staleTime: Infinity,
  })

  // ── Custom field defs — deferred until repair loads so device_type is known ──
  // Passing enabled=!!repair prevents the initial "no category" fetch that fires
  // before the repair data arrives, which was causing a double request.
  const repairCategory = repair?.device_type ?? null
  const { defs: customFieldDefs } = useCustomFieldDefs('repairs', repairCategory, !!repair)

  // ── Mutations ─────────────────────────────────────────────────────────────────
  async function saveCustomFields(values: Record<string, unknown>) {
    await fetch(`/api/repairs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_fields: values }),
    })
    setCustomFieldValues(values)
  }

  async function assignTechnician(employeeId: string | null) {
    setAssigningTech(true)
    const res = await fetch(`/api/repairs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: employeeId }),
    })
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['repair-detail', id] })
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
      // Invalidate cache — React Query refetches automatically, no manual re-fetch needed
      queryClient.invalidateQueries({ queryKey: ['repair-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['repairs'] })
      if (repair.notify_customer && repair.customers?.email) {
        setEmailPrompt({ repairId: id, jobNumber: repair.job_number })
      }
    }
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
            <div className="h-3.5 w-28 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="h-7 w-24 animate-pulse rounded-full bg-gray-200" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading repair details…</span>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
        <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
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
        {(() => {
          const sc = customStatuses.find((cs) => cs.name === repair.status)
          return (
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: sc?.color ?? '#9ca3af' }}
            >
              {repair.status}
            </span>
          )
        })()}
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
            <InfoRow label="Serial / IMEI" value={repair.serial_number || (repair.custom_fields?.imei as string)} />
            <InfoRow label="Issue" value={repair.issue} />
            {repair.diagnosis && <InfoRow label="Diagnosis" value={repair.diagnosis} />}
            {repair.lock_type === 'passcode' && <InfoRow label="Passcode" value={repair.passcode} />}
            {repair.lock_type === 'pattern' && repair.passcode && (
              <div className="flex gap-2">
                <span className="w-28 shrink-0 text-gray-400">Pattern</span>
                <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden pointer-events-none w-fit">
                  <PatternLock value={repair.passcode} size={150} readOnly />
                </div>
              </div>
            )}
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
            <InfoRow label="Due Date" value={repair.custom_fields?.due_date ? formatDate(repair.custom_fields.due_date) : null} />
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

        {/* Notes */}
        {(repair.custom_fields?.customer_note || repair.custom_fields?.staff_note) && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {repair.custom_fields?.customer_note && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Customer Note (Public)</label>
                  <p className="mt-1 rounded-lg border border-blue-100 bg-blue-50/50 p-2 text-gray-900">{repair.custom_fields.customer_note}</p>
                </div>
              )}
              {repair.custom_fields?.staff_note && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Staff Note (Internal)</label>
                  <p className="mt-1 rounded-lg border border-amber-100 bg-amber-50/50 p-2 text-gray-900">{repair.custom_fields.staff_note}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Custom Fields */}
      {customFieldDefs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Additional Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <CustomFieldRenderer
                values={customFieldValues}
                definitions={customFieldDefs}
                onSave={saveCustomFields}
              />
            </div>
          </CardContent>
        </Card>
      )}

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
                    {(() => {
                      const sc = customStatuses.find((cs) => cs.name === h.new_status)
                      return (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                          style={{ backgroundColor: sc?.color ?? '#9ca3af' }}
                        >
                          {h.new_status}
                        </span>
                      )
                    })()}
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
            options={customStatuses.map((cs) => ({ value: cs.name, label: cs.name }))}
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
