import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { OtherIncomeService } from '@/backend/services/other-income.service'
import { ok, created, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const createOtherIncomeSchema = z.object({
  branch_id: z.string().uuid(),
  category_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  amount: z.number().positive(),
  income_date: z.string(),
  notes: z.string().optional().nullable(),
})

export const OtherIncomeController = {
  async listOtherIncome(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await OtherIncomeService.list(branchId, {
        page,
        limit,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch other income', err)
    }
  },

  async createOtherIncome(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createOtherIncomeSchema)
    if (error) return error
    try {
      const entry = await OtherIncomeService.create({ ...data, created_by: ctx.auth.userId })
      return created(entry)
    } catch (err) {
      return serverError('Failed to create other income', err)
    }
  },

  async updateOtherIncome(request: NextRequest, ctx: RequestContext, id: string) {
    const updateSchema = z.object({
      title: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      income_date: z.string().optional(),
      category_id: z.string().uuid().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    const businessId = ctx.businessId
    try {
      const updated = await OtherIncomeService.update(id, businessId, data)
      return ok(updated)
    } catch (err) {
      return serverError('Failed to update other income', err)
    }
  },

  async deleteOtherIncome(request: NextRequest, ctx: RequestContext, id: string) {
    const businessId = ctx.businessId
    try {
      await OtherIncomeService.delete(id, businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete other income', err)
    }
  },

  async listCategories(request: NextRequest, ctx: RequestContext) {
    const businessId = request.nextUrl.searchParams.get('business_id') ?? ctx.auth.businessId ?? null
    if (!businessId) return badRequest('business_id is required')
    try {
      const data = await OtherIncomeService.getCategories(businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch other income categories', err)
    }
  },

  async createCategory(request: NextRequest, ctx: RequestContext) {
    const categorySchema = z.object({ name: z.string().min(1), business_id: z.string().uuid() })
    const { data, error } = await validateBody(request, categorySchema)
    if (error) return error
    try {
      const category = await OtherIncomeService.createCategory(data.business_id, data.name)
      return created(category)
    } catch (err) {
      return serverError('Failed to create other income category', err)
    }
  },
}
