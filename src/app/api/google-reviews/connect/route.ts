import { withMiddleware } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { ok, serverError, badRequest } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'
import { GoogleReviewService } from '@/backend/services/google-review.service'

const schema = z.object({
  place_id: z.string().min(1),
  name:     z.string().min(1),
  address:  z.string().optional(),
})

export const POST = withMiddleware(async (req: NextRequest, ctx) => {
  const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
  if (!branchId) return badRequest('No branch context')

  const { data, error } = await validateBody(req, schema)
  if (error) return error

  try {
    await GoogleReviewService.saveSearchedBusiness(branchId, data.place_id, data.name, data.address ?? '')
    return ok({ connected: true })
  } catch (err) {
    return serverError('Failed to connect business', err)
  }
}, { requiredRole: 'branch_manager' })
