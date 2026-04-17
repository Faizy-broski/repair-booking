import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/backend/services/auth.service'
import { EmailService } from '@/backend/services/email.service'
import { createAdminClient } from '@/backend/config/supabase'
import { VerticalTemplateService } from '@/backend/services/vertical-template.service'
import { created, conflict, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'

const schema = z.object({
  businessName:          z.string().min(2),
  subdomain:             z.string().min(2).max(30).regex(/^[a-z0-9-]+$/),
  email:                 z.string().email(),
  phone:                 z.string().optional(),
  fullName:              z.string().min(2),
  password:              z.string().min(8),
  mainBranchName:        z.string().min(2),
  planId:                z.string().optional(),  // UUID from plans table
  verticalTemplateSlug:  z.string().optional(),  // slug chosen during onboarding
})

export async function POST(request: NextRequest) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error

  try {
    const supabase = createAdminClient()

    // Look up plan type
    let planType: string | null = null
    if (data.planId) {
      const { data: plan } = await supabase
        .from('plans')
        .select('plan_type')
        .eq('id', data.planId)
        .single()
      planType = (plan as { plan_type?: string } | null)?.plan_type ?? null
    }

    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // Free plan: create account immediately, fully active
    const result = await AuthService.register({
      ...data,
      activateNow: true,
      ...(planType === 'free' ? { trialEndsAt } : {}),
    })

    // Create subscription row for free plan
    if (planType === 'free' && data.planId) {
      await (supabase as any)
        .from('subscriptions')
        .insert({
          business_id:   result.business.id,
          plan_id:       data.planId,
          status:        'trialing',
          billing_cycle: 'monthly',
          trial_ends_at: trialEndsAt,
        })

      // Set trial_ends_at on business too for quick middleware check
      await (supabase as any)
        .from('businesses')
        .update({ trial_ends_at: trialEndsAt })
        .eq('id', result.business.id)
    }

    // Enterprise: send enquiry emails immediately
    if (planType === 'enterprise') {
      EmailService.sendEnterpriseEnquiry({
        businessName: data.businessName,
        email:        data.email,
        fullName:     data.fullName,
        phone:        data.phone,
      }).catch(() => {})
    }

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
