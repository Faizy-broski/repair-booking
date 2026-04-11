import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { BranchService } from '@/backend/services/branch.service'
import { ok, created, notFound, forbidden, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  logo_url: z.string().url().optional().nullable().or(z.literal('')),
})

const updateSchema = createSchema.partial()

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
      const branch = await BranchService.create({
        ...data,
        email: data.email || null,
        logo_url: data.logo_url || null,
        business_id: ctx.businessId,
      })
      return created(branch)
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
