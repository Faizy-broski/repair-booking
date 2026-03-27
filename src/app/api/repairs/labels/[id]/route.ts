import { withMiddleware } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { TicketLabelService } from '@/backend/services/ticket-label.service'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

async function patchHandler(req: NextRequest, ctx: RequestContext, id: string) {
  const { data, error } = await validateBody(req, updateSchema)
  if (error) return error
  try {
    const label = await TicketLabelService.update(id, ctx.businessId, data.name, data.color)
    return ok(label)
  } catch (err) {
    return serverError('Failed to update label', err)
  }
}

async function deleteHandler(req: NextRequest, ctx: RequestContext, id: string) {
  try {
    await TicketLabelService.delete(id, ctx.businessId)
    return ok({ deleted: true })
  } catch (err) {
    return serverError('Failed to delete label', err)
  }
}

export const PATCH  = withMiddleware(
  (req, ctx, { params }) => params.then((p) => patchHandler(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => deleteHandler(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
