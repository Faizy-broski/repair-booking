import { withMiddleware } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { TicketLabelService } from '@/backend/services/ticket-label.service'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const setLabelsSchema = z.object({
  label_ids: z.array(z.string().uuid()),
})

async function putHandler(req: NextRequest, ctx: RequestContext, repairId: string) {
  const { data, error } = await validateBody(req, setLabelsSchema)
  if (error) return error
  try {
    const result = await TicketLabelService.setRepairLabels(repairId, data.label_ids)
    return ok(result)
  } catch (err) {
    return serverError('Failed to update repair labels', err)
  }
}

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then((p) => putHandler(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
