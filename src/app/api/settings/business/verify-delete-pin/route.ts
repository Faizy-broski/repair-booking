import { NextRequest } from 'next/server'
import { withMiddleware, type RequestContext } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok } from '@/backend/utils/api-response'

async function postHandler(request: NextRequest, ctx: RequestContext) {
  const body = await request.json().catch(() => ({}))
  const pin: string = body?.pin ?? ''

  const { data } = await adminSupabase
    .from('businesses')
    .select('delete_pin')
    .eq('id', ctx.businessId)
    .single()

  if (!(data as any)?.delete_pin) return ok({})

  if ((data as any).delete_pin !== pin) {
    return Response.json({ error: 'Incorrect PIN' }, { status: 401 })
  }

  return ok({})
}

export const POST = withMiddleware(postHandler, { requiredRole: 'cashier' })
