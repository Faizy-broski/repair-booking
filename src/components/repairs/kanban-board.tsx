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
import { formatCurrency } from '@/lib/utils'
import type { Repair } from '@/types/database'

interface RepairRow extends Repair {
  customers?: { first_name: string; last_name: string | null; phone: string | null } | null
}

const STATUSES = [
  { id: 'received',      label: 'Received',       color: 'bg-gray-100 border-gray-300' },
  { id: 'in_progress',   label: 'In Progress',     color: 'bg-blue-50 border-blue-200' },
  { id: 'waiting_parts', label: 'Waiting Parts',   color: 'bg-yellow-50 border-yellow-200' },
  { id: 'repaired',      label: 'Repaired',        color: 'bg-green-50 border-green-200' },
  { id: 'unrepairable',  label: 'Unrepairable',    color: 'bg-red-50 border-red-200' },
  { id: 'collected',     label: 'Collected',       color: 'bg-purple-50 border-purple-200' },
]

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
      className={`rounded-lg border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing select-none ${
        isDragging && !isDragOverlay ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-mono text-xs font-semibold text-blue-600">{repair.job_number}</span>
        {repair.estimated_cost && (
          <span className="text-xs text-gray-500">{formatCurrency(repair.estimated_cost)}</span>
        )}
      </div>
      {repair.customers && (
        <p className="text-xs font-medium text-gray-800 truncate">
          {repair.customers.first_name} {repair.customers.last_name ?? ''}
        </p>
      )}
      {(repair.device_brand || repair.device_model) && (
        <p className="text-xs text-gray-500 truncate">
          {[repair.device_brand, repair.device_model].filter(Boolean).join(' ')}
        </p>
      )}
      {repair.issue && (
        <p className="mt-1 text-xs text-gray-400 line-clamp-2">{repair.issue}</p>
      )}
    </div>
  )
}

// ── Droppable column ───────────────────────────────────────────────────────────
function KanbanColumn({
  status,
  repairs,
}: {
  status: (typeof STATUSES)[number]
  repairs: RepairRow[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <div className="flex w-60 shrink-0 flex-col">
      <div className={`mb-2 flex items-center justify-between rounded-t-lg border px-3 py-2 ${status.color}`}>
        <span className="text-xs font-semibold text-gray-700">{status.label}</span>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-600">
          {repairs.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[200px] flex-1 flex-col gap-2 rounded-b-lg border border-t-0 p-2 transition-colors ${
          status.color
        } ${isOver ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
      >
        {repairs.map((r) => (
          <RepairCard key={r.id} repair={r} />
        ))}
      </div>
    </div>
  )
}

// ── Main board ─────────────────────────────────────────────────────────────────
interface KanbanBoardProps {
  repairs: RepairRow[]
  onStatusChange: (repairId: string, newStatus: string) => void
}

export function KanbanBoard({ repairs, onStatusChange }: KanbanBoardProps) {
  const [activeRepair, setActiveRepair] = useState<RepairRow | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

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
    if (STATUSES.some((s) => s.id === newStatus)) {
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
        {STATUSES.map((status) => (
          <KanbanColumn key={status.id} status={status} repairs={grouped(status.id)} />
        ))}
      </div>
      <DragOverlay>
        {activeRepair && <RepairCard repair={activeRepair} isDragOverlay />}
      </DragOverlay>
    </DndContext>
  )
}
