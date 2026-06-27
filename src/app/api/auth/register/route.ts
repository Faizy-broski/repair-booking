import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/backend/services/auth.service'
import { EmailService } from '@/backend/services/email.service'
import { createAdminClient } from '@/backend/config/supabase'
import { VerticalTemplateService } from '@/backend/services/vertical-template.service'
import { created, conflict, serverError, badRequest } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'

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
  fullName:              z.string().min(2),
  password:              z.string().min(8),
  mainBranchName:        z.string().min(2),
  planId:                z.string().optional(),  // UUID from plans table
  billingCycle:          z.enum(['monthly', 'yearly']).optional().default('monthly'),
  verticalTemplateSlug:  z.string().optional(),  // slug chosen during onboarding
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

    // Look up plan type and name
    let planType: string | null = null
    let planName: string | null = null
    if (data.planId) {
      const { data: plan } = await supabase
        .from('plans')
        .select('plan_type, name')
        .eq('id', data.planId)
        .single()
      planType = (plan as { plan_type?: string; name?: string } | null)?.plan_type ?? null
      planName  = (plan as { plan_type?: string; name?: string } | null)?.name ?? null
    }

    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // Create account immediately, fully active for 30 days
    const result = await AuthService.register({
      ...data,
      activateNow: true,
      trialEndsAt,
    })

    // Create subscription row for ALL plans with a 30-day trial
    if (data.planId && planType !== 'enterprise') {
      await (supabase as any)
        .from('subscriptions')
        .insert({
          business_id:          result.business.id,
          plan_id:              data.planId,
          status:               'trialing',
          billing_cycle:        data.billingCycle,
          trial_ends_at:        trialEndsAt,
          current_period_start: new Date().toISOString(),
          current_period_end:   trialEndsAt,
        })

      // Set trial_ends_at on business too for quick middleware check
      await (supabase as any)
        .from('businesses')
        .update({ trial_ends_at: trialEndsAt })
        .eq('id', result.business.id)
    }

    // Send welcome email for all non-enterprise plans
    if (planType !== 'enterprise') {
      EmailService.sendWelcome({
        to:           data.email,
        fullName:     data.fullName,
        businessName: data.businessName,
        subdomain:    data.subdomain,
        password:     data.password,
        planName:     'Starter',
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

    return created({ businessId: result.business.id })
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('already taken') || message.includes('already exists')) return conflict(message)
    return serverError(message, err)
  }
}
