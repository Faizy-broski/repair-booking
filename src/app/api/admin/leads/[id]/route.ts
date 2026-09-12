import { withMiddleware } from '@/backend/middleware'
import { LeadService } from '@/backend/services/lead.service'
import { ok, noContent, badRequest, serverError } from '@/backend/utils/api-response'
import { z } from 'zod'

const updateSchema = z.object({
  status:  z.enum(['new', 'contacted', 'qualified', 'converted', 'closed']).optional(),
  message: z.string().max(2000).optional().nullable(),
})

export const GET = withMiddleware(
  (req, _ctx, { params }) => params.then(async (p) => {
    try {
      const lead = await LeadService.getById(p.id)
      return ok(lead)
    } catch (e: any) {
      return serverError(e.message)
    }
  }),
  { requiredRole: 'super_admin', skipTenant: true }
)

export const PATCH = withMiddleware(
  (req, _ctx, { params }) => params.then(async (p) => {
    try {
      const body    = await req.json()
      const parsed  = updateSchema.safeParse(body)
      if (!parsed.success) return badRequest(parsed.error.message)
      const lead = await LeadService.update(p.id, parsed.data)
      return ok(lead)
    } catch (e: any) {
      return serverError(e.message)
    }
  }),
  { requiredRole: 'super_admin', skipTenant: true }
)

export const DELETE = withMiddleware(
  (_req, _ctx, { params }) => params.then(async (p) => {
    try {
      await LeadService.delete(p.id)
      return noContent()
    } catch (e: any) {
      return serverError(e.message)
    }
  }),
  { requiredRole: 'super_admin', skipTenant: true }
)
