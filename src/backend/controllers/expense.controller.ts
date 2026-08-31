import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { ExpenseService } from '@/backend/services/expense.service'
import { ok, created, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const createExpenseSchema = z.object({
  branch_id: z.string().uuid(),
  category_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  amount: z.number().positive(),
  expense_date: z.string(),
  payment_method: z.enum(['cash', 'card']).default('cash'),
  receipt_url: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const createSalarySchema = z.object({
  branch_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  amount: z.number().positive(),
  pay_date: z.string(),
  pay_period: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const ExpenseController = {
  async listExpenses(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await ExpenseService.list(branchId, {
        page,
        limit,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch expenses', err)
    }
  },

  async createExpense(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createExpenseSchema)
    if (error) return error
    try {
      const expense = await ExpenseService.create({ ...data, created_by: ctx.auth.userId })
      return created(expense)
    } catch (err) {
      return serverError('Failed to create expense', err)
    }
  },

  async updateExpense(request: NextRequest, ctx: RequestContext, id: string) {
    const updateSchema = z.object({
      title: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      expense_date: z.string().optional(),
      category_id: z.string().uuid().optional().nullable(),
      payment_method: z.enum(['cash', 'card']).optional(),
      notes: z.string().optional().nullable(),
    })
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    const businessId = ctx.businessId
    try {
      const updated = await ExpenseService.update(id, businessId, data)
      return ok(updated)
    } catch (err) {
      return serverError('Failed to update expense', err)
    }
  },

  async deleteExpense(request: NextRequest, ctx: RequestContext, id: string) {
    const businessId = ctx.businessId
    try {
      await ExpenseService.delete(id, businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete expense', err)
    }
  },

  async listSalaries(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const data = await ExpenseService.getSalaries(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch salaries', err)
    }
  },

  async createSalary(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSalarySchema)
    if (error) return error
    try {
      const salary = await ExpenseService.createSalary({ ...data, created_by: ctx.auth.userId })
      return created(salary)
    } catch (err) {
      return serverError('Failed to create salary', err)
    }
  },

  async listCategories(request: NextRequest, ctx: RequestContext) {
    const businessId = request.nextUrl.searchParams.get('business_id') ?? ctx.auth.businessId ?? null
    if (!businessId) return badRequest('business_id is required')
    try {
      const data = await ExpenseService.getCategories(businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch expense categories', err)
    }
  },

  async createCategory(request: NextRequest, ctx: RequestContext) {
    const categorySchema = z.object({ name: z.string().min(1), business_id: z.string().uuid() })
    const { data, error } = await validateBody(request, categorySchema)
    if (error) return error
    try {
      const category = await ExpenseService.createCategory(data.business_id, data.name)
      return created(category)
    } catch (err) {
      return serverError('Failed to create expense category', err)
    }
  },
}
