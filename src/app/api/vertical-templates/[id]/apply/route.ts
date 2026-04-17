import { withMiddleware } from '@/backend/middleware'
import { type RequestContext } from '@/backend/middleware'
import { VerticalTemplateService } from '@/backend/services/vertical-template.service'
import { ok, serverError, forbidden } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'
import { NextRequest } from 'next/server'

const schema = z.object({
  mode: z.enum(['initial', 'merge', 'reapply']).default('merge'),
  // business_id optional — falls back to the caller's own business
  business_id: z.string().uuid().optional(),
})

async function applyHandler(
  request: NextRequest,
  ctx: RequestContext,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await validateBody(request, schema)
  if (error) return error

  // business_owner can only apply to their own business
  const targetBusiness = data.business_id ?? ctx.businessId
  if (targetBusiness !== ctx.businessId) return forbidden('Cannot apply template to another business')

  try {
    const result = await VerticalTemplateService.applyToBusiness(id, targetBusiness, ctx.auth.userId, data.mode)
    return ok(result)
  } catch (err) {
    return serverError('Failed to apply template', err)
  }
}

export const POST = withMiddleware(applyHandler, { requiredRole: 'business_owner' })
