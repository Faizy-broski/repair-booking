'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { addDays, format, startOfWeek, isSameDay } from 'date-fns'

interface AppointmentRow {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  customers?: { first_name: string; last_name: string | null } | null
  employees?: { first_name: string; last_name: string | null } | null
}

interface CustomerOption { id: string; first_name: string; last_name: string | null }
interface EmployeeOption { id: string; first_name: string; last_name: string | null; role: string | null }

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  scheduled: 'default',
  confirmed: 'success',
  completed: 'success',
  cancelled: 'destructive',
  no_show: 'warning',
}

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  customer_id: z.string().uuid().optional().or(z.literal('')),
  employee_id: z.string().uuid().optional().or(z.literal('')),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const DEFAULT_HOURS = Array.from({ length: 15 }, (_, i) => i + 7) // 7am - 9pm

export default function AppointmentsPage() {
  const { activeBranch } = useAuthStore()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRow | null>(null)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      start_time: format(new Date(), "yyyy-MM-dd") + 'T09:00',
      end_time: format(new Date(), "yyyy-MM-dd") + 'T09:30',
    },
  })

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, formState: { errors: editErrors, isSubmitting: isEditSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const queryClient = useQueryClient()

  const { data, isLoading: loading } = useQuery({
    queryKey: ['appointments-data', activeBranch?.id, format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const from = format(weekStart, 'yyyy-MM-dd')
      const to = format(addDays(weekStart, 6), 'yyyy-MM-dd')
      const [apptRes, custRes, empRes] = await Promise.all([
        fetch(`/api/appointments?branch_id=${activeBranch!.id}&from=${from}&to=${to}`),
        fetch(`/api/customers?branch_id=${activeBranch!.id}&limit=100`),
        fetch(`/api/employees?branch_id=${activeBranch!.id}&limit=200`),
      ])
      const [apptJson, custJson, empJson] = await Promise.all([apptRes.json(), custRes.json(), empRes.json()])
      return {
        appointments: (apptJson.data ?? []) as AppointmentRow[],
        customers: (custJson.data ?? []) as CustomerOption[],
        employees: (empJson.data ?? []) as EmployeeOption[],
      }
    },
    enabled: !!activeBranch,
  })

  const appointments = data?.appointments ?? []
  const customers = data?.customers ?? []
  const employees = data?.employees ?? []

  async function onCreate(data: FormData) {
    if (!activeBranch) return
    const payload = {
      ...data,
      branch_id: activeBranch.id,
      customer_id: data.customer_id || null,
      employee_id: data.employee_id || null,
    }
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) { reset(); setSheetOpen(false); queryClient.invalidateQueries({ queryKey: ['appointments-data'] }) }
    else {
      const json = await res.json().catch(() => null)
      setCreateError(json?.error?.message ?? 'Failed to create appointment.')
    }
  }

  function openEdit(appt: AppointmentRow) {
    setEditingAppointment(appt)
    resetEdit({
      title: appt.title,
      customer_id: '',
      employee_id: '',
      start_time: appt.start_time.slice(0, 16),
      end_time: appt.end_time.slice(0, 16),
    })
    setEditError(null)
    setEditSheetOpen(true)
  }

  async function onEdit(data: FormData) {
    if (!editingAppointment || !activeBranch) return
    const res = await fetch(`/api/appointments/${editingAppointment.id}?branch_id=${activeBranch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        customer_id: data.customer_id || null,
        employee_id: data.employee_id || null,
      }),
    })
    if (res.ok) {
      setEditSheetOpen(false)
      setEditingAppointment(null)
      queryClient.invalidateQueries({ queryKey: ['appointments-data'] })
    } else {
      const json = await res.json().catch(() => null)
      setEditError(json?.error?.message ?? 'Failed to update appointment.')
    }
  }

  async function onDelete(id: string) {
    if (!activeBranch) return
    setDeletingId(id)
    const res = await fetch(`/api/appointments/${id}?branch_id=${activeBranch.id}`, { method: 'DELETE' })
    setDeletingId(null)
    setConfirmDeleteId(null)
    if (res.ok) queryClient.invalidateQueries({ queryKey: ['appointments-data'] })
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Build dynamic hour range: include default business hours plus any hours that have appointments
  const hours = (() => {
    const apptHours = appointments.map((a) => parseInt(a.start_time.slice(11, 13), 10))
    const minHour = Math.min(DEFAULT_HOURS[0], ...apptHours)
    const maxHour = Math.max(DEFAULT_HOURS[DEFAULT_HOURS.length - 1], ...apptHours)
    return Array.from({ length: maxHour - minHour + 1 }, (_, i) => i + minHour)
  })()

  // Parse date/hour directly from ISO string to avoid timezone conversion issues.
  // datetime-local sends local wall-clock time; Supabase stores it with +00:00
  // offset, so we extract the literal date/hour to match what the user entered.
  const getAppointmentsForDayHour = (day: Date, hour: number) =>
    appointments.filter((a) => {
      const datePart = a.start_time.slice(0, 10)   // "2026-04-01"
      const hourPart = parseInt(a.start_time.slice(11, 13), 10) // 9
      return datePart === format(day, 'yyyy-MM-dd') && hourPart === hour
    })

  const isWeekend = (day: Date) => { const d = day.getDay(); return d === 0 || d === 6 }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Appointments</h1>
          <p className="mt-0.5 text-sm text-gray-400 font-medium">
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              className="px-3 py-2 hover:bg-gray-50 text-gray-500 hover:text-gray-700 border-r border-gray-200 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-r border-gray-200 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              className="px-3 py-2 hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={() => setSheetOpen(true)} className="shadow-sm">
            <Plus className="h-4 w-4" /> Add Appointment
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Day headers */}
        <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: '4.5rem repeat(7, 1fr)' }}>
          <div className="border-r border-gray-200" />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, new Date())
            const weekend = isWeekend(day)
            return (
              <div
                key={day.toISOString()}
                className={`border-r border-gray-200 last:border-r-0 px-3 py-4 text-center ${weekend ? 'bg-gray-50/80' : ''}`}
              >
                <p className={`text-[11px] font-semibold uppercase tracking-widest ${isToday ? 'text-teal-600' : 'text-gray-400'}`}>
                  {format(day, 'EEE')}
                </p>
                <div className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  isToday ? 'bg-teal-600 text-white shadow-md shadow-teal-200' : 'text-gray-700'
                }`}>
                  {format(day, 'd')}
                </div>
              </div>
            )
          })}
        </div>

        {/* Hour rows */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 15rem)' }}>
          {loading ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-gray-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading…
            </div>
          ) : (
            hours.map((hour, idx) => (
              <div
                key={hour}
                className={`grid border-b border-gray-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                style={{ gridTemplateColumns: '4.5rem repeat(7, 1fr)', minHeight: '4.5rem' }}
              >
                {/* Time label */}
                <div className="border-r border-gray-200 flex items-start justify-end pr-3 pt-2">
                  <span className="text-[11px] font-medium text-gray-400">
                    {format(new Date().setHours(hour, 0, 0), 'h a')}
                  </span>
                </div>

                {weekDays.map((day) => {
                  const isToday = isSameDay(day, new Date())
                  const weekend = isWeekend(day)
                  const dayAppts = getAppointmentsForDayHour(day, hour)
                  return (
                    <div
                      key={day.toISOString()}
                      className={`border-r border-gray-100 last:border-r-0 p-1.5 ${
                        isToday ? 'bg-teal-50/30' : weekend ? 'bg-gray-50/60' : ''
                      }`}
                    >
                      {dayAppts.map((a) => (
                        <div
                          key={a.id}
                          className="group relative mb-1.5 last:mb-0 rounded-lg border-l-[3px] border-teal-500 bg-teal-50 px-2 py-1.5 text-xs shadow-sm hover:shadow-md hover:bg-teal-100/80 transition-all cursor-default"
                        >
                          <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5 bg-white rounded-md shadow-sm border border-gray-100 p-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(a) }}
                              className="rounded p-0.5 hover:bg-teal-50 text-teal-600"
                              title="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(a.id) }}
                              className="rounded p-0.5 hover:bg-red-50 text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="font-semibold text-teal-900 truncate pr-12 leading-tight">{a.title}</p>
                          {a.customers && (
                            <p className="text-teal-600 truncate text-[11px] mt-0.5">
                              {a.customers.first_name} {a.customers.last_name ?? ''}
                            </p>
                          )}
                          <div className="mt-1">
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              a.status === 'confirmed' || a.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : a.status === 'cancelled'
                                ? 'bg-red-100 text-red-600'
                                : a.status === 'no_show'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-teal-100 text-teal-700'
                            }`}>
                              {a.status}
                            </span>
                          </div>
                          {confirmDeleteId === a.id && (
                            <div className="mt-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-red-500 text-[10px] font-medium">Delete?</span>
                              <button
                                onClick={() => onDelete(a.id)}
                                disabled={deletingId === a.id}
                                className="rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
                              >
                                {deletingId === a.id ? '…' : 'Yes'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-200"
                              >
                                No
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <InlineFormSheet open={editSheetOpen} onClose={() => { setEditSheetOpen(false); setEditError(null) }} title="Edit Appointment">
        <form onSubmit={handleSubmitEdit(onEdit)} className="space-y-4">
          {editError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>
          )}
          <Input label="Title" placeholder="Repair Consultation" required error={editErrors.title?.message} {...registerEdit('title')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Customer (optional)</label>
            <select
              {...registerEdit('customer_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">No customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Assigned To (optional)</label>
            <select
              {...registerEdit('employee_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name ?? ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Time" type="datetime-local" required error={editErrors.start_time?.message} {...registerEdit('start_time')} />
            <Input label="End Time" type="datetime-local" required error={editErrors.end_time?.message} {...registerEdit('end_time')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...registerEdit('notes')} />
          </div>
          <Button type="submit" className="w-full" loading={isEditSubmitting}>Save Changes</Button>
        </form>
      </InlineFormSheet>

      <InlineFormSheet open={sheetOpen} onClose={() => { setSheetOpen(false); setCreateError(null) }} title="Add Appointment">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
          )}
          <Input label="Title" placeholder="Repair Consultation" required error={errors.title?.message} {...register('title')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Customer (optional)</label>
            <select
              {...register('customer_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">No customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Assigned To (optional)</label>
            <select
              {...register('employee_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name ?? ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Time" type="datetime-local" required error={errors.start_time?.message} {...register('start_time')} />
            <Input label="End Time" type="datetime-local" required error={errors.end_time?.message} {...register('end_time')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...register('notes')} />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Add Appointment</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
