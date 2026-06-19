import { withMiddleware } from '@/backend/middleware'
import { HelpdeskService } from '@/backend/services/helpdesk.service'
import { ok, noContent, badRequest, serverError } from '@/backend/utils/api-response'
import { z } from 'zod'

const updateSchema = z.object({
  title:       z.string().min(1).max(300).optional(),
  description: z.string().optional().nullable(),
  category:    z.string().min(1).optional(),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status:      z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
})

export const GET = withMiddleware(
  (req, _ctx, { params }) => params.then(async (p) => {
    try {
      const ticket = await HelpdeskService.getByIdAdmin(p.id)
      return ok(ticket)
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
      const ticket = await HelpdeskService.updateAdmin(p.id, parsed.data)
      return ok(ticket)
    } catch (e: any) {
      return serverError(e.message)
    }
  }),
  { requiredRole: 'super_admin', skipTenant: true }
)

export const DELETE = withMiddleware(
  (_req, _ctx, { params }) => params.then(async (p) => {
    try {
      await HelpdeskService.deleteAdmin(p.id)
      return noContent()
    } catch (e: any) {
      return serverError(e.message)
    }
  }),
  { requiredRole: 'super_admin', skipTenant: true }
)
