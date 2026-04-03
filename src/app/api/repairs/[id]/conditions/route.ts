import { withMiddleware } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { RepairConditionService } from '@/backend/services/repair-condition.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const conditionItemSchema = z.object({
  label: z.string().min(1),
  status: z.enum(['ok', 'damaged', 'missing']),
  notes: z.string().optional().nullable(),
})

const saveSchema = z.object({
  stage: z.enum(['pre', 'post']),
  items: z.array(conditionItemSchema),
})

async function getHandler(req: NextRequest, ctx: RequestContext, repairId: string) {
  try {
    const conditions = await RepairConditionService.getConditions(repairId)
    return ok(conditions)
  } catch (err) {
    return serverError('Failed to fetch conditions', err)
  }
}

async function postHandler(req: NextRequest, ctx: RequestContext, repairId: string) {
  const { data, error } = await validateBody(req, saveSchema)
  if (error) return error
  try {
    const saved = await RepairConditionService.saveConditions(repairId, data.stage, data.items)
    return created(saved)
  } catch (err) {
    return serverError('Failed to save conditions', err)
  }
}

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => getHandler(req, ctx, p.id)),
  { requiredRole: 'staff' }
)

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => postHandler(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
