import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { EmployeeService } from '@/backend/services/employee.service'
import { ok, created, notFound, badRequest, serverError, forbidden } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { PlanLimitService } from '@/backend/services/plan-limit.service'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const createSchema = z.object({
  branch_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  hourly_rate: z.number().min(0).optional().nullable(),
  base_salary: z.number().min(0).optional().nullable(),
  hire_date: z.string().optional().nullable(),
  access_pin: z.string().regex(/^\d{4,6}$/).optional().nullable().or(z.literal('')),
})

const updateSchema = createSchema.partial().omit({ branch_id: true })

const clockSchema = z.object({
  branch_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  action: z.enum(['clock_in', 'clock_out', 'manual']),
  // Only used when action === 'manual' — lets a manager mark attendance
  // directly (e.g. employee forgot to clock in, or backfilling a past day).
  clock_in: z.string().datetime().optional(),
  clock_out: z.string().datetime().optional().nullable(),
  break_minutes: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
})

export const EmployeeController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return ok([], { page: 1, limit: 20, total: 0 })
    const { page, limit } = getPagination(request.nextUrl.searchParams)
    try {
      const { data, count } = await EmployeeService.list(branchId, page, limit)
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch employees', err)
    }
  },

  async search(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const q = request.nextUrl.searchParams.get('q') ?? ''
    if (!branchId) return ok([])
    try {
      const data = await EmployeeService.search(branchId, q.trim())
      return ok(data)
    } catch (err) {
      return serverError('Failed to search employees', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? null
    if (!branchId) return ok(null)
    try {
      const employee = await EmployeeService.getById(id, branchId)
      if (!employee) return notFound('Employee not found')
      return ok(employee)
    } catch (err) {
      return serverError('Failed to fetch employee', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const limitCheck = await PlanLimitService.checkLimit(ctx.businessId, 'max_employees')
      if (!limitCheck.allowed) {
        return forbidden(`Employee limit reached. Your plan allows ${limitCheck.limit} employee${limitCheck.limit === 1 ? '' : 's'}.`)
      }
      const email = data.email || null
      if (email) {
        const isUnique = await EmployeeService.checkEmailUnique(email, data.branch_id)
        if (!isUnique) return badRequest('An employee with this email already exists.')
      }
      const employee = await EmployeeService.create({
        ...data,
        email,
        access_pin: data.access_pin || null,
      })
      return created(employee)
    } catch (err) {
      return serverError('Failed to create employee', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    // branch_id comes from the URL query param (?branch_id=...) — same pattern as list/getById.
    // ctx.auth.branchId is only set for staff tied to a specific branch; owners have it null.
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id query param is required')
    try {
      const email = data.email || null
      if (email) {
        const isUnique = await EmployeeService.checkEmailUnique(email, branchId, id)
        if (!isUnique) return badRequest('An employee with this email already exists.')
      }
      const employee = await EmployeeService.update(id, branchId, {
        ...data,
        email,
        access_pin: data.access_pin || null,
      })
      return ok(employee)
    } catch (err) {
      return serverError('Failed to update employee', err)
    }
  },

  async delete(request: NextRequest, ctx: RequestContext, id: string) {
    // Same pattern: branch_id in query string
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id query param is required')
    try {
      const employee = await EmployeeService.delete(id, branchId)
      return ok(employee)
    } catch (err) {
      return serverError('Failed to delete employee', err)
    }
  },

  async clock(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, clockSchema)
    if (error) return error
    try {
      if (data.action === 'clock_in') {
        const record = await EmployeeService.clockIn(data.branch_id, data.employee_id)
        return created(record)
      } else if (data.action === 'clock_out') {
        const record = await EmployeeService.clockOut(data.branch_id, data.employee_id)
        return ok(record)
      } else {
        if (!data.clock_in) return badRequest('clock_in is required for manual entries')
        const record = await EmployeeService.createManualClockEntry(
          data.branch_id, data.employee_id, data.clock_in,
          data.clock_out ?? null, data.break_minutes ?? 0, data.notes ?? null
        )
        return created(record)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Clock action failed'
      return badRequest(msg)
    }
  },

  async getTimeLogs(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId
    if (!branchId) return ok([])
    const date = searchParams.get('date') ?? undefined
    const employeeId = searchParams.get('employee_id') ?? undefined
    const monthParam = searchParams.get('month')
    const yearParam = searchParams.get('year')
    const month = monthParam ? parseInt(monthParam, 10) : undefined
    const year = yearParam ? parseInt(yearParam, 10) : undefined
    try {
      const data = await EmployeeService.getTimeLogs(branchId, { date, employeeId, month, year })
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch time logs', err)
    }
  },
}
