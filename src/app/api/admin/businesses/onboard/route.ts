import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withMiddleware, type RequestContext } from '@/backend/middleware'
import { AuthService } from '@/backend/services/auth.service'
import { EmailService } from '@/backend/services/email.service'
import { createAdminClient } from '@/backend/config/supabase'
import { VerticalTemplateService } from '@/backend/services/vertical-template.service'
import { created, conflict, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'

const schema = z.object({
  businessName:         z.string().min(2),
  subdomain:            z.string().min(2).max(30).regex(/^[a-z0-9-]+$/),
  email:                z.string().email(),
  phone:                z.string().min(5),
  website:              z.string().optional().nullable(),
  whatsapp:             z.string().optional().nullable(),
  country:              z.string().optional().nullable(),
  city:                 z.string().optional().nullable(),
  address:              z.string().optional().nullable(),
  fullName:             z.string().min(2),
  password:             z.string().min(8),
  mainBranchName:       z.string().min(2),
  planId:               z.string().optional(),
  billingCycle:         z.enum(['monthly', 'yearly']).optional().default('monthly'),
  verticalTemplateSlug: z.string().optional(),
})

async function handler(request: NextRequest, _ctx: RequestContext) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error

  const supabase = createAdminClient()

  // Look up plan type and name before registration
  let planType: string | null = null
  let planName: string | null = null
  if (data.planId) {
    const { data: plan } = await supabase
      .from('plans')
      .select('plan_type, name')
      .eq('id', data.planId)
      .single()
    planType = (plan as any)?.plan_type ?? null
    planName  = (plan as any)?.name ?? null
  }

  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // Phase 1: Create the tenant (auth user + business + branch + profile + seed data)
  // No OTP guard — super admin bypasses email verification.
  // AuthService.register() internally rolls back the auth user if business/branch creation fails.
  let result: Awaited<ReturnType<typeof AuthService.register>>
  try {
    result = await AuthService.register({ ...data, activateNow: true, trialEndsAt })
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('already taken') || message.includes('already exists')) return conflict(message)
    return serverError(message, err)
  }

  // Phase 2: Post-registration steps (subscription row + business trial date).
  // If these fail after register() succeeded we would have an orphaned active tenant,
  // so we catch, clean up, and surface the error.
  try {
    if (data.planId && planType !== 'enterprise') {
      const { error: subErr } = await (supabase as any).from('subscriptions').insert({
        business_id:          result.business.id,
        plan_id:              data.planId,
        status:               'trialing',
        billing_cycle:        data.billingCycle,
        trial_ends_at:        trialEndsAt,
        current_period_start: new Date().toISOString(),
        current_period_end:   trialEndsAt,
      })
      if (subErr) throw new Error(`Subscription insert failed: ${subErr.message}`)

      await (supabase as any)
        .from('businesses')
        .update({ trial_ends_at: trialEndsAt })
        .eq('id', result.business.id)
    }
  } catch (postErr) {
    // Rollback: delete the auth user (Supabase cascades profile via trigger) and business
    // (ON DELETE CASCADE removes branches + profiles).
    await supabase.auth.admin.deleteUser(result.userId).catch(() => {})
    await (supabase as any).from('businesses').delete().eq('id', result.business.id).catch(() => {})
    return serverError((postErr as Error).message, postErr)
  }

  // Phase 3: Side effects — await both so the serverless runtime cannot terminate them
  // before they complete (acceptable latency for an admin-only action).
  if (planType !== 'enterprise') {
    try {
      await EmailService.sendWelcome({
        to:           data.email,
        fullName:     data.fullName,
        businessName: data.businessName,
        subdomain:    data.subdomain,
        password:     data.password,
        planName:     planName ?? 'Starter',
      })
    } catch (err) {
      // Non-fatal — business is fully created; log and continue
      console.error('[admin/onboard] Welcome email failed:', err)
    }
  }

  try {
    await EmailService.sendNewBusinessAlert({
      businessId:   result.business.id,
      businessName: data.businessName,
      subdomain:    data.subdomain,
      ownerName:    data.fullName,
      ownerEmail:   data.email,
      ownerPhone:   data.phone,
      planName:     planName ?? 'Starter',
      source:       'super_admin',
      registeredAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[admin/onboard] Super admin alert email failed:', err)
  }

  if (data.verticalTemplateSlug) {
    try {
      const template = await VerticalTemplateService.getBySlug(data.verticalTemplateSlug)
      if (template) {
        await VerticalTemplateService.applyToBusiness(template.id, result.business.id, null, 'initial')
      }
    } catch (err) {
      console.error('[admin/onboard] Template application failed:', err)
    }
  }

  const isProd = process.env.NODE_ENV === 'production'
  const loginUrl = isProd
    ? `https://${result.business.subdomain}.repairbooking.co.uk/login`
    : `http://${result.business.subdomain}.localhost:3000/login`

  return created({
    businessId: result.business.id,
    subdomain:  result.business.subdomain,
    loginUrl,
  })
}

export const POST = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
