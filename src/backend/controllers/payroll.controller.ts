import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { PayrollService, CommissionService, ShiftService, PermissionService } from '@/backend/services/payroll.service'
import { ActivityLogService, IpWhitelistService } from '@/backend/services/activity-log.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

// ── Payroll ───────────────────────────────────────────────────────────────────

const payrollCreateSchema = z.object({
  branch_id:   z.string().uuid(),
  employee_id: z.string().uuid(),
  start_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:       z.string().optional(),
})

export const PayrollController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId   = searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    const employeeId = searchParams.get('employee_id') ?? undefined
    try {
      const data = await PayrollService.list(branchId, employeeId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch payroll', err)
    }
  },

  async preview(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const employeeId = searchParams.get('employee_id') ?? ''
    const branchId   = searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    const startDate  = searchParams.get('start_date') ?? ''
    const endDate    = searchParams.get('end_date') ?? ''
    try {
      const data = await PayrollService.calculate(employeeId, branchId, ctx.businessId, startDate, endDate)
      return ok(data)
    } catch (err) {
      return serverError('Failed to calculate payroll', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, payrollCreateSchema)
    if (error) return error
    try {
      const period = await PayrollService.create(ctx.businessId, data.branch_id, data.employee_id, data.start_date, data.end_date, data.notes)
      return created(period)
    } catch (err) {
      return serverError('Failed to create payroll period', err)
    }
  },

  async approve(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const period = await PayrollService.approve(id, ctx.auth.branchId ?? undefined, ctx.auth.userId)
      return ok(period)
    } catch (err) {
      return serverError('Failed to approve payroll', err)
    }
  },

  async markPaid(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const period = await PayrollService.markPaid(id, ctx.auth.branchId ?? undefined)
      return ok(period)
    } catch (err) {
      return serverError('Failed to mark payroll as paid', err)
    }
  },
}

// ── Commission Rules ──────────────────────────────────────────────────────────

const ruleSchema = z.object({
  name:       z.string().min(1),
  applies_to: z.enum(['all', 'sales', 'repairs']).default('all'),
  rate_type:  z.enum(['percent', 'flat']).default('percent'),
  rate:       z.number().min(0),
  min_amount: z.number().min(0).optional(),
})

export const CommissionController = {
  async listRules(request: NextRequest, ctx: RequestContext) {
    try {
      const data = await CommissionService.listRules(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch commission rules', err)
    }
  },

  async createRule(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, ruleSchema)
    if (error) return error
    try {
      const rule = await CommissionService.createRule({ ...data, business_id: ctx.businessId })
      return created(rule)
    } catch (err) {
      return serverError('Failed to create commission rule', err)
    }
  },

  async updateRule(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, ruleSchema.partial())
    if (error) return error
    try {
      const rule = await CommissionService.updateRule(id, ctx.businessId, data)
      return ok(rule)
    } catch (err) {
      return serverError('Failed to update commission rule', err)
    }
  },

  async removeRule(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await CommissionService.removeRule(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to remove commission rule', err)
    }
  },

  async listAll(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const { page, limit } = getPagination(searchParams)
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    try {
      const { data, total } = await CommissionService.listAll(ctx.businessId, branchId, page, limit)
      return ok(data, { page, limit, total })
    } catch (err) {
      return serverError('Failed to fetch commissions', err)
    }
  },

  async listForEmployee(request: NextRequest, ctx: RequestContext, employeeId: string) {
    const { page, limit } = getPagination(request.nextUrl.searchParams)
    try {
      const { data, total } = await CommissionService.listForEmployee(employeeId, ctx.businessId, page, limit)
      return ok(data, { page, limit, total })
    } catch (err) {
      return serverError('Failed to fetch employee commissions', err)
    }
  },
}

// ── Shifts ────────────────────────────────────────────────────────────────────

const shiftSchema = z.object({
  name:         z.string().min(1),
  branch_id:    z.string().uuid(),
  start_time:   z.string().regex(/^\d{2}:\d{2}$/),
  end_time:     z.string().regex(/^\d{2}:\d{2}$/),
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1),
})

const assignSchema = z.object({
  employee_id:    z.string().uuid(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const ShiftController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    try {
      const data = await ShiftService.list(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch shifts', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, shiftSchema)
    if (error) return error
    try {
      const shift = await ShiftService.create({ ...data, business_id: ctx.businessId })
      return created(shift)
    } catch (err) {
      return serverError('Failed to create shift', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, shiftSchema.partial().omit({ branch_id: true }))
    if (error) return error
    const branchId = ctx.auth.branchId ?? undefined
    try {
      const shift = await ShiftService.update(id, branchId, data)
      return ok(shift)
    } catch (err) {
      return serverError('Failed to update shift', err)
    }
  },

  async remove(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await ShiftService.remove(id, ctx.auth.branchId ?? undefined)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete shift', err)
    }
  },

  async assignEmployee(request: NextRequest, ctx: RequestContext, shiftId: string) {
    const { data, error } = await validateBody(request, assignSchema)
    if (error) return error
    try {
      const assignment = await ShiftService.assignEmployee(shiftId, data.employee_id, data.effective_from)
      return created(assignment)
    } catch (err) {
      return serverError('Failed to assign employee to shift', err)
    }
  },

  async removeAssignment(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await ShiftService.removeAssignment(id)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to remove assignment', err)
    }
  },
}

// ── Role Permissions ──────────────────────────────────────────────────────────

const permissionRowSchema = z.object({
  role:         z.string().min(1),
  module:       z.string().min(1),
  action:       z.string().min(1),
  allowed:      z.boolean(),
  requires_pin: z.boolean().optional(),
})

const bulkPermissionSchema = z.object({ permissions: z.array(permissionRowSchema) })

export const PermissionController = {
  async list(request: NextRequest, ctx: RequestContext) {
    try {
      const data = await PermissionService.list(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch permissions', err)
    }
  },

  async bulkSave(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, bulkPermissionSchema)
    if (error) return error
    try {
      await PermissionService.bulkUpsert(ctx.businessId, data.permissions)
      return ok({ saved: true })
    } catch (err) {
      return serverError('Failed to save permissions', err)
    }
  },
}

// ── Activity Log ──────────────────────────────────────────────────────────────

export const ActivityLogController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, total } = await ActivityLogService.list(ctx.businessId, {
        userId:    searchParams.get('user_id') ?? undefined,
        module:    searchParams.get('module') ?? undefined,
        action:    searchParams.get('action') ?? undefined,
        startDate: searchParams.get('start_date') ?? undefined,
        endDate:   searchParams.get('end_date') ?? undefined,
        page,
        limit,
      })
      return ok(data, { page, limit, total })
    } catch (err) {
      return serverError('Failed to fetch activity log', err)
    }
  },
}

// ── IP Whitelist ──────────────────────────────────────────────────────────────

const ipSchema = z.object({
  profile_id: z.string().uuid(),
  ip_address: z.string().min(7),
  label:      z.string().optional(),
})

export const IpWhitelistController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const profileId = request.nextUrl.searchParams.get('profile_id')
    try {
      const data = profileId
        ? await IpWhitelistService.list(ctx.businessId, profileId)
        : await IpWhitelistService.listForBusiness(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch IP whitelist', err)
    }
  },

  async add(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, ipSchema)
    if (error) return error
    try {
      const entry = await IpWhitelistService.add(ctx.businessId, data.profile_id, data.ip_address, data.label)
      return created(entry)
    } catch (err) {
      return serverError('Failed to add IP', err)
    }
  },

  async remove(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await IpWhitelistService.remove(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to remove IP', err)
    }
  },
}
