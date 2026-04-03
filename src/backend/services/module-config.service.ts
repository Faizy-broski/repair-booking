/**
 * ModuleConfigService
 * Server-side only — uses adminSupabase (service_role) to bypass RLS where needed.
 * ⚠️ Never import in client-side code.
 *
 * Caching uses Next.js unstable_cache + revalidateTag instead of a module-level Map.
 * This works correctly in serverless deployments (Vercel, AWS Lambda) where the Map
 * would not be shared across instances and webhooks on one instance could not
 * invalidate caches held by another.
 */
import { unstable_cache, revalidateTag } from 'next/cache'
import { adminSupabase } from '@/backend/config/supabase'
import { MODULES } from '@/backend/config/constants'
import type {
  ModuleName,
  ResolvedModuleConfigMap,
  ResolvedModuleConfig,
  ModuleConfigTemplate,
  BusinessModuleAccess,
  UpdateBusinessModuleAccessPayload,
  UpdateBranchModuleOverridePayload,
  CreateTemplatePayload,
  PushTemplatePayload,
} from '@/types/module-config'

// ── Cache tag helpers ────────────────────────────────────────────────────────

const branchTag = (branchId: string) => `module-config:branch:${branchId}`

/**
 * Invalidate all cached configs for a single branch.
 * Safe to call from any API route or webhook handler.
 */
export function invalidateBranchCache(branchId: string) {
  revalidateTag(branchTag(branchId))
}

/**
 * Invalidate cached configs for every branch of a business.
 */
export async function invalidateBusinessCache(businessId: string) {
  const { data: branches } = await adminSupabase
    .from('branches')
    .select('id')
    .eq('business_id', businessId)
  if (branches) {
    for (const b of branches) revalidateTag(branchTag(b.id))
  }
}

// ── Cached DB fetcher ────────────────────────────────────────────────────────

/**
 * Wraps the RPC call in Next.js unstable_cache, keyed by branchId.
 * Tags: module-config:branch:<branchId> — revalidate via invalidateBranchCache().
 * TTL: 5 minutes as a secondary expiry (primary invalidation is tag-based).
 */
async function fetchDirect(branchId: string): Promise<ResolvedModuleConfigMap> {
  const { data, error } = await adminSupabase
    .rpc('resolve_all_module_configs', { p_branch_id: branchId })
  if (error) throw error
  return data as ResolvedModuleConfigMap
}

function fetchAllConfigsCached(branchId: string): Promise<ResolvedModuleConfigMap> {
  // Skip Next.js cache in development — avoids stale results after migrations/changes.
  if (process.env.NODE_ENV === 'development') {
    return fetchDirect(branchId)
  }
  return unstable_cache(
    () => fetchDirect(branchId),
    [`module-configs-${branchId}`],
    {
      tags: [branchTag(branchId)],
      revalidate: 300, // 5-minute fallback TTL
    }
  )()
}

// ── Core resolution ─────────────────────────────────────────────────────────

export const ModuleConfigService = {
  /**
   * Returns fully merged configs for all 13 modules for a branch.
   *
   * Security: callerBusinessId is required for tenant-facing calls.
   * Pass 'superadmin' (or omit) only from superadmin routes that use skipTenant.
   * The check prevents a Business A user from passing a Business B branchId
   * and reading their configuration via the API.
   */
  async getAllForBranch(
    branchId: string,
    callerBusinessId?: string
  ): Promise<ResolvedModuleConfigMap> {
    // Ownership check — skip only for superadmin routes
    if (callerBusinessId && callerBusinessId !== 'superadmin') {
      const { data: branch } = await adminSupabase
        .from('branches')
        .select('business_id')
        .eq('id', branchId)
        .single()

      if (!branch || branch.business_id !== callerBusinessId) {
        const err = new Error('Branch not found or access denied') as Error & { code: string }
        err.code = 'FORBIDDEN'
        throw err
      }
    }

    return fetchAllConfigsCached(branchId)
  },

  /**
   * Returns the merged config for a single module for a branch.
   * Not cached (single-module fetches happen infrequently).
   */
  async getOneForBranch(branchId: string, module: ModuleName): Promise<ResolvedModuleConfig> {
    const { data, error } = await adminSupabase
      .rpc('resolve_module_config', { p_branch_id: branchId, p_module: module })
    if (error) throw error
    return data as ResolvedModuleConfig
  },

  // ── Branch-level overrides ─────────────────────────────────────────────────

  /**
   * Upsert branch-level module settings override.
   * Auth: branch_manager minimum (enforced in controller).
   */
  async upsertBranchOverride(
    branchId: string,
    module: ModuleName,
    payload: UpdateBranchModuleOverridePayload
  ) {
    const { error } = await adminSupabase
      .from('branch_module_overrides')
      .upsert(
        {
          branch_id: branchId,
          module,
          settings_override: payload.settings_override,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'branch_id,module' }
      )
    if (error) throw error
    invalidateBranchCache(branchId)
  },

  // ── Business-level access + overrides ─────────────────────────────────────

  async getBusinessModuleAccess(businessId: string): Promise<BusinessModuleAccess[]> {
    const { data, error } = await adminSupabase
      .from('business_module_access')
      .select('*')
      .eq('business_id', businessId)
      .order('module')
    if (error) throw error
    return (data ?? []) as BusinessModuleAccess[]
  },

  /**
   * Update business-level module access (is_enabled, template, overrides).
   * Auth: business_owner for settings_override; super_admin for is_enabled/plan_override/template_id.
   */
  async updateBusinessModuleAccess(
    businessId: string,
    module: ModuleName,
    payload: UpdateBusinessModuleAccessPayload
  ) {
    const { error } = await adminSupabase
      .from('business_module_access')
      .upsert(
        {
          business_id: businessId,
          module,
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,module' }
      )
    if (error) throw error
    await invalidateBusinessCache(businessId)
  },

  // ── Template CRUD (superadmin) ─────────────────────────────────────────────

  async listTemplates(module?: ModuleName): Promise<ModuleConfigTemplate[]> {
    let q = adminSupabase
      .from('module_config_templates')
      .select('*')
      .order('module')
      .order('name')
    if (module) q = q.eq('module', module)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as ModuleConfigTemplate[]
  },

  async getTemplate(id: string): Promise<ModuleConfigTemplate> {
    const { data, error } = await adminSupabase
      .from('module_config_templates')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as ModuleConfigTemplate
  },

  async createTemplate(payload: CreateTemplatePayload): Promise<ModuleConfigTemplate> {
    const { data, error } = await adminSupabase
      .from('module_config_templates')
      .insert({
        module: payload.module,
        name: payload.name,
        description: payload.description ?? null,
        settings: payload.settings ?? {},
        is_default: payload.is_default ?? false,
      })
      .select()
      .single()
    if (error) throw error
    return data as ModuleConfigTemplate
  },

  async updateTemplate(
    id: string,
    payload: Partial<CreateTemplatePayload>
  ): Promise<ModuleConfigTemplate> {
    const { data: current, error: fetchErr } = await adminSupabase
      .from('module_config_templates')
      .select('version')
      .eq('id', id)
      .single()
    if (fetchErr) throw fetchErr

    const { data, error } = await adminSupabase
      .from('module_config_templates')
      .update({
        ...payload,
        version: (current.version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as ModuleConfigTemplate
  },

  async deleteTemplate(id: string) {
    const { error } = await adminSupabase
      .from('module_config_templates')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  /**
   * Push a template update to a set of businesses.
   * push_mode:
   *   'force_override' — clears settings_override so businesses align fully with template
   *   'merge_missing_only' — keeps existing overrides; only bumps template_id/version
   */
  async pushTemplate(
    templateId: string,
    pushedById: string,
    payload: PushTemplatePayload
  ) {
    const template = await ModuleConfigService.getTemplate(templateId)

    let businessIds: string[]
    if (payload.business_ids === 'all') {
      const { data, error } = await adminSupabase
        .from('business_module_access')
        .select('business_id')
        .eq('module', template.module)
      if (error) throw error
      businessIds = [...new Set((data ?? []).map((r) => r.business_id))]
    } else {
      businessIds = payload.business_ids
    }

    const rows = businessIds.map((bid) => ({
      business_id: bid,
      module: template.module,
      template_id: templateId,
      template_version: template.version,
      ...(payload.push_mode === 'force_override' ? { settings_override: {} } : {}),
      updated_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      const { error } = await adminSupabase
        .from('business_module_access')
        .upsert(rows, { onConflict: 'business_id,module' })
      if (error) throw error
    }

    await adminSupabase.from('module_config_template_push_log').insert({
      template_id: templateId,
      pushed_by: pushedById,
      affected_business_ids: businessIds,
      old_version: template.version - 1,
      new_version: template.version,
      push_mode: payload.push_mode,
    })

    // Invalidate across all serverless instances via revalidateTag
    for (const bid of businessIds) {
      await invalidateBusinessCache(bid)
    }

    return { affected: businessIds.length }
  },

  /**
   * Returns all modules accessible to a business, with plan ceiling info.
   * Used by superadmin — skips ownership check.
   */
  async getBusinessModuleSummary(businessId: string) {
    const [accessRows, branches] = await Promise.all([
      ModuleConfigService.getBusinessModuleAccess(businessId),
      adminSupabase.from('branches').select('id').eq('business_id', businessId),
    ])

    const firstBranchId = (branches.data ?? [])[0]?.id
    let resolvedMap: ResolvedModuleConfigMap | null = null
    if (firstBranchId) {
      // superadmin context — ownership check not needed
      resolvedMap = await fetchAllConfigsCached(firstBranchId)
    }

    return MODULES.map((mod) => {
      const access = accessRows.find((r) => r.module === mod) ?? null
      const resolved = resolvedMap?.[mod] ?? null
      return {
        module: mod,
        access,
        is_enabled: resolved?._meta?.is_enabled ?? false,
        template_name: resolved?._meta?.template_name ?? null,
        has_override: resolved?._meta?.has_override ?? false,
      }
    })
  },

  /**
   * Generate a diff preview for pushing a template to businesses.
   * Shows what fields would change for each affected business.
   */
  async generatePushDiff(
    templateId: string,
    pushMode: 'force_override' | 'merge_missing_only',
    businessIds: string[] | 'all'
  ) {
    const template = await ModuleConfigService.getTemplate(templateId)

    let targetIds: string[]
    if (businessIds === 'all') {
      const { data, error } = await adminSupabase
        .from('business_module_access')
        .select('business_id')
        .eq('module', template.module)
      if (error) throw error
      targetIds = [...new Set((data ?? []).map((r) => r.business_id))]
    } else {
      targetIds = businessIds
    }

    // Fetch business names
    const { data: businesses } = await adminSupabase
      .from('businesses')
      .select('id, name')
      .in('id', targetIds)
    const nameMap = new Map((businesses ?? []).map((b) => [b.id, b.name]))

    // Fetch current settings for each business
    const { data: accessRows } = await adminSupabase
      .from('business_module_access')
      .select('business_id, settings_override, template_id, template_version')
      .eq('module', template.module)
      .in('business_id', targetIds)
    const accessMap = new Map((accessRows ?? []).map((r) => [r.business_id, r]))

    const diffs = []
    for (const bid of targetIds) {
      const current = accessMap.get(bid)
      const currentSettings = (current?.settings_override ?? {}) as Record<string, unknown>
      const templateSettings = (template.settings ?? {}) as Record<string, unknown>
      const changes: Array<{ field: string; current_value: unknown; new_value: unknown }> = []

      if (pushMode === 'force_override') {
        // All template fields replace current
        const allKeys = new Set([...Object.keys(templateSettings), ...Object.keys(currentSettings)])
        for (const key of allKeys) {
          const cv = currentSettings[key]
          const nv = templateSettings[key] ?? undefined
          if (JSON.stringify(cv) !== JSON.stringify(nv)) {
            changes.push({ field: key, current_value: cv ?? null, new_value: nv ?? null })
          }
        }
      } else {
        // merge_missing_only — only show fields missing from current
        for (const [key, val] of Object.entries(templateSettings)) {
          if (!(key in currentSettings)) {
            changes.push({ field: key, current_value: null, new_value: val })
          }
        }
      }

      if (changes.length > 0) {
        diffs.push({
          business_id: bid,
          business_name: nameMap.get(bid) ?? 'Unknown',
          module: template.module,
          changes,
        })
      }
    }

    return {
      template_id: templateId,
      template_name: template.name,
      push_mode: pushMode,
      affected_count: diffs.length,
      diffs,
    }
  },
}
