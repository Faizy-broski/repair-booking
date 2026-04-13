import { adminSupabase, createAdminClient } from '@/backend/config/supabase'
import type { UpdateTables } from '@/types/database'

export const UserService = {
  async listByBusiness(businessId: string) {
    const { data, error } = await adminSupabase
      .from('profiles')
      .select('id, full_name, role, phone, is_active, created_at, branches(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(payload: {
    email: string
    password?: string
    full_name: string
    role: string
    branch_id?: string | null
    business_id: string
  }) {
    const supabase = createAdminClient()

    // Create user via Supabase Auth admin API (no invite email)
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.full_name,
        role: payload.role,
        business_id: payload.business_id,
        branch_id: payload.branch_id ?? null,
      },
    })
    if (createError) throw createError

    // Create profile row (the auth trigger may also do this, but be explicit)
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        business_id: payload.business_id,
        branch_id: payload.branch_id ?? null,
        role: payload.role as 'branch_manager' | 'staff' | 'cashier',
        full_name: payload.full_name,
        is_active: true,
      })
      .select()
      .single()

    if (profileError) throw profileError
    return profile
  },

  async update(id: string, businessId: string, payload: Partial<UpdateTables<'profiles'>>) {
    const { data, error } = await adminSupabase
      .from('profiles')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Reset a team member's password. Only callable with the service-role admin
   * client so no user session is required. Performs a strict ownership check:
   * the target profile must belong to `businessId` and must not be a
   * business_owner (owners manage their own password via account settings).
   */
  async resetPassword(
    targetUserId: string,
    businessId: string,
    requesterId: string,
    newPassword: string
  ) {
    const supabase = createAdminClient()

    // Verify the target user belongs to this business and is a sub-user
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('id, role, business_id')
      .eq('id', targetUserId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) throw new Error('User not found in this business')
    // Prevent resetting another business_owner's password (incl. self via this endpoint)
    if (profile.role === 'business_owner') {
      throw new Error('Business owner passwords cannot be changed via this endpoint')
    }
    if (targetUserId === requesterId) {
      throw new Error('Use account settings to change your own password')
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    )
    if (updateError) throw updateError
  },
}
