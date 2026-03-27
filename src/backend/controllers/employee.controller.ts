import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { EmployeeService } from '@/backend/services/employee.service'
import { ok, created, notFound, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const createSchema = z.object({
  branch_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  hourly_rate: z.number().min(0).optional().nullable(),
  hire_date: z.string().optional().nullable(),
})

const updateSchema = createSchema.partial().omit({ branch_id: true })

const clockSchema = z.object({
  branch_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  action: z.enum(['clock_in', 'clock_out']),
})

export const EmployeeController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const data = await EmployeeService.list(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch employees', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? ''
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
      const employee = await EmployeeService.create({
        ...data,
        email: data.email || null,
      })
      return created(employee)
    } catch (err) {
      return serverError('Failed to create employee', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    const branchId = ctx.auth.branchId ?? ''
    try {
      const employee = await EmployeeService.update(id, branchId, {
        ...data,
        email: data.email || null,
      })
      return ok(employee)
    } catch (err) {
      return serverError('Failed to update employee', err)
    }
  },

  async clock(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, clockSchema)
    if (error) return error
    try {
      if (data.action === 'clock_in') {
        const record = await EmployeeService.clockIn(data.branch_id, data.employee_id)
        return created(record)
      } else {
        const record = await EmployeeService.clockOut(data.branch_id, data.employee_id)
        return ok(record)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Clock action failed'
      return badRequest(msg)
    }
  },

  async getTimeLogs(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    const date = searchParams.get('date') ?? undefined
    try {
      const data = await EmployeeService.getTimeLogs(branchId, date)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch time logs', err)
    }
  },
}
