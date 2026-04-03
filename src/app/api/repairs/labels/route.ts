import { withMiddleware } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { TicketLabelService } from '@/backend/services/ticket-label.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const labelSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
})

async function listLabels(req: NextRequest, ctx: RequestContext) {
  try {
    const labels = await TicketLabelService.list(ctx.businessId)
    return ok(labels)
  } catch (err) {
    return serverError('Failed to fetch labels', err)
  }
}

async function createLabel(req: NextRequest, ctx: RequestContext) {
  const { data, error } = await validateBody(req, labelSchema)
  if (error) return error
  try {
    const label = await TicketLabelService.create(ctx.businessId, data.name, data.color)
    return created(label)
  } catch (err) {
    return serverError('Failed to create label', err)
  }
}

export const GET  = withMiddleware(listLabels,  { requiredRole: 'cashier' })
export const POST = withMiddleware(createLabel, { requiredRole: 'staff' })
