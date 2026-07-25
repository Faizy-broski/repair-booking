import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { BranchService } from '@/backend/services/branch.service'
import { UserService } from '@/backend/services/user.service'
import { ok, created, notFound, forbidden, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { PlanLimitService } from '@/backend/services/plan-limit.service'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  logo_url: z.string().url().optional().nullable().or(z.literal('')),
  manager_full_name: z.string().min(1),
  manager_email: z.string().email(),
  manager_password: z.string().min(6),
  manager_role: z.enum(['cashier', 'staff', 'branch_manager']),
})

const updateSchema = createSchema.partial().extend({
  pos_require_shift: z.boolean().nullable().optional(),
})

export const BranchController = {
  async list(request: NextRequest, ctx: RequestContext) {
    try {
      const data = await BranchService.listByBusiness(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch branches', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const branchLimitCheck = await PlanLimitService.checkLimit(ctx.businessId, 'max_branches')
      if (!branchLimitCheck.allowed) {
        const limitMsg = branchLimitCheck.limit != null
          ? `Your plan allows ${branchLimitCheck.limit} branch${branchLimitCheck.limit === 1 ? '' : 'es'}.`
          : (branchLimitCheck.reason ?? 'Upgrade your plan to add more branches.')
        return forbidden(`Branch limit reached. ${limitMsg}`, 'LIMIT_REACHED')
      }

      const userLimitCheck = await PlanLimitService.checkLimit(ctx.businessId, 'max_users')
      if (!userLimitCheck.allowed) {
        return forbidden(`User limit reached. Your plan allows ${userLimitCheck.limit} user${userLimitCheck.limit === 1 ? '' : 's'}.`, 'LIMIT_REACHED')
      }

      const { manager_full_name, manager_email, manager_password, manager_role, ...branchData } = data
      const branch = await BranchService.create({
        ...branchData,
        email: branchData.email || null,
        logo_url: branchData.logo_url || null,
        business_id: ctx.businessId,
      })

      try {
        const user = await UserService.create({
          email: manager_email,
          password: manager_password,
          full_name: manager_full_name,
          role: manager_role,
          branch_id: branch.id,
          business_id: ctx.businessId,
        })
        return created({ branch, user })
      } catch (userErr) {
        await BranchService.remove(branch.id).catch(() => {})
        const code = (userErr as any)?.code ?? ''
        const msg  = (userErr instanceof Error ? userErr.message : String(userErr)).toLowerCase()
        if (code === 'email_exists' || msg.includes('already been registered') || msg.includes('already registered') || msg.includes('already exists')) {
          return badRequest('An account with this email address is already registered.')
        }
        return serverError('Failed to create branch user', userErr)
      }
    } catch (err) {
      return serverError('Failed to create branch', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      // Verify branch belongs to business
      const existing = await BranchService.getById(id)
      if (!existing || existing.business_id !== ctx.businessId) return forbidden('Branch not found')

      const branch = await BranchService.update(id, {
        ...data,
        email: data.email || null,
        logo_url: data.logo_url || null,
      })
      return ok(branch)
    } catch (err) {
      return serverError('Failed to update branch', err)
    }
  },

  async deactivate(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const existing = await BranchService.getById(id)
      if (!existing || existing.business_id !== ctx.businessId) return forbidden('Branch not found')
      if (existing.is_main) return forbidden('Cannot deactivate main branch')

      const branch = await BranchService.update(id, { is_active: false })
      return ok(branch)
    } catch (err) {
      return serverError('Failed to deactivate branch', err)
    }
  },
}
