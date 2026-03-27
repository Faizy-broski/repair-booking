import { getAdminSupabase } from '@/backend/config/supabase'
import { slugify } from '@/lib/utils'

interface RegisterPayload {
  businessName: string
  subdomain: string
  email: string
  phone?: string
  fullName: string
  password: string
  mainBranchName: string
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

  async register(payload: RegisterPayload) {
    const supabase = getAdminSupabase()
    const subdomain = slugify(payload.subdomain)

    // Check subdomain
    const available = await AuthService.checkSubdomainAvailable(subdomain)
    if (!available) throw new Error('Subdomain is already taken')

    // 1. Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName, role: 'business_owner' },
    })

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
        is_active: false, // activated after subscription payment
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

    return { business, branch, userId }
  },
}
