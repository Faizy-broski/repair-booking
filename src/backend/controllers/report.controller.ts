import { NextRequest } from 'next/server'
import { z } from 'zod'
import { type RequestContext } from '@/backend/middleware'
import { ReportService } from '@/backend/services/report.service'
import { ok, serverError, badRequest } from '@/backend/utils/api-response'

function defaultRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
  return { from, to }
}

const openSessionSchema = z.object({
  opening_float: z.number().min(0),
  branch_id: z.string().uuid().optional(),
  opening_note: z.string().optional(),
  opening_denominations: z.record(z.string(), z.number()).optional(),
})

const closeSessionSchema = z.object({
  session_id: z.string().uuid(),
  closing_cash: z.number().min(0),
  closing_note: z.string().optional(),
})

const cashMovementSchema = z.object({
  session_id: z.string().uuid(),
  type: z.enum(['cash_in', 'cash_out']),
  amount: z.number().positive(),
  payment_type: z.string().optional(),
  notes: z.string().optional(),
})

const savedReportSchema = z.object({
  name: z.string().min(1).max(120),
  report_type: z.enum(['sales', 'repairs', 'inventory', 'employees', 'custom']).default('custom'),
  config: z.object({}).passthrough().default({}),
})

export const ReportController = {
  async get(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const defaults = defaultRange()
    const from = searchParams.get('from') ?? defaults.from
    const to = searchParams.get('to') ?? defaults.to
    const type = searchParams.get('type') ?? 'summary'

    try {
      if (type === 'sales') {
        const data = await ReportService.getSalesReport(branchId, from, to)
        return ok(data)
      }
      if (type === 'repairs') {
        const data = await ReportService.getRepairsReport(branchId, from, to)
        return ok(data)
      }
      if (type === 'profit_loss') {
        const data = await ReportService.getProfitLoss(branchId, from, to)
        return ok(data)
      }
      if (type === 'inventory') {
        const data = await ReportService.getInventoryReport(branchId)
        return ok(data)
      }
      if (type === 'payment_methods') {
        const data = await ReportService.getPaymentMethodsReport(branchId, from, to)
        return ok(data)
      }
      if (type === 'tax') {
        const data = await ReportService.getTaxReport(branchId, from, to)
        return ok(data)
      }
      if (type === 'branch_revenue') {
        const data = await ReportService.getRevenuByBranch(ctx.businessId, from, to)
        return ok(data)
      }
      if (type === 'sessions') {
        const data = await ReportService.listSessions(branchId, from, to)
        return ok(data)
      }
      // Default: combined summary
      const [sales, repairs, profitLoss] = await Promise.all([
        ReportService.getSalesReport(branchId, from, to),
        ReportService.getRepairsReport(branchId, from, to),
        ReportService.getProfitLoss(branchId, from, to),
      ])
      return ok({ sales, repairs, profitLoss, from, to })
    } catch (err) {
      return serverError('Failed to generate report', err)
    }
  },

  // ── Employee reports ──────────────────────────────────────────────────────

  async getEmployeeReports(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const defaults = defaultRange()
    const from = searchParams.get('from') ?? defaults.from
    const to = searchParams.get('to') ?? defaults.to
    const subtype = searchParams.get('subtype') ?? 'productivity'

    try {
      if (subtype === 'productivity') {
        const data = await ReportService.getEmployeeProductivityReport(branchId, from, to)
        return ok(data)
      }
      return badRequest('Unknown subtype')
    } catch (err) {
      return serverError('Failed to generate employee report', err)
    }
  },

  // ── Inventory detail reports ──────────────────────────────────────────────

  async getInventoryDetailReports(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const defaults = defaultRange()
    const from = searchParams.get('from') ?? defaults.from
    const to = searchParams.get('to') ?? defaults.to
    const subtype = searchParams.get('subtype') ?? 'summary'

    try {
      if (subtype === 'summary') {
        const data = await ReportService.getInventorySummaryReport(branchId)
        return ok(data)
      }
      if (subtype === 'parts_consumption') {
        const data = await ReportService.getPartConsumptionReport(branchId, from, to)
        return ok(data)
      }
      if (subtype === 'adjustments') {
        const data = await ReportService.getInventoryAdjustmentsReport(branchId, from, to)
        return ok(data)
      }
      if (subtype === 'low_stock') {
        const data = await ReportService.getLowStockReport(branchId)
        return ok(data)
      }
      return badRequest('Unknown subtype')
    } catch (err) {
      return serverError('Failed to generate inventory report', err)
    }
  },

  // ── Register / POS session ────────────────────────────────────────────────

  async openSession(request: NextRequest, ctx: RequestContext) {
    const body = await request.json()
    const parsed = openSessionSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.message)
    try {
      const branchId = parsed.data.branch_id ?? ctx.auth.branchId ?? null
      if (!branchId) return badRequest('branch_id is required')
      const data = await ReportService.openSession(
        ctx.businessId,
        branchId,
        ctx.auth.userId,
        parsed.data.opening_float,
        parsed.data.opening_note,
        parsed.data.opening_denominations,
      )
      return ok(data)
    } catch (err: any) {
      return serverError(err?.message ?? 'Failed to open session', err)
    }
  },

  async joinSession(request: NextRequest, ctx: RequestContext) {
    const body = await request.json()
    const sessionId = body?.session_id
    if (!sessionId) return badRequest('session_id is required')
    try {
      const data = await ReportService.joinSession(sessionId, ctx.auth.userId)
      return ok(data)
    } catch (err: any) {
      return serverError(err?.message ?? 'Failed to join session', err)
    }
  },

  async closeSession(request: NextRequest, ctx: RequestContext) {
    const body = await request.json()
    const parsed = closeSessionSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.message)
    try {
      const data = await ReportService.closeSession(parsed.data.session_id, parsed.data.closing_cash, parsed.data.closing_note)
      return ok(data)
    } catch (err: any) {
      return serverError(err?.message ?? 'Failed to close session', err)
    }
  },

  async addCashMovement(request: NextRequest, ctx: RequestContext) {
    const body = await request.json()
    const parsed = cashMovementSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.message)
    try {
      const branchId = ctx.auth.branchId
      if (!branchId) return badRequest('branch_id required')
      const data = await ReportService.addCashMovement({
        sessionId: parsed.data.session_id,
        branchId,
        businessId: ctx.businessId,
        cashierId: ctx.auth.userId,
        type: parsed.data.type,
        amount: parsed.data.amount,
        paymentType: parsed.data.payment_type,
        notes: parsed.data.notes,
      })
      return ok(data)
    } catch (err: any) {
      return serverError(err?.message ?? 'Failed to record cash movement', err)
    }
  },

  async listCashMovements(request: NextRequest, _ctx: RequestContext) {
    const sessionId = request.nextUrl.searchParams.get('session_id')
    if (!sessionId) return badRequest('session_id is required')
    try {
      const data = await ReportService.listCashMovements(sessionId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to list cash movements', err)
    }
  },

  async getCurrentSession(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const data = await ReportService.getCurrentSession(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to get session', err)
    }
  },

  // ── Saved Reports ─────────────────────────────────────────────────────────

  async listSavedReports(_request: NextRequest, ctx: RequestContext) {
    try {
      const data = await ReportService.getSavedReports(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to list saved reports', err)
    }
  },

  async createSavedReport(request: NextRequest, ctx: RequestContext) {
    const body = await request.json()
    const parsed = savedReportSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.message)
    try {
      const data = await ReportService.createSavedReport(ctx.businessId, ctx.auth.userId, parsed.data)
      return ok(data)
    } catch (err) {
      return serverError('Failed to save report', err)
    }
  },

  async updateSavedReport(request: NextRequest, ctx: RequestContext) {
    const id = request.nextUrl.pathname.split('/').at(-1) ?? ''
    const body = await request.json()
    try {
      const data = await ReportService.updateSavedReport(id, ctx.businessId, body)
      return ok(data)
    } catch (err) {
      return serverError('Failed to update saved report', err)
    }
  },

  async deleteSavedReport(request: NextRequest, ctx: RequestContext) {
    const id = request.nextUrl.pathname.split('/').at(-1) ?? ''
    try {
      await ReportService.deleteSavedReport(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete saved report', err)
    }
  },
}

