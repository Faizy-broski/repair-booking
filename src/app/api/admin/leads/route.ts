import { withMiddleware } from '@/backend/middleware'
import { LeadService } from '@/backend/services/lead.service'
import { ok, serverError } from '@/backend/utils/api-response'
import { getPagination } from '@/backend/utils/pagination'

const listHandler = withMiddleware(async (req) => {
  try {
    const { searchParams } = new URL(req.url)
    const { page, limit }  = getPagination(searchParams)
    const status            = searchParams.get('status') ?? undefined
    const source            = searchParams.get('source') ?? undefined
    const search            = searchParams.get('search') ?? undefined

    const { data, count } = await LeadService.listAll({ page, limit, status, source, search })
    return ok(data, { total: count, page, limit })
  } catch (e: any) {
    return serverError(e.message)
  }
}, { requiredRole: 'super_admin', skipTenant: true })

export const GET = listHandler
