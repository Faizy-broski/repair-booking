'use client'
import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { Badge, REPAIR_STATUS_VARIANTS } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Repair } from '@/types/database'

interface RepairRow extends Repair {
  customers?: { first_name: string; last_name: string | null; phone: string | null } | null
}

interface CustomStatus {
  id: string
  name: string
  color: string
  sort_order: number
}

// ── Draggable card ─────────────────────────────────────────────────────────────
function RepairCard({ repair, isDragOverlay = false }: { repair: RepairRow; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: repair.id })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest p-3 cursor-grab active:cursor-grabbing select-none ${
        isDragging && !isDragOverlay ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-1 relative">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-primary">{repair.job_number}</span>
          {(repair as any).is_rush && (
            <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600">Rush</span>
          )}
        </div>
        {repair.estimated_cost && (
          <span className="text-xs text-on-surface-variant">{formatCurrency(Math.max(0, repair.estimated_cost - ((repair as any).discount_amount || 0)))}</span>
        )}
      </div>
      {repair.customers && (
        <p className="text-xs font-medium text-on-surface truncate">
          {repair.customers.first_name} {repair.customers.last_name ?? ''}
        </p>
      )}
      {(repair.device_type || repair.device_brand || repair.device_model) && (
        <p className="text-xs text-on-surface-variant truncate">
          {[repair.device_type, repair.device_brand, repair.device_model].filter(Boolean).join(' ')}
        </p>
      )}
      {repair.issue && (
        <p className="mt-1 text-xs text-outline line-clamp-2">{repair.issue}</p>
      )}
      {(repair.custom_fields as any)?.due_date && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
          <span className="h-1 w-1 rounded-full bg-primary" />
          Due: {formatDate((repair.custom_fields as any).due_date)}
        </div>
      )}
    </div>
  )
}

// ── Droppable column ───────────────────────────────────────────────────────────
function KanbanColumn({
  status,
  repairs,
}: {
  status: { id: string; label: string; hexColor: string }
  repairs: RepairRow[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <div className="flex w-60 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between rounded-xl bg-surface-container-low px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-on-surface">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.hexColor }} />
          {status.label}
        </span>
        <span className="rounded-full bg-surface-container-lowest px-2 py-0.5 text-xs font-medium text-on-surface-variant">
          {repairs.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[200px] flex-1 flex-col gap-2 rounded-2xl bg-surface-container-low/50 p-2 transition-colors ${
          isOver ? 'ring-2 ring-primary/30 ring-inset' : ''
        }`}
      >
        {repairs.map((r) => (
          <RepairCard key={r.id} repair={r} />
        ))}
      </div>
    </div>
  )
}

// Hex colours for the built-in statuses
const BUILTIN_STATUSES: { id: string; label: string; hexColor: string }[] = [
  { id: 'received',      label: 'Received',      hexColor: '#9ca3af' },
  { id: 'in_progress',   label: 'In Progress',   hexColor: '#3b82f6' },
  { id: 'waiting_parts', label: 'Waiting Parts', hexColor: '#f59e0b' },
  { id: 'repaired',      label: 'Repaired',      hexColor: '#22c55e' },
  { id: 'unrepairable',  label: 'Unrepairable',  hexColor: '#ef4444' },
  { id: 'collected',     label: 'Collected',     hexColor: '#a855f7' },
]

// ── Main board ─────────────────────────────────────────────────────────────────
interface KanbanBoardProps {
  repairs: RepairRow[]
  onStatusChange: (repairId: string, newStatus: string) => void
  customStatuses?: CustomStatus[]
}

export function KanbanBoard({ repairs, onStatusChange, customStatuses = [] }: KanbanBoardProps) {
  const [activeRepair, setActiveRepair] = useState<RepairRow | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Build the ordered column list: built-ins first, then custom statuses sorted by sort_order
  const statuses = [
    ...BUILTIN_STATUSES,
    ...[...customStatuses]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((cs) => ({ id: cs.name, label: cs.name, hexColor: cs.color })),
  ]

  const grouped = useCallback(
    (statusId: string) => repairs.filter((r) => r.status === statusId),
    [repairs]
  )

  function handleDragStart(event: DragStartEvent) {
    const r = repairs.find((r) => r.id === event.active.id)
    setActiveRepair(r ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveRepair(null)
    if (!over) return
    const newStatus = over.id as string
    const repair = repairs.find((r) => r.id === active.id)
    if (!repair || repair.status === newStatus) return
    if (statuses.some((s) => s.id === newStatus)) {
      onStatusChange(repair.id, newStatus)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {statuses.map((status) => (
          <KanbanColumn key={status.id} status={status} repairs={grouped(status.id)} />
        ))}
      </div>
      <DragOverlay>
        {activeRepair && <RepairCard repair={activeRepair} isDragOverlay />}
      </DragOverlay>
    </DndContext>
  )
}
