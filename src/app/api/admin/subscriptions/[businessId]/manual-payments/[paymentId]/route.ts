import { NextRequest, NextResponse } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

async function deleteHandler(
  _request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ businessId: string; paymentId: string }> }
) {
  const { businessId, paymentId } = await routeCtx.params
  const supabase = createAdminClient()

  const { data, error } = await (supabase as any)
    .from('manual_payments')
    .delete()
    .eq('id', paymentId)
    .eq('business_id', businessId)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Payment record not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

export const DELETE = withMiddleware(deleteHandler, { requiredRole: 'super_admin', skipTenant: true })
