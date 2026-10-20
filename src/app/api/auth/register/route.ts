import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/backend/services/auth.service'
import { EmailService } from '@/backend/services/email.service'
import { createAdminClient } from '@/backend/config/supabase'
import { VerticalTemplateService } from '@/backend/services/vertical-template.service'
import { created, conflict, serverError, badRequest } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { customPlanDimensionsSchema, computeCustomPlanPricePence, computeCustomPlanTotalPence, getCustomPlanBaseline } from '@/backend/services/custom-plan-pricing'
import { createPlanCheckoutSession, type CheckoutTarget } from '@/backend/services/plan-checkout.service'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'

async function isEmailVerified(email: string): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const windowStart = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30-min window
    const { data } = await (supabase as any)
      .from('email_verifications')
      .select('id')
      .eq('email', email.toLowerCase())
      .not('verified_at', 'is', null)
      .gte('verified_at', windowStart)
      .limit(1)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

const schema = z.object({
  businessName:          z.string().min(2),
  subdomain:             z.string().min(2).max(30).regex(/^[a-z0-9-]+$/),
  email:                 z.string().email(),
  phone:                 z.string().min(5),
  website:               z.string().optional().nullable(),
  whatsapp:              z.string().optional().nullable(),
  country:               z.string().optional().nullable(),
  city:                  z.string().optional().nullable(),
  address:               z.string().optional().nullable(),
  mapsUrl:               z.string().optional().nullable(),
  fullName:              z.string().min(2),
  password:              z.string().min(8),
  mainBranchName:        z.string().min(2),
  planId:                z.string().optional(),  // UUID from plans table
  billingCycle:          z.enum(['monthly', 'yearly']).optional().default('monthly'),
  verticalTemplateSlug:  z.string().optional(),  // slug chosen during onboarding
  // Present only when the customer built a Custom Plan instead of picking planId.
  // Loose shape here — actual floors/steps depend on the current cheapest paid
  // plan's live values, so the real validation happens in the handler once that's fetched.
  customPlan: z.object({
    branches: z.number().int(),
    staff: z.number().int(),
    inventoryLimit: z.number().int().nullable(),
    repairLimit: z.number().int().nullable(),
  }).optional(),
})

export async function POST(request: NextRequest) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error

  try {
    const supabase = createAdminClient()

    // Guard: email must be verified via OTP before account creation
    const verified = await isEmailVerified(data.email)
    if (!verified) {
      return badRequest('Email address has not been verified. Please complete email verification first.', 'EMAIL_NOT_VERIFIED')
    }

    // Look up plan type and name. A customPlan payload always wins over planId —
    // the actual numbers are recomputed server-side and never trusted from the client.
    let planType: string | null = null
    let planName: string | null = null
    let resolvedPlanId: string | null = data.planId ?? null

    let validatedCustomPlan: ReturnType<ReturnType<typeof customPlanDimensionsSchema>['parse']> | null = null
    let customPricePence: number | null = null
    let customCheckoutTotalPence: number | null = null

    if (data.customPlan) {
      const { data: customPlanRow, error: customPlanErr } = await supabase
        .from('plans')
        .select('id, plan_type, name')
        .eq('plan_type', 'custom')
        .single()
      if (customPlanErr || !customPlanRow) {
        return serverError('Custom plan is not configured yet.', customPlanErr ?? new Error('missing custom plan placeholder row'))
      }
      resolvedPlanId = (customPlanRow as { id: string }).id
      planType = 'custom'
      planName = 'Custom Plan'

      // Floors/steps depend on the current cheapest paid plan's live values —
      // never trust the client's raw numbers without re-validating against them.
      const baseline = await getCustomPlanBaseline(supabase)
      const parsed = customPlanDimensionsSchema(baseline).safeParse(data.customPlan)
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? 'Invalid custom plan configuration', 'INVALID_CUSTOM_PLAN')
      }
      validatedCustomPlan = parsed.data
      customPricePence = computeCustomPlanPricePence(parsed.data, baseline)
      customCheckoutTotalPence = computeCustomPlanTotalPence(parsed.data, baseline, data.billingCycle)
    } else if (data.planId === 'enterprise') {
      // Enterprise enquiry — the UI sends the literal 'enterprise', not a plan UUID.
      // Attach the enterprise plan row (if any) so the account is locked until a
      // superadmin assigns a plan or grants a trial.
      planType = 'enterprise'
      planName = 'Enterprise'
      const { data: entPlan } = await supabase
        .from('plans')
        .select('id')
        .eq('plan_type', 'enterprise')
        .limit(1)
        .maybeSingle()
      resolvedPlanId = (entPlan as { id: string } | null)?.id ?? null
    } else if (data.planId) {
      const { data: plan } = await supabase
        .from('plans')
        .select('plan_type, name, is_active')
        .eq('id', data.planId)
        .single()
      const p = plan as { plan_type?: string; name?: string; is_active?: boolean } | null
      if (!p || p.is_active === false) {
        return badRequest('Selected plan is not available.', 'INVALID_PLAN')
      }
      planType = p.plan_type ?? null
      planName = p.name ?? null
    }

    // No self-serve free trial — every non-enterprise signup must pay for a plan.
    if (planType !== 'enterprise') {
      if (!resolvedPlanId) return badRequest('Please choose a plan to continue.', 'PLAN_REQUIRED')
      if (planType === 'free') return badRequest('Please choose a paid plan to continue.', 'PAID_PLAN_REQUIRED')
    }

    // Create the account now; it stays locked (subscription 'incomplete') until
    // Stripe Checkout completes — see /api/auth/check-registration + webhook.
    const result = await AuthService.register({
      ...data,
      activateNow: true,
    })

    if (resolvedPlanId) {
      const { error: subErr } = await (supabase as any)
        .from('subscriptions')
        .insert({
          business_id:          result.business.id,
          plan_id:              resolvedPlanId,
          status:               'incomplete',
          billing_cycle:        data.billingCycle,
          trial_ends_at:        null,
          current_period_start: null,
          current_period_end:   null,
          ...(validatedCustomPlan
            ? {
                is_custom:            true,
                custom_max_branches:  validatedCustomPlan.branches,
                custom_max_users:     validatedCustomPlan.staff,
                custom_max_products:  validatedCustomPlan.inventoryLimit,
                custom_max_services:  validatedCustomPlan.repairLimit,
                custom_price_monthly: customPricePence !== null ? customPricePence / 100 : null,
              }
            : {}),
        })

      // Without this row the business would have no subscription at all, which
      // the access gates treat as unrestricted — never leave it half-created.
      if (subErr) {
        await supabase.auth.admin.deleteUser(result.userId).catch(() => {})
        await (supabase as any).from('businesses').delete().eq('id', result.business.id)
        return serverError(`Could not set up your subscription: ${subErr.message}`, subErr)
      }
    }

    // Create the Stripe Checkout session. If this fails the account still exists
    // (locked) — the client sends the user to the payment-cancelled page, from
    // where they can log in and pay via /account/plans.
    let checkoutUrl: string | null = null
    if (planType !== 'enterprise') {
      const subdomain = data.subdomain.toLowerCase()
      try {
        const target: CheckoutTarget = validatedCustomPlan
          ? { kind: 'custom', dims: validatedCustomPlan, totalPence: customCheckoutTotalPence!, monthlyPence: customPricePence! }
          : { kind: 'plan', planId: resolvedPlanId! }
        const session = await createPlanCheckoutSession({
          businessId:   result.business.id,
          email:        data.email,
          target,
          billingCycle: data.billingCycle,
          successUrl:   `${APP_URL}/register/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl:    `${APP_URL}/register/payment-cancelled?subdomain=${encodeURIComponent(subdomain)}&email=${encodeURIComponent(data.email)}`,
          source:       'signup',
        })
        checkoutUrl = session.url
      } catch (err) {
        console.error('[register] Checkout session creation failed:', err)
      }
    }

    // Send welcome email for all non-enterprise plans
    if (planType !== 'enterprise') {
      EmailService.sendWelcome({
        to:           data.email,
        fullName:     data.fullName,
        businessName: data.businessName,
        subdomain:    data.subdomain,
        password:     data.password,
        planName:     planName ?? 'Starter',
      }).catch((err) => console.error('[register] Welcome email failed:', err))
    }

    // Enterprise: send enquiry emails immediately
    if (planType === 'enterprise') {
      EmailService.sendEnterpriseEnquiry({
        businessName: data.businessName,
        email:        data.email,
        fullName:     data.fullName,
        phone:        data.phone,
      }).catch((err) => console.error('[register] Enterprise email failed:', err))
    }

    // Notify super admin of new business registration (fire-and-forget, non-fatal)
    EmailService.sendNewBusinessAlert({
      businessId:   result.business.id,
      businessName: data.businessName,
      subdomain:    data.subdomain,
      ownerName:    data.fullName,
      ownerEmail:   data.email,
      ownerPhone:   data.phone,
      planName:     planName ?? (planType === 'enterprise' ? 'Enterprise' : 'Starter'),
      source:       'self_registered',
      registeredAt: new Date().toISOString(),
    }).catch((err) => console.error('[register] Super admin alert email failed:', err))

    // Apply vertical template if one was chosen during onboarding (fire-and-forget)
    if (data.verticalTemplateSlug) {
      VerticalTemplateService.getBySlug(data.verticalTemplateSlug)
        .then((template) => {
          if (template) {
            return VerticalTemplateService.applyToBusiness(
              template.id,
              result.business.id,
              null,   // applied_by: system (no user session yet)
              'initial'
            )
          }
        })
        .catch(() => {}) // non-fatal — business is created regardless
    }

    return created({ businessId: result.business.id, checkoutUrl })
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('already taken') || message.includes('already exists')) return conflict(message)
    return serverError(message, err)
  }
}
