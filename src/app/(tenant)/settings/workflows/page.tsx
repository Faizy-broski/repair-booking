'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, GripVertical, Star, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'

interface WorkflowStep {
  id: string; name: string; description: string | null; required_role: string | null; step_order: number
}
interface Workflow {
  id: string; name: string; is_default: boolean
  ticket_workflow_steps: WorkflowStep[]
}
interface StatusFlag {
  id: string; status: string; message: string
}
interface CannedResponse {
  id: string; title: string; body: string; type: 'note' | 'sms' | 'email'
}

const REPAIR_STATUSES = [
  'received', 'in_progress', 'waiting_parts', 'repaired', 'unrepairable', 'collected',
]

const TYPE_COLOURS: Record<string, string> = {
  note:  'bg-gray-100 text-gray-700',
  sms:   'bg-green-100 text-green-700',
  email: 'bg-blue-100 text-blue-700',
}

type Tab = 'workflows' | 'status_flags' | 'canned'

export default function WorkflowsSettingsPage() {
  const { activeBranch } = useAuthStore()
  const [tab, setTab] = useState<Tab>('workflows')

  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [flags,     setFlags]     = useState<StatusFlag[]>([])
  const [canned,    setCanned]    = useState<CannedResponse[]>([])

  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null)

  // Workflow modal
  const [wfModal, setWfModal] = useState<{ open: boolean; editing: Workflow | null }>({ open: false, editing: null })
  const [wfName, setWfName] = useState('')
  const [wfDefault, setWfDefault] = useState(false)

  // Steps editor (inline)
  const [editingSteps, setEditingSteps] = useState<{ workflowId: string; steps: Array<{ name: string; description: string; required_role: string }> } | null>(null)

  // Status flag modal
  const [flagModal, setFlagModal] = useState<{ open: boolean; status: string; message: string; editId: string | null }>({ open: false, status: '', message: '', editId: null })

  // Canned response modal
  const [cannedModal, setCannedModal] = useState<{ open: boolean; editing: CannedResponse | null }>({ open: false, editing: null })
  const [cannedForm, setCannedForm] = useState({ title: '', body: '', type: 'note' as 'note' | 'sms' | 'email' })

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [wfRes, flagRes, cannedRes] = await Promise.all([
      fetch('/api/workflows'),
      fetch('/api/repairs/status-flags'),
      fetch('/api/canned-responses'),
    ])
    const [wfJson, flagJson, cannedJson] = await Promise.all([wfRes.json(), flagRes.json(), cannedRes.json()])
    setWorkflows(wfJson.data ?? [])
    setFlags(flagJson.data ?? [])
    setCanned(cannedJson.data ?? [])
  }, [])

  useEffect(() => { if (activeBranch) fetchAll() }, [activeBranch, fetchAll])

  // ── Workflow CRUD ──────────────────────────────────────────────────────────

  async function saveWorkflow() {
    const { editing } = wfModal
    const url    = editing ? `/api/workflows/${editing.id}` : '/api/workflows'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wfName, is_default: wfDefault }),
    })
    setWfModal({ open: false, editing: null })
    fetchAll()
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow?')) return
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  async function saveSteps() {
    if (!editingSteps) return
    const steps = editingSteps.steps
      .filter((s) => s.name.trim())
      .map((s, i) => ({ ...s, step_order: i + 1 }))
    await fetch(`/api/workflows/${editingSteps.workflowId}/steps`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps }),
    })
    setEditingSteps(null)
    fetchAll()
  }

  // ── Status flags ───────────────────────────────────────────────────────────

  async function saveFlag() {
    await fetch('/api/repairs/status-flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: flagModal.status, message: flagModal.message }),
    })
    setFlagModal({ open: false, status: '', message: '', editId: null })
    fetchAll()
  }

  async function deleteFlag(id: string) {
    await fetch(`/api/repairs/status-flags/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  // ── Canned responses ───────────────────────────────────────────────────────

  async function saveCanned() {
    const { editing } = cannedModal
    const url    = editing ? `/api/canned-responses/${editing.id}` : '/api/canned-responses'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cannedForm),
    })
    setCannedModal({ open: false, editing: null })
    fetchAll()
  }

  async function deleteCanned(id: string) {
    if (!confirm('Delete this canned response?')) return
    await fetch(`/api/canned-responses/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'workflows',    label: 'Workflows' },
    { key: 'status_flags', label: 'Status Flag Messages' },
    { key: 'canned',       label: 'Canned Responses' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Workflows & Responses</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure repair workflows, status messages, and canned responses.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Workflows ────────────────────────────────────────────────────────── */}
      {tab === 'workflows' && (
        <section className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setWfName(''); setWfDefault(false); setWfModal({ open: true, editing: null }) }}>
              <Plus className="h-4 w-4" /> New Workflow
            </Button>
          </div>

          <div className="space-y-2">
            {workflows.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">No workflows yet.</p>
            )}
            {workflows.map((wf) => (
              <div key={wf.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedWorkflow(expandedWorkflow === wf.id ? null : wf.id)}
                >
                  <div className="flex items-center gap-2">
                    {expandedWorkflow === wf.id
                      ? <ChevronDown className="h-4 w-4 text-gray-400" />
                      : <ChevronRight className="h-4 w-4 text-gray-400" />
                    }
                    <span className="font-medium text-gray-800">{wf.name}</span>
                    {wf.is_default && (
                      <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        <Star className="h-2.5 w-2.5" /> Default
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{wf.ticket_workflow_steps.length} steps</span>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setWfName(wf.name)
                        setWfDefault(wf.is_default)
                        setWfModal({ open: true, editing: wf })
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteWorkflow(wf.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>

                {/* Steps */}
                {expandedWorkflow === wf.id && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                    {editingSteps?.workflowId === wf.id ? (
                      <div className="space-y-2">
                        {editingSteps.steps.map((step, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                            <span className="text-xs w-5 text-gray-400 shrink-0">{idx + 1}.</span>
                            <input
                              value={step.name}
                              onChange={(e) => {
                                const updated = [...editingSteps.steps]
                                updated[idx] = { ...updated[idx], name: e.target.value }
                                setEditingSteps({ ...editingSteps, steps: updated })
                              }}
                              placeholder="Step name"
                              className="h-8 flex-1 rounded-md border border-gray-300 px-2 text-sm"
                            />
                            <input
                              value={step.description}
                              onChange={(e) => {
                                const updated = [...editingSteps.steps]
                                updated[idx] = { ...updated[idx], description: e.target.value }
                                setEditingSteps({ ...editingSteps, steps: updated })
                              }}
                              placeholder="Description (optional)"
                              className="h-8 flex-1 rounded-md border border-gray-300 px-2 text-sm"
                            />
                            <button
                              onClick={() => {
                                const updated = editingSteps.steps.filter((_, i) => i !== idx)
                                setEditingSteps({ ...editingSteps, steps: updated })
                              }}
                              className="text-gray-400 hover:text-red-500 text-sm"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setEditingSteps({
                              ...editingSteps,
                              steps: [...editingSteps.steps, { name: '', description: '', required_role: '' }]
                            })}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            + Add step
                          </button>
                          <Button size="sm" onClick={saveSteps}>Save Steps</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingSteps(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {wf.ticket_workflow_steps.length === 0 && (
                          <p className="text-xs text-gray-400 italic">No steps defined.</p>
                        )}
                        {wf.ticket_workflow_steps.map((step, idx) => (
                          <div key={step.id} className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="h-5 w-5 rounded-full bg-gray-100 text-center text-xs font-medium leading-5 text-gray-500 shrink-0">
                              {idx + 1}
                            </span>
                            <span>{step.name}</span>
                            {step.description && <span className="text-xs text-gray-400">— {step.description}</span>}
                          </div>
                        ))}
                        <button
                          className="mt-2 text-xs text-blue-600 hover:underline"
                          onClick={() =>
                            setEditingSteps({
                              workflowId: wf.id,
                              steps: wf.ticket_workflow_steps.map((s) => ({
                                name: s.name,
                                description: s.description ?? '',
                                required_role: s.required_role ?? '',
                              })),
                            })
                          }
                        >
                          Edit steps
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Status Flags ─────────────────────────────────────────────────────── */}
      {tab === 'status_flags' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500">
            Show a warning message when a technician changes a ticket to a specific status.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setFlagModal({ open: true, status: '', message: '', editId: null })}>
              <Plus className="h-4 w-4" /> Add Flag
            </Button>
          </div>
          <div className="divide-y rounded-xl border border-gray-200 bg-white">
            {flags.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">No status flags configured.</p>
            )}
            {flags.map((f) => (
              <div key={f.id} className="flex items-start justify-between px-4 py-3">
                <div>
                  <Badge variant="warning">{f.status.replace('_', ' ')}</Badge>
                  <p className="mt-1 text-sm text-gray-600">{f.message}</p>
                </div>
                <div className="flex gap-1 shrink-0 ml-4">
                  <Button size="sm" variant="ghost" onClick={() => setFlagModal({ open: true, status: f.status, message: f.message, editId: f.id })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteFlag(f.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Canned Responses ─────────────────────────────────────────────────── */}
      {tab === 'canned' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500">
            Pre-written templates for ticket notes, SMS, and email messages.
          </p>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setCannedForm({ title: '', body: '', type: 'note' })
                setCannedModal({ open: true, editing: null })
              }}
            >
              <Plus className="h-4 w-4" /> New Template
            </Button>
          </div>
          <div className="divide-y rounded-xl border border-gray-200 bg-white">
            {canned.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">No canned responses yet.</p>
            )}
            {canned.map((c) => (
              <div key={c.id} className="flex items-start justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLOURS[c.type]}`}>
                      {c.type}
                    </span>
                    <span className="font-medium text-gray-800 truncate">{c.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400 truncate">{c.body}</p>
                </div>
                <div className="flex gap-1 shrink-0 ml-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCannedForm({ title: c.title, body: c.body, type: c.type })
                      setCannedModal({ open: true, editing: c })
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteCanned(c.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

      {/* Workflow modal */}
      <Modal
        open={wfModal.open}
        onClose={() => setWfModal({ open: false, editing: null })}
        title={wfModal.editing ? 'Edit Workflow' : 'New Workflow'}
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Workflow Name</label>
            <input
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              placeholder="e.g. Standard Repair"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wfDefault} onChange={(e) => setWfDefault(e.target.checked)} className="rounded" />
            Set as default workflow
          </label>
          <Button className="w-full" onClick={saveWorkflow} disabled={!wfName.trim()}>Save</Button>
        </div>
      </Modal>

      {/* Status flag modal */}
      <Modal
        open={flagModal.open}
        onClose={() => setFlagModal({ open: false, status: '', message: '', editId: null })}
        title="Status Flag Message"
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select
              value={flagModal.status}
              onChange={(e) => setFlagModal((f) => ({ ...f, status: e.target.value }))}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="">Select status…</option>
              {REPAIR_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Warning Message</label>
            <textarea
              rows={3}
              value={flagModal.message}
              onChange={(e) => setFlagModal((f) => ({ ...f, message: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. Have you confirmed the customer is aware of the repair cost?"
            />
          </div>
          <Button className="w-full" onClick={saveFlag} disabled={!flagModal.status || !flagModal.message.trim()}>Save</Button>
        </div>
      </Modal>

      {/* Canned response modal */}
      <Modal
        open={cannedModal.open}
        onClose={() => setCannedModal({ open: false, editing: null })}
        title={cannedModal.editing ? 'Edit Template' : 'New Canned Response'}
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input
              value={cannedForm.title}
              onChange={(e) => setCannedForm((f) => ({ ...f, title: e.target.value }))}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
              placeholder="Short descriptive title"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <select
              value={cannedForm.type}
              onChange={(e) => setCannedForm((f) => ({ ...f, type: e.target.value as 'note' | 'sms' | 'email' }))}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="note">Note</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Body</label>
            <textarea
              rows={4}
              value={cannedForm.body}
              onChange={(e) => setCannedForm((f) => ({ ...f, body: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Template text…"
            />
          </div>
          <Button className="w-full" onClick={saveCanned} disabled={!cannedForm.title.trim() || !cannedForm.body.trim()}>Save</Button>
        </div>
      </Modal>
    </div>
  )
}
