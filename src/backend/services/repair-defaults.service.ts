/**
 * Default repair faults + statuses for a business.
 *
 * Every new business is seeded with the generic (phone/electronics repair)
 * defaults below. When a vertical template is applied, its own
 * module_settings.repairs.faults / .statuses replace those generic defaults —
 * but only while they're still untouched, so a business's own customisations
 * are never wiped.
 *
 * Repairs reference faults and statuses by NAME (repairs.status is text, and
 * the P&L RPCs match terminal statuses via LOWER(TRIM(name))), so statuses are
 * only ever replaced for a business with no repairs yet; otherwise they're
 * left exactly as they are.
 */
import { adminSupabase } from '@/backend/config/supabase'

const db = (table: string): any => (adminSupabase as any).from(table)

export interface DefaultStatus { name: string; color: string; is_terminal: boolean }

export const GENERIC_REPAIR_STATUSES: DefaultStatus[] = [
  { name: 'Received',             color: '#64748b', is_terminal: false },
  { name: 'In Progress',          color: '#0ea5e9', is_terminal: false },
  { name: 'Waiting for Parts',    color: '#f59e0b', is_terminal: false },
  { name: 'Ready for Collection', color: '#10b981', is_terminal: false },
  { name: 'Collected',            color: '#6366f1', is_terminal: true  },
  { name: 'Unrepairable',         color: '#ef4444', is_terminal: true  },
]

export const GENERIC_REPAIR_FAULTS: string[] = [
  'No Power', 'Broken Screen', 'Liquid Damage', 'Software Issue', 'Battery Issue', 'Charging Port',
]

const norm = (s: string) => s.trim().toLowerCase()

/** True when `names` is exactly the generic default set (order/case-insensitive). */
function isUntouchedDefault(names: string[], defaults: string[]): boolean {
  if (names.length !== defaults.length) return false
  const a = new Set(names.map(norm))
  return defaults.every((d) => a.has(norm(d)))
}

/** repairs has no business_id — they belong to a branch. */
async function countBusinessRepairs(businessId: string): Promise<number> {
  const { data: branches } = await db('branches').select('id').eq('business_id', businessId)
  const ids = ((branches ?? []) as { id: string }[]).map((b) => b.id)
  if (ids.length === 0) return 0
  const { count } = await db('repairs').select('id', { count: 'exact', head: true }).in('branch_id', ids)
  return count ?? 0
}

/** Seeds the generic defaults for a brand-new business. */
export async function seedGenericRepairDefaults(businessId: string): Promise<void> {
  await db('repair_custom_statuses').insert(
    GENERIC_REPAIR_STATUSES.map((s, i) => ({ ...s, sort_order: i + 1, business_id: businessId }))
  )
  await db('repair_faults').insert(
    GENERIC_REPAIR_FAULTS.map((name, i) => ({ name, sort_order: i + 1, business_id: businessId }))
  )
}

/** Reads faults/statuses out of a template's module_settings.repairs (tolerates the legacy {label} shape). */
export function templateRepairDefaults(moduleSettings: unknown): { faults: string[]; statuses: DefaultStatus[] } {
  const repairs = (moduleSettings as Record<string, any> | null)?.repairs ?? {}
  const faults: string[] = Array.isArray(repairs.faults)
    ? repairs.faults.map((f: unknown) => (typeof f === 'string' ? f : (f as any)?.name)).filter(Boolean)
    : []
  const statuses: DefaultStatus[] = Array.isArray(repairs.statuses)
    ? repairs.statuses
        .map((s: any) => ({
          name: s?.name ?? s?.label,
          color: s?.color ?? '#64748b',
          is_terminal: !!s?.is_terminal,
        }))
        .filter((s: DefaultStatus) => !!s.name)
    : []
  return { faults, statuses }
}

export interface TemplateCatalogue {
  /** Device types (service_categories), each with brands and "all models" services. */
  categories: { name: string; brands?: string[]; services?: { name: string; price?: number }[] }[]
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Seeds a template's Service Catalogue (device types → brands → services) —
 * only when the business's catalogue is still completely empty, so an existing
 * catalogue is never touched. Services are created with use_for_all_models so
 * they apply to every model under the device type.
 */
export async function applyTemplateCatalogue(businessId: string, moduleSettings: unknown): Promise<'seeded' | 'skipped'> {
  const catalogue = (moduleSettings as Record<string, any> | null)?.repairs?.catalogue as TemplateCatalogue | undefined
  if (!catalogue?.categories?.length) return 'skipped'

  const { count } = await db('service_categories').select('id', { count: 'exact', head: true }).eq('business_id', businessId)
  if ((count ?? 0) > 0) return 'skipped'

  for (const [i, cat] of catalogue.categories.entries()) {
    const { data: category, error } = await db('service_categories')
      .insert({ business_id: businessId, name: cat.name, slug: slugify(cat.name), display_order: i, show_on_pos: true })
      .select('id')
      .single()
    if (error || !category) throw error ?? new Error(`Failed to create category ${cat.name}`)

    if (cat.brands?.length) {
      // service_manufacturers is UNIQUE(business_id, name) — a make shared by
      // several device types is created once, under the first type.
      const { data: existing } = await db('service_manufacturers').select('name').eq('business_id', businessId)
      const have = new Set(((existing ?? []) as { name: string }[]).map((m) => norm(m.name)))
      const brands = cat.brands.filter((b) => !have.has(norm(b)))
      if (brands.length) {
        await db('service_manufacturers').insert(
          brands.map((name) => ({ business_id: businessId, name, category_id: category.id }))
        )
      }
    }

    if (cat.services?.length) {
      await db('service_problems').insert(
        cat.services.map((s) => ({
          business_id: businessId,
          category_id: category.id,
          name: s.name,
          price: s.price ?? 0,
          use_for_all_models: true,
          show_on_pos: true,
        }))
      )
    }
  }
  return 'seeded'
}

/**
 * Applies a template's repair faults/statuses to a business.
 * - Faults: replace when the business still has the untouched generic set, otherwise just drop leftover generic ones.
 * - Statuses: replace only when untouched AND the business has no repairs; otherwise leave them.
 */
export async function applyTemplateRepairDefaults(
  businessId: string,
  moduleSettings: unknown
): Promise<{ faults: 'replaced' | 'merged' | 'skipped'; statuses: 'replaced' | 'merged' | 'skipped' }> {
  const { faults, statuses } = templateRepairDefaults(moduleSettings)
  const result = { faults: 'skipped' as 'replaced' | 'merged' | 'skipped', statuses: 'skipped' as 'replaced' | 'merged' | 'skipped' }

  if (faults.length > 0) {
    const { data: existing } = await db('repair_faults').select('id, name').eq('business_id', businessId)
    const rows = (existing ?? []) as { id: string; name: string }[]
    if (isUntouchedDefault(rows.map((r) => r.name), GENERIC_REPAIR_FAULTS) || rows.length === 0) {
      if (rows.length) await db('repair_faults').delete().eq('business_id', businessId)
      await db('repair_faults').insert(faults.map((name, i) => ({ name, sort_order: i + 1, business_id: businessId })))
      result.faults = 'replaced'
    } else {
      // The business has curated its own faults — keep them, and only drop the
      // leftover generic phone-repair defaults (faults are stored on repairs as
      // text, so deleting these rows never affects existing jobs).
      const generic = new Set(GENERIC_REPAIR_FAULTS.map(norm))
      const stale = rows.filter((r) => generic.has(norm(r.name))).map((r) => r.id)
      if (stale.length) await db('repair_faults').delete().in('id', stale)
      result.faults = 'merged'
    }
  }

  if (statuses.length > 0) {
    const [{ data: existing }, repairCount] = await Promise.all([
      db('repair_custom_statuses').select('id, name').eq('business_id', businessId),
      countBusinessRepairs(businessId),
    ])
    const rows = (existing ?? []) as { id: string; name: string }[]
    const untouched = rows.length === 0 || isUntouchedDefault(rows.map((r) => r.name), GENERIC_REPAIR_STATUSES.map((s) => s.name))
    if (untouched && (repairCount ?? 0) === 0) {
      if (rows.length) await db('repair_custom_statuses').delete().eq('business_id', businessId)
      await db('repair_custom_statuses').insert(
        statuses.map((s, i) => ({ ...s, sort_order: i + 1, business_id: businessId }))
      )
      result.statuses = 'replaced'
    }
    // Otherwise leave statuses alone: existing jobs (and P&L terminal-status
    // matching) depend on the current names, and appending a second set would
    // just clutter the status list.
  }

  return result
}
