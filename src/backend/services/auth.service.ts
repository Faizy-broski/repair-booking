import { getAdminSupabase } from '@/backend/config/supabase'
import { slugify } from '@/lib/utils'
import { NotificationTemplateService } from '@/backend/services/notification-template.service'
import { seedGenericRepairDefaults } from '@/backend/services/repair-defaults.service'

interface RegisterPayload {
  businessName: string
  subdomain: string
  email: string
  phone?: string
  website?: string | null
  whatsapp?: string | null
  country?: string | null
  city?: string | null
  address?: string | null
  mapsUrl?: string | null
  fullName: string
  password: string
  mainBranchName: string
  /** When true (called from free plan signup or Stripe webhook after payment), business is immediately active */
  activateNow?: boolean
  /** ISO string — set for free plan so middleware can check expiry quickly */
  trialEndsAt?: string
}

export const AuthService = {
  async checkSubdomainAvailable(subdomain: string): Promise<boolean> {
    const supabase = getAdminSupabase()
    const { data } = await supabase
      .from('businesses')
      .select('id')
      .eq('subdomain', subdomain.toLowerCase())
      .single()
    return !data
  },

  async checkEmailAvailable(email: string): Promise<boolean> {
    const supabase = getAdminSupabase()
    // Check businesses table (covers active + inactive accounts)
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()
    if (biz) return false
    // Also check pending_registrations — only active (non-expired) ones block re-registration
    const { data: pending } = await (supabase as any)
      .from('pending_registrations')
      .select('id')
      .eq('email', email.toLowerCase())
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    return !pending
  },

  async register(payload: RegisterPayload) {
    const supabase = getAdminSupabase()
    const subdomain = slugify(payload.subdomain)

    // Check subdomain
    const available = await AuthService.checkSubdomainAvailable(subdomain)
    if (!available) throw new Error('Subdomain is already taken')

    // 1. Create Supabase auth user.
    // If the email is already taken in Supabase Auth but has no business in our DB,
    // the auth user is orphaned (e.g. a previous account was deleted but auth cleanup
    // failed silently). Delete the stale auth user and retry once.
    let { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName, role: 'business_owner' },
    })

    if (authError && authError.message.toLowerCase().includes('already been registered')) {
      const { data: existingBiz } = await (supabase as any)
        .from('businesses')
        .select('id')
        .eq('email', payload.email.toLowerCase())
        .maybeSingle()

      if (existingBiz) {
        // A real active account exists — surface the conflict clearly
        throw new Error('A user with this email address has already been registered')
      }

      // Orphaned auth user — find and delete it, then recreate
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const stale = users.find((u) => u.email?.toLowerCase() === payload.email.toLowerCase())
      if (stale) await supabase.auth.admin.deleteUser(stale.id)

      const retry = await supabase.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: { full_name: payload.fullName, role: 'business_owner' },
      })
      authData  = retry.data
      authError = retry.error
    }

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? 'Failed to create user')
    }

    const userId = authData.user.id

    // 2. Create business
    const { data: business, error: bizError } = await (supabase as any)
      .from('businesses')
      .insert({
        name: payload.businessName,
        subdomain,
        email: payload.email,
        phone: payload.phone ?? null,
        website: payload.website || null,
        whatsapp: payload.whatsapp || null,
        country: payload.country || null,
        city: payload.city || null,
        address: payload.address || null,
        maps_url: payload.mapsUrl || null,
        is_active: payload.activateNow ?? false,
        ...(payload.trialEndsAt ? { trial_ends_at: payload.trialEndsAt } : {}),
      })
      .select()
      .single()

    if (bizError || !business) {
      // Rollback user
      await supabase.auth.admin.deleteUser(userId)
      throw new Error(bizError?.message ?? 'Failed to create business')
    }

    // 3. Create main branch
    const { data: branch, error: branchError } = await (supabase as any)
      .from('branches')
      .insert({
        business_id: business.id,
        name: payload.mainBranchName,
        is_main: true,
        address: payload.address || null,
        phone: payload.phone || null,
      })
      .select()
      .single()

    if (branchError || !branch) {
      await supabase.auth.admin.deleteUser(userId)
      throw new Error(branchError?.message ?? 'Failed to create branch')
    }

    // 4. Upsert profile (handles both trigger-created and missing rows)
    await (supabase as any)
      .from('profiles')
      .upsert({
        id: userId,
        business_id: business.id,
        branch_id: null, // owner has access to all branches
        role: 'business_owner',
        full_name: payload.fullName,
        email: payload.email,
        is_active: true,
      })

    // 5–6. Seed generic repair statuses + common faults. A vertical template
    // applied afterwards swaps these for its own (see repair-defaults.service).
    await seedGenericRepairDefaults(business.id)

    // 7. Seed default notification templates (ticket_created, ticket_status_changed,
    // repair_ready, etc.) — without these, NotificationEngine.fire() silently no-ops
    // for every automatic email trigger since it requires an active template row.
    await NotificationTemplateService.seedForBusiness(business.id)

    return { business, branch, userId }
  },
}
