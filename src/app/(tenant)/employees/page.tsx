'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Clock, LogIn, LogOut, DollarSign, CalendarDays, TrendingUp } from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatDateTime, formatDate, formatCurrency } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'

interface EmployeeRow {
  id: string; first_name: string; last_name: string | null; email: string | null; role: string | null; is_active: boolean
}
interface TimeClockRow {
  id: string; employee_id: string; clock_in: string; clock_out: string | null
  employees?: { first_name: string; last_name: string | null } | null
}
interface ShiftRow {
  id: string; name: string; start_time: string; end_time: string; days_of_week: number[]
}
interface PayrollRow {
  id: string; start_date: string; end_date: string; status: string; gross_pay: number | null; total_hours: number | null
  employees?: { first_name: string; last_name: string | null } | null
}
interface CommissionRow {
  id: string; amount: number; status: string; source_type: string; created_at: string
  employees?: { first_name: string; last_name: string | null } | null
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const schema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  role: z.string().optional(),
  hourly_rate: z.coerce.number().optional(),
  access_pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits').optional().or(z.literal('')),
})
type FormData = z.infer<typeof schema>

const shiftSchema = z.object({
  name: z.string().min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
})
type ShiftForm = z.infer<typeof shiftSchema>

const payrollSchema = z.object({
  employee_id: z.string().uuid(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
})
type PayrollForm = z.infer<typeof payrollSchema>

export default function EmployeesPage() {
  const { activeBranch } = useAuthStore()
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [timeLogs, setTimeLogs] = useState<TimeClockRow[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [payrolls, setPayrolls] = useState<PayrollRow[]>([])
  const [commissions, setCommissions] = useState<CommissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [shiftSheetOpen, setShiftSheetOpen] = useState(false)
  const [payrollSheetOpen, setPayrollSheetOpen] = useState(false)
  const [clockingEmployee, setClockinEmployee] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [payrollAction, setPayrollAction] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const shiftForm = useForm<ShiftForm>({ resolver: zodResolver(shiftSchema) })
  const payrollForm = useForm<PayrollForm>({ resolver: zodResolver(payrollSchema) })

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const [empRes, clockRes, shiftRes, payrollRes, commRes] = await Promise.all([
      fetch(`/api/employees?branch_id=${activeBranch.id}`),
      fetch(`/api/employees/clock?branch_id=${activeBranch.id}&date=${today}`),
      fetch(`/api/employees/shifts?branch_id=${activeBranch.id}`),
      fetch(`/api/employees/payroll?branch_id=${activeBranch.id}`),
      fetch(`/api/employees/commissions?branch_id=${activeBranch.id}`),
    ])
    const [empJson, clockJson, shiftJson, payrollJson, commJson] = await Promise.all([
      empRes.json(), clockRes.json(), shiftRes.json(), payrollRes.json(), commRes.json(),
    ])
    setEmployees(empJson.data ?? [])
    setTimeLogs(clockJson.data ?? [])
    setShifts(shiftJson.data ?? [])
    setPayrolls(payrollJson.data ?? [])
    setCommissions(commJson.data ?? [])
    setLoading(false)
  }, [activeBranch])

  useEffect(() => { fetchData() }, [fetchData])

  async function onCreate(data: FormData) {
    if (!activeBranch) return
    setCreateError(null)
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id }),
    })
    if (res.ok) { reset(); setSheetOpen(false); fetchData() }
    else { const j = await res.json(); setCreateError(j?.error?.message ?? 'Failed to create employee.') }
  }

  async function handleClock(employeeId: string, action: 'in' | 'out') {
    if (!activeBranch) return
    setClockinEmployee(employeeId)
    const res = await fetch('/api/employees/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: employeeId,
        branch_id: activeBranch.id,
        action: action === 'in' ? 'clock_in' : 'clock_out',
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert(json.error ?? 'Clock action failed')
    }
    setClockinEmployee(null)
    fetchData()
  }

  async function onCreateShift(data: ShiftForm) {
    if (!activeBranch) return
    const res = await fetch('/api/employees/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id, days_of_week: selectedDays }),
    })
    if (res.ok) { shiftForm.reset(); setSelectedDays([]); setShiftSheetOpen(false); fetchData() }
  }

  async function deleteShift(id: string) {
    await fetch(`/api/employees/shifts/${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function onCreatePayroll(data: PayrollForm) {
    if (!activeBranch) return
    const res = await fetch('/api/employees/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id }),
    })
    if (res.ok) { payrollForm.reset(); setPayrollSheetOpen(false); fetchData() }
  }

  async function handlePayrollAction(id: string, action: 'approve' | 'paid') {
    setPayrollAction(id)
    await fetch(`/api/employees/payroll/${id}/${action}`, { method: 'POST' })
    setPayrollAction(null)
    fetchData()
  }

  const empColumns: ColumnDef<EmployeeRow>[] = [
    { id: 'name', header: 'Name', cell: ({ row }) => `${row.original.first_name} ${row.original.last_name ?? ''}` },
    { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => getValue() as string ?? '—' },
    { accessorKey: 'role', header: 'Role', cell: ({ getValue }) => getValue() as string ?? '—' },
    { accessorKey: 'is_active', header: 'Status', cell: ({ getValue }) => (
      <Badge variant={(getValue() as boolean) ? 'success' : 'destructive'}>
        {(getValue() as boolean) ? 'Active' : 'Inactive'}
      </Badge>
    )},
    { id: 'clock', header: 'Clock', cell: ({ row }) => {
      const isClockedIn = timeLogs.some((t) => t.employee_id === row.original.id && !t.clock_out)
      return (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" loading={clockingEmployee === row.original.id}
            onClick={() => handleClock(row.original.id, 'in')} disabled={isClockedIn}>
            <LogIn className="h-3 w-3" /> In
          </Button>
          <Button size="sm" variant="outline" loading={clockingEmployee === row.original.id}
            onClick={() => handleClock(row.original.id, 'out')} disabled={!isClockedIn}>
            <LogOut className="h-3 w-3" /> Out
          </Button>
        </div>
      )
    }},
  ]

  const clockColumns: ColumnDef<TimeClockRow>[] = [
    { id: 'employee', header: 'Employee', cell: ({ row }) => {
      const e = row.original.employees
      return e ? `${e.first_name} ${e.last_name ?? ''}` : '—'
    }},
    { accessorKey: 'clock_in', header: 'Clock In', cell: ({ getValue }) => formatDateTime(getValue() as string) },
    { accessorKey: 'clock_out', header: 'Clock Out', cell: ({ getValue }) => {
      const v = getValue() as string | null
      return v ? formatDateTime(v) : <Badge variant="warning">Active</Badge>
    }},
  ]

  const shiftColumns: ColumnDef<ShiftRow>[] = [
    { accessorKey: 'name', header: 'Shift Name' },
    { id: 'time', header: 'Hours', cell: ({ row }) => `${row.original.start_time} – ${row.original.end_time}` },
    { id: 'days', header: 'Days', cell: ({ row }) => (
      <div className="flex gap-1 flex-wrap">
        {row.original.days_of_week.map((d) => (
          <Badge key={d} variant="secondary">{DAY_NAMES[d]}</Badge>
        ))}
      </div>
    )},
    { id: 'actions', header: '', cell: ({ row }) => (
      <Button size="sm" variant="destructive" onClick={() => deleteShift(row.original.id)}>Delete</Button>
    )},
  ]

  const statusVariant = (s: string) =>
    s === 'approved' ? 'success' : s === 'paid' ? 'secondary' : 'warning'

  const payrollColumns: ColumnDef<PayrollRow>[] = [
    { id: 'employee', header: 'Employee', cell: ({ row }) => {
      const e = row.original.employees
      return e ? `${e.first_name} ${e.last_name ?? ''}` : '—'
    }},
    { id: 'period', header: 'Period', cell: ({ row }) =>
      `${formatDate(row.original.start_date)} – ${formatDate(row.original.end_date)}`
    },
    { accessorKey: 'total_hours', header: 'Hours', cell: ({ getValue }) => {
      const v = getValue() as number | null; return v != null ? `${v}h` : '—'
    }},
    { accessorKey: 'gross_pay', header: 'Gross Pay', cell: ({ getValue }) => {
      const v = getValue() as number | null; return v != null ? formatCurrency(v) : '—'
    }},
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => (
      <Badge variant={statusVariant(getValue() as string)}>{getValue() as string}</Badge>
    )},
    { id: 'actions', header: '', cell: ({ row }) => (
      <div className="flex gap-1">
        {row.original.status === 'draft' && (
          <Button size="sm" loading={payrollAction === row.original.id}
            onClick={() => handlePayrollAction(row.original.id, 'approve')}>Approve</Button>
        )}
        {row.original.status === 'approved' && (
          <Button size="sm" variant="secondary" loading={payrollAction === row.original.id}
            onClick={() => handlePayrollAction(row.original.id, 'paid')}>Mark Paid</Button>
        )}
      </div>
    )},
  ]

  const commColumns: ColumnDef<CommissionRow>[] = [
    { id: 'employee', header: 'Employee', cell: ({ row }) => {
      const e = row.original.employees
      return e ? `${e.first_name} ${e.last_name ?? ''}` : '—'
    }},
    { accessorKey: 'source_type', header: 'Source', cell: ({ getValue }) => (
      <Badge variant="secondary">{getValue() as string}</Badge>
    )},
    { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => (
      <Badge variant={(getValue() as string) === 'paid' ? 'success' : 'warning'}>{getValue() as string}</Badge>
    )},
    { accessorKey: 'created_at', header: 'Date', cell: ({ getValue }) => formatDate(getValue() as string) },
  ]

  const tabCls = 'rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500">{employees.length} employees</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      <Tabs.Root defaultValue="employees">
        <Tabs.List className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit flex-wrap">
          <Tabs.Trigger value="employees" className={tabCls}>Employees</Tabs.Trigger>
          <Tabs.Trigger value="clock" className={tabCls}>
            <Clock className="mr-1.5 inline h-3.5 w-3.5" />Clock In/Out
          </Tabs.Trigger>
          <Tabs.Trigger value="shifts" className={tabCls}>
            <CalendarDays className="mr-1.5 inline h-3.5 w-3.5" />Shifts
          </Tabs.Trigger>
          <Tabs.Trigger value="payroll" className={tabCls}>
            <DollarSign className="mr-1.5 inline h-3.5 w-3.5" />Payroll
          </Tabs.Trigger>
          <Tabs.Trigger value="commissions" className={tabCls}>
            <TrendingUp className="mr-1.5 inline h-3.5 w-3.5" />Commissions
          </Tabs.Trigger>
        </Tabs.List>

        {/* ── Employees ── */}
        <Tabs.Content value="employees" className="mt-4">
          <DataTable data={employees} columns={empColumns} isLoading={loading} emptyMessage="No employees yet." />
        </Tabs.Content>

        {/* ── Clock In/Out ── */}
        <Tabs.Content value="clock" className="mt-4">
          <DataTable data={timeLogs} columns={clockColumns} isLoading={loading} emptyMessage="No clock records for today." />
        </Tabs.Content>

        {/* ── Shifts ── */}
        <Tabs.Content value="shifts" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setShiftSheetOpen(true)}>
              <Plus className="h-4 w-4" /> Add Shift
            </Button>
          </div>
          <DataTable data={shifts} columns={shiftColumns} isLoading={loading} emptyMessage="No shifts defined." />
        </Tabs.Content>

        {/* ── Payroll ── */}
        <Tabs.Content value="payroll" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setPayrollSheetOpen(true)}>
              <Plus className="h-4 w-4" /> Create Period
            </Button>
          </div>
          <DataTable data={payrolls} columns={payrollColumns} isLoading={loading} emptyMessage="No payroll periods." />
        </Tabs.Content>

        {/* ── Commissions ── */}
        <Tabs.Content value="commissions" className="mt-4">
          <DataTable data={commissions} columns={commColumns} isLoading={loading} emptyMessage="No commissions recorded." />
        </Tabs.Content>
      </Tabs.Root>

      {/* ── Add Employee Sheet ── */}
      <InlineFormSheet open={sheetOpen} onClose={() => { setSheetOpen(false); setCreateError(null) }} title="Add Employee">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" required error={errors.first_name?.message} {...register('first_name')} />
            <Input label="Last Name" {...register('last_name')} />
          </div>
          <Input label="Email" type="email" {...register('email')} />
          <Input label="Phone" type="tel" {...register('phone')} />
          <Input label="Role/Position" placeholder="Technician, Cashier..." {...register('role')} />
          <Input label="Hourly Rate (£)" type="number" step="0.01" {...register('hourly_rate')} />
          <div>
            <Input label="Access PIN (4–6 digits)" type="password" inputMode="numeric"
              placeholder="Leave blank to skip" error={errors.access_pin?.message}
              {...register('access_pin')} />
            <p className="mt-1 text-xs text-gray-400">Used for PIN-gated actions (discounts, refunds, etc.)</p>
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Add Employee</Button>
        </form>
      </InlineFormSheet>

      {/* ── Add Shift Sheet ── */}
      <InlineFormSheet open={shiftSheetOpen} onClose={() => setShiftSheetOpen(false)} title="Create Shift">
        <form onSubmit={shiftForm.handleSubmit(onCreateShift)} className="space-y-4">
          <Input label="Shift Name" required error={shiftForm.formState.errors.name?.message}
            {...shiftForm.register('name')} placeholder="Morning, Evening..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Time" type="time" required error={shiftForm.formState.errors.start_time?.message}
              {...shiftForm.register('start_time')} />
            <Input label="End Time" type="time" required error={shiftForm.formState.errors.end_time?.message}
              {...shiftForm.register('end_time')} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Days of Week</p>
            <div className="flex gap-2 flex-wrap">
              {DAY_NAMES.map((day, i) => (
                <button key={i} type="button"
                  onClick={() => setSelectedDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i])}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedDays.includes(i)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-500'
                  }`}
                >{day}</button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" loading={shiftForm.formState.isSubmitting}>Create Shift</Button>
        </form>
      </InlineFormSheet>

      {/* ── Create Payroll Period Sheet ── */}
      <InlineFormSheet open={payrollSheetOpen} onClose={() => setPayrollSheetOpen(false)} title="Create Payroll Period">
        <form onSubmit={payrollForm.handleSubmit(onCreatePayroll)} className="space-y-4">
          <Select
            label="Employee"
            required
            options={employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name ?? ''}` }))}
            onValueChange={(v) => payrollForm.setValue('employee_id', v)}
            error={payrollForm.formState.errors.employee_id?.message}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date" type="date" required error={payrollForm.formState.errors.start_date?.message}
              {...payrollForm.register('start_date')} />
            <Input label="End Date" type="date" required error={payrollForm.formState.errors.end_date?.message}
              {...payrollForm.register('end_date')} />
          </div>
          <Button type="submit" className="w-full" loading={payrollForm.formState.isSubmitting}>Create Period</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}

