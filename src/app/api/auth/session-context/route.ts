import { NextRequest, NextResponse } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'
import type { RequestContext } from '@/backend/middleware'
import type { SubscriptionStatus } from '@/store/auth.store'

/**
 * GET /api/auth/session-context
 *
 * Returns everything the tenant layout needs in a single server-side round-trip:
 * profile, branches, subscription status, currency, brand colour, vertical template slug.
 *
 * All four DB queries run in parallel via Promise.all, and the auth/profile lookup is
 * already cached by authMiddleware (2-min profile cache). This replaces 4-5 sequential
 * client-side Supabase calls that blocked the tenant layout from rendering.
 */
async function getSessionContext(
  _request: NextRequest,
  ctx: RequestContext
): Promise<NextResponse> {
  try {
    const { userId, businessId: authBusinessId } = ctx.auth
    const businessId = ctx.businessId ?? authBusinessId

    const [
      { data: profile, error: profileError },
      { data: branchRows },
      { data: bizData },
      { data: sub },
    ] = await Promise.all([
      adminSupabase.from('profiles').select('*').eq('id', userId).single(),
      businessId
        ? adminSupabase
            .from('branches')
            .select('*')
            .eq('business_id', businessId)
            .eq('is_active', true)
            .order('is_main', { ascending: false })
        : Promise.resolve({ data: [] }),
      businessId
        ? adminSupabase
            .from('businesses')
            .select('name, currency, brand_color, business_vertical_templates(slug)')
            .eq('id', businessId)
            .single()
        : Promise.resolve({ data: null }),
      businessId
        ? adminSupabase
            .from('subscriptions')
            .select('status, trial_ends_at, current_period_end, stripe_sub_id, plans(name, plan_type)')
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (profileError || !profile) {
      return serverError('Profile not found', profileError)
    }

    // Derive subscription status
    const plans = (sub?.plans as { name?: string; plan_type?: string } | null) ?? null
    const planType = (plans?.plan_type ?? null) as SubscriptionStatus['planType']
    const planName = plans?.name ?? null
    const trialEndsAt = sub?.trial_ends_at ?? null
    const currentPeriodEnd = (sub as any)?.current_period_end ?? null
    const freeTrialExpired = planType === 'free' && trialEndsAt && new Date(trialEndsAt) < new Date()
    // Mirrors middleware.ts's subscription gate — deliberately does not depend on
    // plan_type (a mislabeled plans row must never bypass this check).
    const paidSubInactive =
      !!sub?.status &&
      !trialEndsAt &&
      !['active', 'trialing'].includes(sub.status)
    const manualSubExpired =
      !(sub as any)?.stripe_sub_id &&
      currentPeriodEnd &&
      new Date(currentPeriodEnd) < new Date()

    const subscriptionStatus: SubscriptionStatus = {
      status: sub?.status ?? null,
      planType,
      planName,
      trialEndsAt,
      currentPeriodEnd,
      hasAccess: !freeTrialExpired && !paidSubInactive && !manualSubExpired,
    }

    const verticalTemplateSlug =
      (bizData?.business_vertical_templates as { slug?: string } | null)?.slug ?? null

    return ok({
      profile: { ...profile, verticalTemplateSlug },
      branches: branchRows ?? [],
      subscriptionStatus,
      currency: bizData?.currency ?? 'GBP',
      brandColor: bizData?.brand_color ?? '#008080',
      businessName: bizData?.name ?? null,
    })
  } catch (err) {
    return serverError('Failed to load session context', err)
  }
}

export const GET = withMiddleware(getSessionContext, { requiredRole: 'cashier' })
