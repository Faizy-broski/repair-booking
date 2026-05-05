'use client'
import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock, LogIn, LogOut, DollarSign, CalendarDays, TrendingUp, Pencil, Trash2 } from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { AsyncEmployeeSelect } from '@/components/shared/async-employee-select'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { PhoneInput } from '@/components/ui/phone-input'
import validations from '@/components/layout/number-validations.json'
import { useAuthStore } from '@/store/auth.store'
import { formatDateTime, formatDate, formatCurrency } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'

interface EmployeeRow {
  id: string; first_name: string; last_name: string | null; email: string | null; role: string | null; is_active: boolean
  phone?: string | null; hourly_rate?: number | null
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
}).refine((data) => {
  if (!data.phone || !data.phone.startsWith('+')) return true
  const sortedValidations = [...validations].sort((a, b) => b.phone.length - a.phone.length)
  const rule = sortedValidations.find(v => data.phone!.startsWith('+' + v.phone.replace('-', '')))
  if (!rule) return true
  const dialCode = rule.phone.replace('-', '')
  const digitsOnly = data.phone.slice(dialCode.length + 1)
  const length = digitsOnly.length
  if (Array.isArray(rule.phoneLength)) return rule.phoneLength.includes(length)
  if (rule.phoneLength) return length === rule.phoneLength
  if (rule.min && length < rule.min) return false
  if (rule.max && length > rule.max) return false
  return true
}, {
  message: 'Invalid phone number length for the selected country',
  path: ['phone'],
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
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [shiftSheetOpen, setShiftSheetOpen] = useState(false)
  const [payrollSheetOpen, setPayrollSheetOpen] = useState(false)
  const [clockingEmployee, setClockinEmployee] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [payrollAction, setPayrollAction] = useState<string | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(null)
  const [deletingEmployee, setDeletingEmployee] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const shiftForm = useForm<ShiftForm>({ resolver: zodResolver(shiftSchema) })
  const payrollForm = useForm<PayrollForm>({ resolver: zodResolver(payrollSchema) })

  const today = new Date().toISOString().split('T')[0]

  // ── Step 1: employees first — show this tab instantly ─────────────────────
  const [empPage, setEmpPage] = useState(0)

  const { data: employeesData, isLoading: loadingEmployees, isSuccess: employeesLoaded } = useQuery({
    queryKey: ['employees-list', activeBranch?.id, empPage],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id, page: String(empPage + 1), limit: '20' })
      const res = await fetch(`/api/employees?${params}`)
      const json = await res.json()
      return { data: (json.data ?? []) as EmployeeRow[], total: json.meta?.total ?? 0 }
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const employees = employeesData?.data ?? []
  const totalEmployees = employeesData?.total ?? 0

  // ── Step 2: all tab data in parallel, silently, after employees arrive ────
  // They won't block the employee tab — by the time user clicks any other tab
  // the data will already be loaded in the React Query cache.
  const bgEnabled = !!activeBranch && employeesLoaded

  const { data: timeLogs = [], isLoading: loadingClock } = useQuery({
    queryKey: ['employees-clock', activeBranch?.id, today],
    queryFn: async () => {
      const res = await fetch(`/api/employees/clock?branch_id=${activeBranch!.id}&date=${today}`)
      const json = await res.json(); return (json.data ?? []) as TimeClockRow[]
    },
    enabled: bgEnabled,
    staleTime: 15_000,
  })

  const { data: shifts = [], isLoading: loadingShifts } = useQuery({
    queryKey: ['employees-shifts', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/employees/shifts?branch_id=${activeBranch!.id}`)
      const json = await res.json(); return (json.data ?? []) as ShiftRow[]
    },
    enabled: bgEnabled,
    staleTime: 60_000,
  })

  const { data: payrolls = [], isLoading: loadingPayroll } = useQuery({
    queryKey: ['employees-payroll', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/employees/payroll?branch_id=${activeBranch!.id}`)
      const json = await res.json(); return (json.data ?? []) as PayrollRow[]
    },
    enabled: bgEnabled,
    staleTime: 30_000,
  })

  const { data: commissions = [], isLoading: loadingCommissions } = useQuery({
    queryKey: ['employees-commissions', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/employees/commissions?branch_id=${activeBranch!.id}`)
      const json = await res.json(); return (json.data ?? []) as CommissionRow[]
    },
    enabled: bgEnabled,
    staleTime: 30_000,
  })

  function openCreateSheet() {
    setEditingEmployee(null)
    reset({ first_name: '', last_name: '', email: '', phone: '', role: '', hourly_rate: undefined })
    setCreateError(null)
    setSheetOpen(true)
  }

  function openEditSheet(employee: EmployeeRow) {
    setEditingEmployee(employee)
    reset({
      first_name: employee.first_name,
      last_name: employee.last_name ?? '',
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      role: employee.role ?? '',
      hourly_rate: employee.hourly_rate ?? undefined,
    })
    setCreateError(null)
    setSheetOpen(true)
  }

  async function onSubmit(data: FormData) {
    if (!activeBranch) return
    setCreateError(null)

    if (editingEmployee) {
      // Update existing employee
      const res = await fetch(`/api/employees/${editingEmployee.id}?branch_id=${activeBranch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        reset()
        setEditingEmployee(null)
        setSheetOpen(false)
        queryClient.invalidateQueries({ queryKey: ['employees-list', activeBranch.id] })
      } else {
        const j = await res.json()
        setCreateError(j?.error?.message ?? 'Failed to update employee.')
      }
    } else {
      // Create new employee
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, branch_id: activeBranch.id }),
      })
      if (res.ok) {
        reset()
        setSheetOpen(false)
        queryClient.invalidateQueries({ queryKey: ['employees-list', activeBranch.id] })
      } else {
        const j = await res.json()
        setCreateError(j?.error?.message ?? 'Failed to create employee.')
      }
    }
  }

  async function handleDelete(employeeId: string) {
    setConfirmDeleteId(employeeId)
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return
    setDeletingEmployee(confirmDeleteId)
    setConfirmDeleteId(null)
    try {
      const res = await fetch(`/api/employees/${confirmDeleteId}?branch_id=${activeBranch?.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Employee deactivated successfully.')
      } else {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error?.message ?? 'Failed to delete employee.')
      }
      queryClient.invalidateQueries({ queryKey: ['employees-list', activeBranch?.id] })
    } finally {
      setDeletingEmployee(null)
    }
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
      toast.error(json.error ?? 'Clock action failed')
    }
    setClockinEmployee(null)
    queryClient.invalidateQueries({ queryKey: ['employees-clock', activeBranch.id, today] })
  }

  async function onCreateShift(data: ShiftForm) {
    if (!activeBranch) return
    if (editingShift) {
      // Edit mode — PUT
      const res = await fetch(`/api/employees/shifts/${editingShift.id}?branch_id=${activeBranch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, days_of_week: selectedDays }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Failed to update shift'); return }
      toast.success('Shift updated')
    } else {
      // Create mode — POST
      const res = await fetch('/api/employees/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, branch_id: activeBranch.id, days_of_week: selectedDays }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Failed to create shift'); return }
      toast.success('Shift created')
    }
    shiftForm.reset()
    setSelectedDays([])
    setEditingShift(null)
    setShiftSheetOpen(false)
    queryClient.invalidateQueries({ queryKey: ['employees-shifts', activeBranch.id] })
  }

  function openEditShift(shift: ShiftRow) {
    setEditingShift(shift)
    shiftForm.reset({ name: shift.name, start_time: shift.start_time, end_time: shift.end_time })
    setSelectedDays(shift.days_of_week)
    setShiftSheetOpen(true)
  }

  async function deleteShift(id: string) {
    if (!activeBranch) return
    await fetch(`/api/employees/shifts/${id}?branch_id=${activeBranch.id}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['employees-shifts', activeBranch.id] })
  }

  async function onCreatePayroll(data: PayrollForm) {
    if (!activeBranch) return
    const res = await fetch('/api/employees/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id }),
    })
    if (res.ok) { payrollForm.reset(); setPayrollSheetOpen(false); queryClient.invalidateQueries({ queryKey: ['employees-payroll', activeBranch.id] }) }
  }

  async function handlePayrollAction(id: string, action: 'approve' | 'paid') {
    setPayrollAction(id)
    await fetch(`/api/employees/payroll/${id}/${action}`, { method: 'POST' })
    setPayrollAction(null)
    queryClient.invalidateQueries({ queryKey: ['employees-payroll', activeBranch?.id] })
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
    { id: 'actions', header: '', cell: ({ row }) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => openEditSheet(row.original)} title="Edit employee">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" loading={deletingEmployee === row.original.id}
          onClick={() => handleDelete(row.original.id)} title="Delete employee">
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </Button>
      </div>
    )},
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
      <div className="flex gap-1.5 justify-end">
        <Button size="sm" variant="outline" onClick={() => openEditShift(row.original)}>
          <Pencil className="h-3.5 w-3.5 mr-1" />Edit
        </Button>
        <Button size="sm" variant="destructive" onClick={() => deleteShift(row.original.id)}>Delete</Button>
      </div>
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
          <p className="text-sm text-gray-500">{totalEmployees} employees</p>
        </div>
        <Button onClick={openCreateSheet}>
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
          <DataTable data={employees} columns={empColumns} isLoading={loadingEmployees} totalCount={totalEmployees} pageIndex={empPage} pageSize={20} onPageChange={setEmpPage} emptyMessage="No employees yet." />
        </Tabs.Content>

        {/* ── Clock In/Out ── */}
        <Tabs.Content value="clock" className="mt-4">
          <DataTable data={timeLogs} columns={clockColumns} isLoading={loadingClock} emptyMessage="No clock records for today." />
        </Tabs.Content>

        {/* ── Shifts ── */}
        <Tabs.Content value="shifts" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => { setEditingShift(null); shiftForm.reset(); setSelectedDays([]); setShiftSheetOpen(true) }}>
              <Plus className="h-4 w-4" /> Add Shift
            </Button>
          </div>
          <DataTable data={shifts} columns={shiftColumns} isLoading={loadingShifts} emptyMessage="No shifts defined." />
        </Tabs.Content>

        {/* ── Payroll ── */}
        <Tabs.Content value="payroll" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setPayrollSheetOpen(true)}>
              <Plus className="h-4 w-4" /> Create Period
            </Button>
          </div>
          <DataTable data={payrolls} columns={payrollColumns} isLoading={loadingPayroll} emptyMessage="No payroll periods." />
        </Tabs.Content>

        {/* ── Commissions ── */}
        <Tabs.Content value="commissions" className="mt-4">
          <DataTable data={commissions} columns={commColumns} isLoading={loadingCommissions} emptyMessage="No commissions recorded." />
        </Tabs.Content>
      </Tabs.Root>

      {/* ── Add / Edit Employee Sheet ── */}
      <InlineFormSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditingEmployee(null); setCreateError(null) }}
        title={editingEmployee ? 'Edit Employee' : 'Add Employee'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" required error={errors.first_name?.message} {...register('first_name')} />
            <Input label="Last Name" {...register('last_name')} />
          </div>
          <Input label="Email" type="email" {...register('email')} />
          <PhoneInput
            label="Phone"
            value={watch('phone') ?? ''}
            onChange={(val) => setValue('phone', val, { shouldValidate: true })}
            error={errors.phone?.message}
          />
          <Input label="Role/Position" placeholder="Technician, Cashier..." {...register('role')} />
          <Input label="Hourly Rate (£)" type="number" step="0.01" {...register('hourly_rate')} />
          <Button type="submit" className="w-full" loading={isSubmitting}>
            {editingEmployee ? 'Save Changes' : 'Add Employee'}
          </Button>
        </form>
      </InlineFormSheet>

      {/* ── Add / Edit Shift Sheet ── */}
      <InlineFormSheet
        open={shiftSheetOpen}
        onClose={() => { setShiftSheetOpen(false); setEditingShift(null); shiftForm.reset(); setSelectedDays([]) }}
        title={editingShift ? 'Edit Shift' : 'Create Shift'}
      >
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
          <Button type="submit" className="w-full" loading={shiftForm.formState.isSubmitting}>
            {editingShift ? 'Save Changes' : 'Create Shift'}
          </Button>
        </form>
      </InlineFormSheet>

      {/* ── Create Payroll Period Sheet ── */}
      <InlineFormSheet open={payrollSheetOpen} onClose={() => setPayrollSheetOpen(false)} title="Create Payroll Period">
        <form onSubmit={payrollForm.handleSubmit(onCreatePayroll)} className="space-y-4">
          {activeBranch && (
            <AsyncEmployeeSelect
              branchId={activeBranch.id}
              value={payrollForm.watch('employee_id') ?? ''}
              onChange={(id) => payrollForm.setValue('employee_id', id, { shouldValidate: true })}
              error={payrollForm.formState.errors.employee_id?.message}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date" type="date" required error={payrollForm.formState.errors.start_date?.message}
              {...payrollForm.register('start_date')} />
            <Input label="End Date" type="date" required error={payrollForm.formState.errors.end_date?.message}
              {...payrollForm.register('end_date')} />
          </div>
          <Button type="submit" className="w-full" loading={payrollForm.formState.isSubmitting}>Create Period</Button>
        </form>
      </InlineFormSheet>

      <ConfirmModal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={confirmDelete}
        title="Remove Employee?"
        description="This will deactivate the employee record. They will no longer appear in active lists or be assignable to jobs."
        confirmLabel="Remove"
        loading={!!deletingEmployee}
      />
    </div>
  )
}
