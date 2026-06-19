import { withMiddleware } from '@/backend/middleware'
import { HelpdeskService } from '@/backend/services/helpdesk.service'
import { ok, serverError } from '@/backend/utils/api-response'
import { getPagination } from '@/backend/utils/pagination'

const listHandler = withMiddleware(async (req) => {
  try {
    const { searchParams } = new URL(req.url)
    const { page, limit }  = getPagination(searchParams)
    const status           = searchParams.get('status') ?? undefined
    const search           = searchParams.get('search') ?? undefined
    const businessId       = searchParams.get('business_id') ?? undefined

    const { data, count } = await HelpdeskService.listAll({ page, limit, status, search, businessId })
    return ok(data, { total: count, page, limit })
  } catch (e: any) {
    return serverError(e.message)
  }
}, { requiredRole: 'super_admin', skipTenant: true })

export const GET = listHandler
