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
}
