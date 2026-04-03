'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatDateTime } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { addDays, format, startOfWeek, isSameDay, parseISO } from 'date-fns'

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
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      start_time: format(new Date(), "yyyy-MM-dd") + 'T09:00',
      end_time: format(new Date(), "yyyy-MM-dd") + 'T09:30',
    },
  })

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const from = format(weekStart, 'yyyy-MM-dd')
    const to = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const [apptRes, custRes, empRes] = await Promise.all([
      fetch(`/api/appointments?branch_id=${activeBranch.id}&from=${from}&to=${to}`),
      fetch(`/api/customers?branch_id=${activeBranch.id}&limit=100`),
      fetch(`/api/employees?branch_id=${activeBranch.id}&limit=200`),
    ])
    const [apptJson, custJson, empJson] = await Promise.all([apptRes.json(), custRes.json(), empRes.json()])
    setAppointments(apptJson.data ?? [])
    setCustomers(custJson.data ?? [])
    setEmployees(empJson.data ?? [])
    setLoading(false)
  }, [activeBranch, weekStart])

  useEffect(() => { fetchData() }, [fetchData])

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
    if (res.ok) { reset(); setSheetOpen(false); fetchData() }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Appointments</h1>
          <p className="text-sm text-gray-500">
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addDays(d, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addDays(d, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" /> Add Appointment
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* Day headers */}
        <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: '4rem repeat(7, 1fr)' }}>
          <div className="border-r border-gray-200 px-2 py-3" />
          {weekDays.map((day) => (
            <div key={day.toISOString()} className={`border-r border-gray-200 px-2 py-3 text-center last:border-r-0 ${
              isSameDay(day, new Date()) ? 'bg-blue-50' : ''
            }`}>
              <p className="text-xs font-medium text-gray-500">{format(day, 'EEE')}</p>
              <p className={`text-sm font-semibold ${isSameDay(day, new Date()) ? 'text-blue-600' : 'text-gray-900'}`}>
                {format(day, 'd')}
              </p>
            </div>
          ))}
        </div>

        {/* Hour rows */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-gray-400">Loading...</div>
          ) : (
            hours.map((hour) => (
              <div
                key={hour}
                className="grid border-b border-gray-100 last:border-b-0"
                style={{ gridTemplateColumns: '4rem repeat(7, 1fr)', minHeight: '4rem' }}
              >
                <div className="border-r border-gray-200 px-2 py-1 text-xs text-gray-400">
                  {format(new Date().setHours(hour, 0, 0), 'h a')}
                </div>
                {weekDays.map((day) => {
                  const dayAppts = getAppointmentsForDayHour(day, hour)
                  return (
                    <div key={day.toISOString()} className="border-r border-gray-100 p-1 last:border-r-0">
                      {dayAppts.map((a) => (
                        <div
                          key={a.id}
                          className="mb-1 rounded bg-blue-100 px-1.5 py-1 text-xs"
                        >
                          <p className="font-medium text-blue-800 truncate">{a.title}</p>
                          {a.customers && (
                            <p className="text-blue-600 truncate">
                              {a.customers.first_name} {a.customers.last_name ?? ''}
                            </p>
                          )}
                          <Badge variant={STATUS_VARIANTS[a.status] ?? 'default'} className="mt-0.5 text-[10px]">
                            {a.status}
                          </Badge>
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

      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Appointment">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
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
