import { adminSupabase } from '@/backend/config/supabase'

export const WorkflowService = {
  async list(businessId: string) {
    const { data, error } = await adminSupabase
      .from('ticket_workflows')
      .select('*, ticket_workflow_steps(*)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map((w) => ({
      ...w,
      ticket_workflow_steps: (w.ticket_workflow_steps as any[]).sort((a, b) => a.step_order - b.step_order),
    }))
  },

  async create(businessId: string, name: string, isDefault: boolean) {
    // If setting as default, unset any existing default first
    if (isDefault) {
      await adminSupabase
        .from('ticket_workflows')
        .update({ is_default: false })
        .eq('business_id', businessId)
        .eq('is_default', true)
    }
    const { data, error } = await adminSupabase
      .from('ticket_workflows')
      .insert({ business_id: businessId, name, is_default: isDefault })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, name: string, isDefault: boolean) {
    if (isDefault) {
      await adminSupabase
        .from('ticket_workflows')
        .update({ is_default: false })
        .eq('business_id', businessId)
        .eq('is_default', true)
        .neq('id', id)
    }
    const { data, error } = await adminSupabase
      .from('ticket_workflows')
      .update({ name, is_default: isDefault })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('ticket_workflows')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },

  async setSteps(workflowId: string, steps: Array<{ name: string; description?: string; required_role?: string; step_order: number }>) {
    const { error: delErr } = await adminSupabase
      .from('ticket_workflow_steps')
      .delete()
      .eq('workflow_id', workflowId)
    if (delErr) throw delErr

    if (steps.length === 0) return []

    const { data, error } = await adminSupabase
      .from('ticket_workflow_steps')
      .insert(steps.map((s) => ({ ...s, workflow_id: workflowId })))
      .select()
    if (error) throw error
    return data
  },
}

export const RepairStatusFlagService = {
  async list(businessId: string) {
    const { data, error } = await adminSupabase
      .from('repair_status_flags')
      .select('*')
      .eq('business_id', businessId)
    if (error) throw error
    return data ?? []
  },

  async upsert(businessId: string, status: string, message: string) {
    const { data, error } = await adminSupabase
      .from('repair_status_flags')
      .upsert({ business_id: businessId, status, message }, { onConflict: 'business_id,status' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('repair_status_flags')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}
