import { adminSupabase } from '@/backend/config/supabase'

export const TenantService = {
  async getBySubdomain(subdomain: string) {
    const { data, error } = await adminSupabase
      .from('businesses')
      .select('id, name, subdomain, is_active, is_suspended, currency, timezone')
      .eq('subdomain', subdomain)
      .single()
    if (error) return null
    return data
  },

  async isSubdomainAvailable(subdomain: string): Promise<boolean> {
    const { data } = await adminSupabase
      .from('businesses')
      .select('id')
      .eq('subdomain', subdomain)
      .maybeSingle()
    return !data
  },

  async activate(businessId: string) {
    const { data, error } = await adminSupabase
      .from('businesses')
      .update({ is_active: true, is_suspended: false })
      .eq('id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async suspend(businessId: string) {
    const { data, error } = await adminSupabase
      .from('businesses')
      .update({ is_suspended: true, is_active: false })
      .eq('id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getSubscription(businessId: string) {
    const { data, error } = await adminSupabase
      .from('subscriptions')
      .select('*, plans(name,max_branches,max_users,features)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  },
}
