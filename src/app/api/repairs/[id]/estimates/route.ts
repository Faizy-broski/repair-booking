import { withMiddleware } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { RepairEstimateService } from '@/backend/services/repair-estimate.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const estimateItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().min(0),
  total: z.number().min(0),
})

const createSchema = z.object({
  customer_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  items: z.array(estimateItemSchema).min(1),
  total: z.number().min(0),
  customer_note: z.string().optional().nullable(),
})

async function listHandler(req: NextRequest, ctx: RequestContext, repairId: string) {
  try {
    const estimates = await RepairEstimateService.list(repairId)
    return ok(estimates)
  } catch (err) {
    return serverError('Failed to fetch estimates', err)
  }
}

async function createHandler(req: NextRequest, ctx: RequestContext, repairId: string) {
  const { data, error } = await validateBody(req, createSchema)
  if (error) return error
  try {
    const estimate = await RepairEstimateService.create({
      repair_id: repairId,
      business_id: ctx.businessId,
      ...data,
    })
    return created(estimate)
  } catch (err) {
    return serverError('Failed to create estimate', err)
  }
}

export const GET  = withMiddleware(
  (req, ctx, { params }) => params.then((p) => listHandler(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => createHandler(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
