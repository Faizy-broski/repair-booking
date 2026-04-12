/**
 * PlanLimitService
 * Checks and enforces plan-based limits for businesses.
 * Uses the check_plan_limit() RPC for DB-level checks and provides
 * a TypeScript API for controllers/services to call before mutations.
 */
import { adminSupabase } from '@/backend/config/supabase'
import type { PlanLimits } from '@/types/module-config'

const db = (table: string): any => (adminSupabase as any).from(table)

interface LimitCheckResult {
  allowed: boolean
  limit: number | null
  current: number
  reason: string | null
}

export const PlanLimitService = {
  /**
   * Check a limit via the DB RPC function.
   * Returns { allowed, limit, current, reason }.
   */
  async checkLimit(
    businessId: string,
    limitKey: string,
    currentCount?: number
  ): Promise<LimitCheckResult> {
    // If currentCount not provided, auto-count for known limit keys
    let count = currentCount
    if (count === undefined) {
      count = await PlanLimitService.countForKey(businessId, limitKey)
    }

    const { data, error } = await (adminSupabase as any)
      .rpc('check_plan_limit', {
        p_business_id: businessId,
        p_limit_key: limitKey,
        p_current_count: count,
      })

    if (error) throw error
    return data as LimitCheckResult
  },

  /**
   * Auto-count current usage for known limit keys.
   */
  async countForKey(businessId: string, limitKey: string): Promise<number> {
    let result: { count: number | null }

    switch (limitKey) {
      case 'max_branches': {
        result = await db('branches')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
        break
      }
      case 'max_users': {
        result = await db('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
        break
      }
      case 'max_products': {
        result = await db('products')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_service', false)
        break
      }
      case 'max_employees': {
        result = await db('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .in('role', ['staff', 'cashier', 'branch_manager'])
        break
      }
      case 'max_customers': {
        result = await db('customers')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
        break
      }
      case 'max_services': {
        result = await db('products')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_service', true)
        break
      }
      case 'max_custom_fields': {
        result = await db('custom_field_definitions')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
        break
      }
      case 'max_appointments_per_month': {
        // appointments link to business via branch, count all this calendar month
        const { data: branches } = await db('branches')
          .select('id')
          .eq('business_id', businessId)
        const branchIds: string[] = (branches ?? []).map((b: { id: string }) => b.id)
        if (branchIds.length === 0) return 0
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
        result = await db('appointments')
          .select('*', { count: 'exact', head: true })
          .in('branch_id', branchIds)
          .gte('start_time', monthStart)
          .lt('start_time', monthEnd)
        break
      }
      default:
        return 0
    }

    return result.count ?? 0
  },

  /**
   * Get the current plan's limits for a business.
   */
  async getPlanLimits(businessId: string): Promise<{
    plan_name: string | null
    max_branches: number
    max_users: number
    limits: PlanLimits
  } | null> {
    const { data, error } = await db('subscriptions')
      .select('plans(name, max_branches, max_users, limits)')
      .eq('business_id', businessId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data?.plans) return null

    return {
      plan_name: data.plans.name,
      max_branches: data.plans.max_branches,
      max_users: data.plans.max_users,
      limits: (data.plans.limits ?? {}) as PlanLimits,
    }
  },

  /**
   * Quick boolean check: can the business add one more of [limitKey]?
   */
  async canAdd(businessId: string, limitKey: string): Promise<boolean> {
    const result = await PlanLimitService.checkLimit(businessId, limitKey)
    return result.allowed
  },

  /**
   * Get a comprehensive usage summary for a business.
   */
  async getUsageSummary(businessId: string) {
    const planInfo = await PlanLimitService.getPlanLimits(businessId)
    if (!planInfo) return null

    const limitKeys = ['max_branches', 'max_users', 'max_products', 'max_employees', 'max_customers']
    const usage: Record<string, { current: number; limit: number | null }> = {}

    for (const key of limitKeys) {
      const count = await PlanLimitService.countForKey(businessId, key)
      let limit: number | null = null
      if (key === 'max_branches') limit = planInfo.max_branches
      else if (key === 'max_users') limit = planInfo.max_users
      else limit = (planInfo.limits as Record<string, number>)[key] ?? null

      usage[key] = { current: count, limit }
    }

    // Boolean features
    const booleanFeatures: Record<string, boolean> = {}
    const boolKeys = [
      'has_api_access', 'has_white_label', 'has_priority_support',
      'has_customer_portal', 'has_online_booking', 'has_multi_branch', 'has_advanced_reports',
    ] as const

    for (const key of boolKeys) {
      booleanFeatures[key] = (planInfo.limits as Record<string, boolean>)[key] ?? false
    }

    return {
      plan_name: planInfo.plan_name,
      usage,
      features: booleanFeatures,
    }
  },
}
