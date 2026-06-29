'use client'
import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock, LogIn, LogOut, DollarSign, CalendarDays, TrendingUp, Pencil, Trash2, BarChart2, Users, ShoppingBag, CheckCircle2, Loader2 } from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { AsyncEmployeeSelect } from '@/components/shared/async-employee-select'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { EmployeeReportTab } from './_components/employee-report'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { Modal } from '@/components/ui/modal'
import { PhoneInput } from '@/components/ui/phone-input'
import validations from '@/components/layout/number-validations.json'
import { useAuthStore } from '@/store/auth.store'
import { formatDateTime, formatDate, formatCurrency } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { toast } from 'sonner'
import { Suspense } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

interface EmployeeRow {
  id: string; first_name: string; last_name: string | null; email: string | null; role: string | null; is_active: boolean
  phone?: string | null; hourly_rate?: number | null; base_salary?: number | null
}
interface TimeClockRow {
  id: string; employee_id: string; clock_in: string; clock_out: string | null
  break_minutes?: number | null
  employees?: { first_name: string; last_name: string | null } | null
}
interface ShiftRow {
  id: string; name: string; start_time: string; end_time: string; days_of_week: number[]
}
interface PayrollRow {
  id: string; start_date: string; end_date: string; status: string
  gross_pay: number | null; total_hours: number | null; base_salary?: number | null
  purchase_deductions?: number | null
  employees?: { first_name: string; last_name: string | null } | null
}
interface CommissionRow {
  id: string; amount: number; status: string; source_type: string; created_at: string
  employee_id: string
  employees?: { first_name: string; last_name: string | null } | null
  sale?: {
    id: string; total: number; subtotal: number; discount: number; tax: number
    payment_method: string; created_at: string
    customers?: { first_name: string; last_name: string | null } | null
    sale_items?: { name: string; quantity: number; unit_price: number; total: number }[]
  } | null
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const schema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  role: z.string().optional(),
  hourly_rate: z.coerce.number().optional(),
  base_salary: z.coerce.number().min(0).optional(),
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



function EmployeesPageInner() {
  const { activeBranch, verticalTemplateSlug, currency } = useAuthStore()
  // Base salary + per-sale commission entry is specific to the retail-store
  // vertical template, independent of any module's enabled/disabled state.
  const isRetailTemplate = verticalTemplateSlug === 'retail-store'
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = searchParams.get('tab') ?? 'employees'

  function handleTabChange(tab: string) {
    router.push(`/employees?tab=${tab}`, { scroll: false })
  }
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [shiftSheetOpen, setShiftSheetOpen] = useState(false)
  const [payrollSheetOpen, setPayrollSheetOpen] = useState(false)
  // ── Commissions filters ─────────────────────────────────────────────────
  const nowMonth = String(new Date().getMonth() + 1)
  const nowYear  = String(new Date().getFullYear())

  const [commEmployeeFilter, setCommEmployeeFilter] = useState('')
  const [commMonthFilter, setCommMonthFilter] = useState(nowMonth)
  const [commYearFilter, setCommYearFilter]   = useState(nowYear)
  const [editingCommission, setEditingCommission] = useState<CommissionRow | null>(null)
  const [commEditStatus, setCommEditStatus] = useState<string>('pending')
  const [commEditAmount, setCommEditAmount] = useState<string>('')
  const [commEditSaving, setCommEditSaving] = useState(false)
  // ── Clock In/Out filters ─────────────────────────────────────────────────
  const [clockEmployeeFilter, setClockEmployeeFilter] = useState('')
  const [clockMonthFilter, setClockMonthFilter] = useState(nowMonth)
  const [clockYearFilter, setClockYearFilter]   = useState(nowYear)
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
  const [empPageSize, setEmpPageSize] = useState(20)

  const { data: employeesData, isLoading: loadingEmployees, isSuccess: employeesLoaded } = useQuery({
    queryKey: ['employees-list', activeBranch?.id, empPage, empPageSize],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id, page: String(empPage + 1), limit: String(empPageSize) })
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

  // Always today-only — drives the quick clock-in/out buttons in the Employees tab.
  // Kept separate from the filterable Clock In/Out report below so changing
  // those filters never affects whether an employee shows as "clocked in" today.
  const { data: timeLogs = [], isLoading: loadingClock } = useQuery({
    queryKey: ['employees-clock', activeBranch?.id, today],
    queryFn: async () => {
      const res = await fetch(`/api/employees/clock?branch_id=${activeBranch!.id}&date=${today}`)
      const json = await res.json(); return (json.data ?? []) as TimeClockRow[]
    },
    enabled: bgEnabled,
    staleTime: 15_000,
  })

  // Filterable attendance report — Clock In/Out tab.
  const { data: clockHistory = [], isLoading: loadingClockHistory } = useQuery({
    queryKey: ['employees-clock-history', activeBranch?.id, clockEmployeeFilter, clockMonthFilter, clockYearFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id })
      if (clockEmployeeFilter) params.set('employee_id', clockEmployeeFilter)
      if (clockMonthFilter) params.set('month', clockMonthFilter)
      if (clockYearFilter) params.set('year', clockYearFilter)
      const res = await fetch(`/api/employees/clock?${params}`)
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
    queryKey: ['employees-commissions', activeBranch?.id, commEmployeeFilter, commMonthFilter, commYearFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id })
      if (commEmployeeFilter) params.set('employee_id', commEmployeeFilter)
      if (commMonthFilter) params.set('month', commMonthFilter)
      if (commYearFilter) params.set('year', commYearFilter)
      const res = await fetch(`/api/employees/commissions?${params}`)
      const json = await res.json(); return (json.data ?? []) as CommissionRow[]
    },
    enabled: bgEnabled,
    staleTime: 30_000,
  })

  // ── Employee Purchases state ──────────────────────────────────────────────
  const [purchaseEmployeeFilter, setPurchaseEmployeeFilter] = useState('')
  const [settlingPurchase, setSettlingPurchase] = useState<string | null>(null)
  const [settleMethod, setSettleMethod] = useState<Record<string, 'cash' | 'card'>>({})

  interface PaymentSplitEntry { method: string; amount: number; payroll_period_id?: string }
  interface EmployeePurchaseRow {
    id: string; created_at: string; total: number; amount_paid: number
    payment_status: string; notes: string | null
    employee_id: string
    payment_splits?: PaymentSplitEntry[] | null
    employees?: { first_name: string; last_name: string | null } | null  // alias: employees!sales_employee_id_fkey
    sale_items?: { name: string; quantity: number }[]
  }

  function getPurchaseSettlementStatus(p: EmployeePurchaseRow): 'pending' | 'payroll' | 'direct' {
    if (p.payment_status !== 'paid' && p.payment_status !== 'partial') return 'pending'
    const hasPayrollDeduction = (p.payment_splits ?? []).some(s => s.method === 'payroll_deduction')
    if (hasPayrollDeduction && p.payment_status === 'paid') return 'payroll'
    if (p.payment_status === 'paid') return 'direct'
    return 'pending'
  }

  const { data: employeePurchases = [], isLoading: loadingPurchases, refetch: refetchPurchases } = useQuery({
    queryKey: ['employee-purchases', activeBranch?.id, purchaseEmployeeFilter],
    queryFn: async () => {
      if (!activeBranch) return []
      const params = new URLSearchParams({ branch_id: activeBranch.id, employee_purchases: 'true' })
      if (purchaseEmployeeFilter) params.set('employee_id', purchaseEmployeeFilter)
      const res = await fetch(`/api/pos/sales?${params}`)
      const json = await res.json()
      return (json.data ?? []) as EmployeePurchaseRow[]
    },
    enabled: !!activeBranch && activeTab === 'purchases',
    staleTime: 30_000,
  })

  async function settlePurchase(saleId: string, outstanding: number, method: 'cash' | 'card' = 'cash') {
    setSettlingPurchase(saleId)
    try {
      const res = await fetch(`/api/pos/sales/${saleId}/payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: outstanding, payment_method: method }),
      })
      if (!res.ok) throw new Error('Failed')
      await refetchPurchases()
      toast.success('Purchase settled directly')
    } catch {
      toast.error('Could not settle purchase')
    } finally {
      setSettlingPurchase(null)
    }
  }

  function openCreateSheet() {
    setEditingEmployee(null)
    reset({ first_name: '', last_name: '', email: '', phone: '', role: '', hourly_rate: undefined, base_salary: undefined })
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
      base_salary: employee.base_salary ?? undefined,
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
      toast.error(json?.error?.message ?? 'Clock action failed')
    }
    setClockinEmployee(null)
    queryClient.invalidateQueries({ queryKey: ['employees-clock', activeBranch.id, today] })
    queryClient.invalidateQueries({ queryKey: ['employees-clock-history', activeBranch.id] })
  }

  function formatDuration(clockIn: string, clockOut: string | null, breakMinutes?: number | null) {
    if (!clockOut) return null
    const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime() - (breakMinutes ?? 0) * 60_000
    const totalMinutes = Math.max(0, Math.round(ms / 60_000))
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${h}h ${m}m`
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
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j?.error?.message ?? 'Failed to update shift'); return }
      toast.success('Shift updated')
    } else {
      // Create mode — POST
      const res = await fetch('/api/employees/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, branch_id: activeBranch.id, days_of_week: selectedDays }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j?.error?.message ?? 'Failed to create shift'); return }
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
    if (res.ok) {
      payrollForm.reset(); setPayrollSheetOpen(false)
      queryClient.invalidateQueries({ queryKey: ['employees-payroll', activeBranch.id] })
    } else {
      const json = await res.json().catch(() => ({}))
      toast.error(json?.error?.message ?? 'Failed to create payroll period')
    }
  }

  async function handlePayrollAction(id: string, action: 'approve' | 'paid' | 'reopen') {
    setPayrollAction(id)
    const res = await fetch(`/api/employees/payroll/${id}/${action}`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j?.error?.message ?? `Failed to ${action} payroll`)
    } else {
      if (action === 'paid') toast.success('Payroll marked paid — purchases settled automatically')
      if (action === 'reopen') toast.success('Payroll reopened — purchase settlements reversed')
    }
    setPayrollAction(null)
    queryClient.invalidateQueries({ queryKey: ['employees-payroll', activeBranch?.id] })
    queryClient.invalidateQueries({ queryKey: ['employee-purchases', activeBranch?.id] })
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
      const isLoading   = clockingEmployee === row.original.id
      return (
        <div className="flex items-center gap-2">
          {/* Status dot */}
          <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${isClockedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
          {/* Clock In */}
          <button
            onClick={() => !isClockedIn && !isLoading && handleClock(row.original.id, 'in')}
            disabled={isClockedIn || isLoading}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
              isClockedIn
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                : 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
            }`}
          >
            <LogIn className="h-3 w-3" /> In
          </button>
          {/* Clock Out */}
          <button
            onClick={() => isClockedIn && !isLoading && handleClock(row.original.id, 'out')}
            disabled={!isClockedIn || isLoading}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
              !isClockedIn
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                : 'bg-red-500 text-white hover:bg-red-600 shadow-sm'
            }`}
          >
            <LogOut className="h-3 w-3" /> Out
          </button>
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
    { id: 'hours', header: 'Hours Worked', cell: ({ row }) => {
      const duration = formatDuration(row.original.clock_in, row.original.clock_out, row.original.break_minutes)
      return duration ?? <span className="text-gray-400">—</span>
    }},
  ]

  // Sum of completed shifts in the currently filtered Clock In/Out view.
  const clockHistoryTotalMinutes = clockHistory.reduce((sum, t) => {
    if (!t.clock_out) return sum
    const ms = new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime() - (t.break_minutes ?? 0) * 60_000
    return sum + Math.max(0, Math.round(ms / 60_000))
  }, 0)
  const clockHistoryTotalLabel = `${Math.floor(clockHistoryTotalMinutes / 60)}h ${clockHistoryTotalMinutes % 60}m`

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
    ...(isRetailTemplate ? [{
      accessorKey: 'base_salary', header: 'Base Salary', cell: ({ getValue }: { getValue: () => unknown }) => {
        const v = getValue() as number | null; return v != null && v > 0 ? formatCurrency(v) : '—'
      },
    } as ColumnDef<PayrollRow>] : []),
    { accessorKey: 'gross_pay', header: 'Gross Pay', cell: ({ getValue }) => {
      const v = getValue() as number | null; return v != null ? formatCurrency(v) : '—'
    }},
    { id: 'deductions', header: 'Deductions', cell: ({ row }) => {
      const d = row.original.purchase_deductions
      if (!d || d <= 0) return <span className="text-gray-300">—</span>
      return (
        <span className="text-red-600 font-medium" title="Store purchase deductions">
          -{formatCurrency(d)}
        </span>
      )
    }},
    { id: 'net_pay', header: 'Net Pay', cell: ({ row }) => {
      const gross = row.original.gross_pay ?? 0
      const deductions = row.original.purchase_deductions ?? 0
      const net = Math.max(0, gross - deductions)
      return <span className="font-bold text-teal-700">{formatCurrency(net)}</span>
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
        {(row.original.status === 'approved' || row.original.status === 'paid') && (
          <Button size="sm" variant="outline" loading={payrollAction === row.original.id}
            onClick={() => handlePayrollAction(row.original.id, 'reopen')}>Reopen</Button>
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
    { id: 'sale_customer', header: 'Customer', cell: ({ row }) => {
      const c = row.original.sale?.customers
      return c ? `${c.first_name} ${c.last_name ?? ''}` : <span className="text-gray-400">Walk-in</span>
    }},
    { id: 'sale_items', header: 'Items Sold', cell: ({ row }) => {
      const items = row.original.sale?.sale_items
      if (!items || items.length === 0) return '—'
      const summary = items.map(i => `${i.name} ×${i.quantity}`).join(', ')
      return <span className="text-xs text-gray-600" title={summary}>{summary.length > 40 ? summary.slice(0, 40) + '…' : summary}</span>
    }},
    { id: 'sale_total', header: 'Sale Total', cell: ({ row }) => {
      const sale = row.original.sale
      return sale ? formatCurrency(sale.total) : '—'
    }},
    { accessorKey: 'amount', header: 'Commission', cell: ({ getValue }) => (
      <span className="font-semibold text-green-700">{formatCurrency(getValue() as number)}</span>
    )},
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => (
      <Badge variant={(getValue() as string) === 'paid' ? 'success' : 'warning'}>{getValue() as string}</Badge>
    )},
    { accessorKey: 'created_at', header: 'Date', cell: ({ getValue }) => formatDate(getValue() as string) },
    { id: 'actions', header: '', cell: ({ row }) => (
      <button
        onClick={() => {
          setEditingCommission(row.original)
          setCommEditStatus(row.original.status)
          setCommEditAmount(String(row.original.amount))
        }}
        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="Edit commission"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    )},
  ]

  async function saveCommissionEdit() {
    if (!editingCommission) return
    const amount = parseFloat(commEditAmount)
    if (isNaN(amount) || amount < 0) { toast.error('Invalid amount'); return }
    setCommEditSaving(true)
    try {
      const res = await fetch(`/api/employees/commissions/${editingCommission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: commEditStatus, amount }),
      })
      if (!res.ok) throw new Error('Failed to update')
      queryClient.invalidateQueries({ queryKey: ['employees-commissions'] })
      toast.success('Commission updated')
      setEditingCommission(null)
    } catch {
      toast.error('Failed to update commission')
    } finally {
      setCommEditSaving(false)
    }
  }

  const commissionsTotal = commissions.reduce((sum, c) => sum + (c.amount ?? 0), 0)
  const currentYear = new Date().getFullYear()
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const TAB_DEFS = [
    { value: 'employees',        label: 'Employees',       icon: Users },
    { value: 'clock',            label: 'Clock In/Out',    icon: Clock },
    { value: 'shifts',           label: 'Shifts',          icon: CalendarDays },
    { value: 'payroll',          label: 'Payroll',         icon: DollarSign },
    { value: 'commissions',      label: 'Commissions',     icon: TrendingUp },
    { value: 'purchases',        label: 'Purchases',       icon: ShoppingBag },
    { value: 'employee-report',  label: 'Employee Report', icon: BarChart2 },
  ] as const

  return (
    <div className="space-y-0">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalEmployees} {totalEmployees === 1 ? 'employee' : 'employees'} across all roles</p>
        </div>
        <Button onClick={openCreateSheet} size="default">
          <Plus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
        {/* ── Tab bar ── */}
        <div className="border-b border-gray-200 mb-6">
          <Tabs.List className="flex gap-0 overflow-x-auto no-scrollbar -mb-px">
            {TAB_DEFS.map(({ value, label, icon: Icon }) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className={[
                  'group relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors outline-none',
                  'border-b-2 -mb-px',
                  'data-[state=active]:border-brand-teal data-[state=active]:text-brand-teal',
                  'data-[state=inactive]:border-transparent data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-800 data-[state=inactive]:hover:border-gray-300',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        {/* ── Employees ── */}
        <Tabs.Content value="employees" className="">
          <DataTable data={employees} columns={empColumns} isLoading={loadingEmployees} totalCount={totalEmployees} pageIndex={empPage} pageSize={empPageSize} onPageChange={setEmpPage} onPageSizeChange={(s) => { setEmpPageSize(s); setEmpPage(0) }} emptyMessage="No employees yet." />
        </Tabs.Content>

        {/* ── Clock In/Out ── */}
        <Tabs.Content value="clock" className="">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="w-56">
              {activeBranch && (
                <AsyncEmployeeSelect
                  branchId={activeBranch.id}
                  value={clockEmployeeFilter}
                  onChange={setClockEmployeeFilter}
                  label="Employee"
                  placeholder="All employees"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={clockMonthFilter}
                onChange={e => setClockMonthFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
              >
                <option value="">All months</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={clockYearFilter}
                onChange={e => setClockYearFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
              >
                <option value="">All years</option>
                {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {(clockEmployeeFilter || clockMonthFilter !== nowMonth || clockYearFilter !== nowYear) && (
              <Button size="sm" variant="outline" onClick={() => { setClockEmployeeFilter(''); setClockMonthFilter(nowMonth); setClockYearFilter(nowYear) }}>
                Clear Filters
              </Button>
            )}
          </div>
          <div className="mb-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-2 text-sm inline-block">
            <span className="text-gray-600">Total hours worked (filtered): </span>
            <span className="font-bold text-blue-700">{clockHistoryTotalLabel}</span>
          </div>
          <DataTable data={clockHistory} columns={clockColumns} isLoading={loadingClockHistory} emptyMessage="No attendance records found for this filter." />
        </Tabs.Content>

        {/* ── Shifts ── */}
        <Tabs.Content value="shifts" className="">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => { setEditingShift(null); shiftForm.reset(); setSelectedDays([]); setShiftSheetOpen(true) }}>
              <Plus className="h-4 w-4" /> Add Shift
            </Button>
          </div>
          <DataTable data={shifts} columns={shiftColumns} isLoading={loadingShifts} emptyMessage="No shifts defined." />
        </Tabs.Content>

        {/* ── Payroll ── */}
        <Tabs.Content value="payroll" className="">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setPayrollSheetOpen(true)}>
              <Plus className="h-4 w-4" /> Create Period
            </Button>
          </div>
          <DataTable data={payrolls} columns={payrollColumns} isLoading={loadingPayroll} emptyMessage="No payroll periods." />
        </Tabs.Content>

        {/* ── Commissions ── */}
        <Tabs.Content value="commissions" className="">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="w-56">
              {activeBranch && (
                <AsyncEmployeeSelect
                  branchId={activeBranch.id}
                  value={commEmployeeFilter}
                  onChange={setCommEmployeeFilter}
                  label="Employee"
                  placeholder="All employees"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={commMonthFilter}
                onChange={e => setCommMonthFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
              >
                <option value="">All months</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={commYearFilter}
                onChange={e => setCommYearFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
              >
                <option value="">All years</option>
                {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {(commEmployeeFilter || commMonthFilter !== nowMonth || commYearFilter !== nowYear) && (
              <Button size="sm" variant="outline" onClick={() => { setCommEmployeeFilter(''); setCommMonthFilter(nowMonth); setCommYearFilter(nowYear) }}>
                Clear Filters
              </Button>
            )}
            <div className="ml-auto rounded-lg bg-green-50 border border-green-100 px-4 py-2 text-sm">
              <span className="text-gray-600">Total commission: </span>
              <span className="font-bold text-green-700">{formatCurrency(commissionsTotal)}</span>
            </div>
          </div>
          <DataTable data={commissions} columns={commColumns} isLoading={loadingCommissions} emptyMessage="No commissions recorded." />
        </Tabs.Content>

        {/* ── Employee Purchases ── */}
        <Tabs.Content value="purchases" className="">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-56">
              {activeBranch && (
                <AsyncEmployeeSelect
                  branchId={activeBranch.id}
                  value={purchaseEmployeeFilter}
                  onChange={setPurchaseEmployeeFilter}
                  label="Employee"
                  placeholder="All employees"
                />
              )}
            </div>
            {purchaseEmployeeFilter && (
              <Button size="sm" variant="outline" onClick={() => setPurchaseEmployeeFilter('')}>Clear</Button>
            )}
            <div className="ml-auto rounded-lg bg-red-50 border border-red-100 px-4 py-2 text-sm">
              <span className="text-gray-600">Total outstanding: </span>
              <span className="font-bold text-red-700">
                {formatCurrency(employeePurchases.filter(p => getPurchaseSettlementStatus(p) === 'pending').reduce((s, p) => s + Math.max(0, p.total - (p.amount_paid ?? 0)), 0))}
              </span>
            </div>
          </div>

          <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-700">
            Outstanding purchases are automatically deducted when a payroll period is marked <strong>Paid</strong>. Use <strong>Settle Directly</strong> only for out-of-payroll cash/card payments.
          </div>

          {loadingPurchases ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : employeePurchases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
              No employee purchases found
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
              {employeePurchases.map(p => {
                const outstanding = Math.max(0, p.total - (p.amount_paid ?? 0))
                const settlementStatus = getPurchaseSettlementStatus(p)
                const method = settleMethod[p.id] ?? 'cash'
                return (
                  <div key={p.id} className={`flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50/50 ${settlementStatus !== 'pending' ? 'opacity-60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {p.employees ? `${p.employees.first_name} ${p.employees.last_name ?? ''}` : '—'}
                        </span>
                        {settlementStatus === 'payroll' && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 font-medium">Settled via Payroll</span>
                        )}
                        {settlementStatus === 'direct' && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 font-medium">Settled Directly</span>
                        )}
                        {settlementStatus === 'pending' && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium">Pending</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatDateTime(p.created_at)}
                        {p.sale_items && p.sale_items.length > 0 && (
                          <span className="ml-2">{p.sale_items.map(i => `${i.name} ×${i.quantity}`).join(', ')}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(p.total)}</p>
                      {settlementStatus === 'pending' && <p className="text-xs text-red-600">Owed: {formatCurrency(outstanding)}</p>}
                    </div>
                    {settlementStatus === 'pending' && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <select
                          value={method}
                          onChange={e => setSettleMethod(prev => ({ ...prev, [p.id]: e.target.value as 'cash' | 'card' }))}
                          className="h-7 rounded border border-gray-200 px-1.5 text-xs text-gray-700 focus:outline-none"
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                        </select>
                        <button
                          onClick={() => settlePurchase(p.id, outstanding, method)}
                          disabled={settlingPurchase === p.id}
                          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {settlingPurchase === p.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <CheckCircle2 className="h-3 w-3" />}
                          Settle Directly
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Tabs.Content>

        {/* ── Employee Report ── */}
        <Tabs.Content value="employee-report" className="">
          {activeBranch && <EmployeeReportTab branchId={activeBranch.id} />}
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
          <div className="grid grid-cols-2 gap-3">
            <Input label="Monthly Base Salary" type="number" step="0.01" min="0" placeholder="0.00" {...register('base_salary')} />
            <Input label="Hourly Rate" type="number" step="0.01" min="0" placeholder="0.00" {...register('hourly_rate')} />
          </div>
          <p className="text-xs text-gray-400 -mt-2">Set one or both. Base salary is pro-rated for partial months.</p>
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

      {/* ── Edit Commission Modal ── */}
      <Modal
        open={!!editingCommission}
        onClose={() => setEditingCommission(null)}
        title="Edit Commission"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{currency}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={commEditAmount}
                onChange={(e) => setCommEditAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Status</label>
            <select
              value={commEditStatus}
              onChange={(e) => setCommEditStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setEditingCommission(null)} disabled={commEditSaving}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveCommissionEdit} disabled={commEditSaving}>
              {commEditSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesPageInner />
    </Suspense>
  )
}
