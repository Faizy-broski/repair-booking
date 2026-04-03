/**
 * VerticalTemplateService
 * Manages business vertical templates (Repair Shop, Retail, Salon, etc.)
 * and applies them to businesses by seeding module_access rows.
 */
import { adminSupabase } from '@/backend/config/supabase'
import type {
  BusinessVerticalTemplate,
  CreateVerticalTemplatePayload,
  ModuleName,
} from '@/types/module-config'

const db = (table: string): any => (adminSupabase as any).from(table)

export const VerticalTemplateService = {
  async list(activeOnly = false): Promise<BusinessVerticalTemplate[]> {
    let q = db('business_vertical_templates').select('*').order('sort_order')
    if (activeOnly) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) throw error
    return data as BusinessVerticalTemplate[]
  },

  async getById(id: string): Promise<BusinessVerticalTemplate | null> {
    const { data, error } = await db('business_vertical_templates')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return null
    return data as BusinessVerticalTemplate
  },

  async getBySlug(slug: string): Promise<BusinessVerticalTemplate | null> {
    const { data, error } = await db('business_vertical_templates')
      .select('*')
      .eq('slug', slug)
      .single()
    if (error) return null
    return data as BusinessVerticalTemplate
  },

  async create(payload: CreateVerticalTemplatePayload): Promise<BusinessVerticalTemplate> {
    const { data, error } = await db('business_vertical_templates')
      .insert({
        name: payload.name,
        slug: payload.slug,
        description: payload.description ?? null,
        icon: payload.icon ?? 'store',
        modules_enabled: payload.modules_enabled,
        module_settings: payload.module_settings ?? {},
        default_plan_id: payload.default_plan_id ?? null,
        sort_order: payload.sort_order ?? 0,
      })
      .select()
      .single()
    if (error) throw error
    return data as BusinessVerticalTemplate
  },

  async update(
    id: string,
    payload: Partial<CreateVerticalTemplatePayload> & { is_active?: boolean }
  ): Promise<BusinessVerticalTemplate> {
    const { data, error } = await db('business_vertical_templates')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as BusinessVerticalTemplate
  },

  async delete(id: string): Promise<void> {
    const { error } = await db('business_vertical_templates').delete().eq('id', id)
    if (error) throw error
  },

  /**
   * Apply a vertical template to a business.
   * Creates business_module_access rows for each enabled module with template settings.
   *
   * @param mode
   *   'initial' — first setup, inserts only (does not overwrite existing)
   *   'reapply' — force-overwrites all module settings to match template
   *   'merge'   — only fills in modules the business doesn't have yet
   */
  async applyToBusiness(
    templateId: string,
    businessId: string,
    appliedBy: string | null,
    mode: 'initial' | 'reapply' | 'merge' = 'initial'
  ): Promise<{ modules_applied: ModuleName[] }> {
    const template = await VerticalTemplateService.getById(templateId)
    if (!template) throw new Error('Vertical template not found')

    // Get existing module access rows for this business
    const { data: existing } = await db('business_module_access')
      .select('module')
      .eq('business_id', businessId)
    const existingModules = new Set((existing ?? []).map((r: any) => r.module))

    const modulesToApply: ModuleName[] = []
    const rows: any[] = []

    for (const mod of template.modules_enabled as ModuleName[]) {
      const hasExisting = existingModules.has(mod)

      if (mode === 'merge' && hasExisting) continue
      if (mode === 'initial' && hasExisting) continue

      modulesToApply.push(mod)
      const settings = (template.module_settings as Record<string, any>)?.[mod] ?? {}

      rows.push({
        business_id: businessId,
        module: mod,
        is_enabled: true,
        settings_override: settings,
        updated_at: new Date().toISOString(),
      })
    }

    if (rows.length > 0) {
      const { error } = await db('business_module_access')
        .upsert(rows, { onConflict: 'business_id,module' })
      if (error) throw error
    }

    // Link business to vertical template
    await db('businesses')
      .update({ vertical_template_id: templateId, updated_at: new Date().toISOString() })
      .eq('id', businessId)

    // Log the application
    await db('vertical_template_apply_log').insert({
      template_id: templateId,
      business_id: businessId,
      applied_by: appliedBy,
      apply_mode: mode,
      modules_applied: modulesToApply,
      diff_snapshot: { modules_count: modulesToApply.length, mode },
    })

    return { modules_applied: modulesToApply }
  },

  async getApplyLog(businessId: string) {
    const { data, error } = await db('vertical_template_apply_log')
      .select('*, business_vertical_templates(name, slug)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },
}
