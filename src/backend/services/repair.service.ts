import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'
import { escapeIlike } from '@/backend/utils/search'

const db = (t: string): any => (adminSupabase as any).from(t)
const rpc = (fn: string, args?: Record<string, unknown>): any => (adminSupabase as any).rpc(fn, args)

export const RepairService = {
  async list(branchId: string | undefined, params: { page?: number; limit?: number; status?: string; search?: string; businessId?: string; customerId?: string }) {
    const { page = 1, limit = 20, status, search, businessId, customerId } = params
    let q = adminSupabase
      .from('repairs')
      .select('*, customers(first_name,last_name,phone,email)', { count: 'exact' })
      .order('is_rush', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (branchId) {
      q = q.eq('branch_id', branchId)
    } else if (businessId) {
      // Owner sees all branches: fetch branch IDs in parallel while building the query
      const { data: branches } = await adminSupabase
        .from('branches')
        .select('id')
        .eq('business_id', businessId)
        .eq('is_active', true)
      const ids = (branches ?? []).map((b) => b.id)
      if (ids.length > 0) q = q.in('branch_id', ids)
    }

    if (status) q = q.eq('status', status)
    if (customerId) q = q.eq('customer_id', customerId)
    if (search) {
      const term = `%${escapeIlike(search)}%`
      // Look up customer IDs that match email or phone so we can include them
      const { data: matchedCustomers } = await adminSupabase
        .from('customers')
        .select('id')
        .or(`email.ilike.${term},phone.ilike.${term}`)
        .limit(50)
      const customerIds = (matchedCustomers ?? []).map((c) => c.id)

      if (customerIds.length > 0) {
        q = q.or(
          `job_number.ilike.${term},device_model.ilike.${term},customer_id.in.(${customerIds.join(',')})`
        )
      } else {
        q = q.or(`job_number.ilike.${term},device_model.ilike.${term}`)
      }
    }

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getById(id: string, branchId?: string) {
    let q = adminSupabase
      .from('repairs')
      .select(
        // customers(*) is intentional — detail view shows full customer profile
        // repair_status_history: exclude sms_sent and repair_id (redundant noise)
        '*, customers(*), repair_items(*), repair_status_history(id,new_status,old_status,note,created_at,email_sent,profiles!changed_by(full_name))'
      )
      .eq('id', id)
    // branchId is null/empty for business owners who have access to all branches
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q.single()
    if (error) throw error
    return data
  },

  async create(payload: Omit<InsertTables<'repairs'>, 'job_number'>) {
    // Auto-generate job number
    const { data: jobNum } = await rpc('generate_job_number', {
      p_branch_id: payload.branch_id,
    })

    const { data, error } = await db('repairs')
      .insert({ ...payload, job_number: jobNum })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, branchId: string | undefined, payload: UpdateTables<'repairs'>) {
    let q = db('repairs').update(payload).eq('id', id)
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q.select().single()
    if (error) throw error
    return data
  },

  async updateStatus(id: string, newStatus: string, note: string, changedBy: string) {
    const { error } = await rpc('update_repair_status', {
      p_repair_id: id,
      p_new_status: newStatus,
      p_note: note,
      p_changed_by: changedBy,
    })
    if (error) throw error
  },

  async getStatusHistory(repairId: string) {
    const { data, error } = await adminSupabase
      .from('repair_status_history')
      .select('*, profiles!changed_by(full_name)')
      .eq('repair_id', repairId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async remove(id: string, branchId?: string) {
    const { error } = await rpc('delete_repair', {
      p_repair_id: id,
      p_branch_id: branchId ?? null,
    })
    if (error) throw error
  },

  // Revenue/refund totals for repair jobs in a date range, deduped against
  // POS-paid amounts — same formula as /api/repairs/stats, but returns a
  // separate refund figure (needed by the Sales page's Refund Amount card)
  // instead of netting refunds into revenue. See that route for the terminal-
  // status / dedup rationale.
  async getRevenueStats(branchId: string, params: { from?: string; to?: string }) {
    const { from, to } = params
    const db = adminSupabase as any

    const TERMINAL_NAMES      = new Set(['repaired', 'collected', 'unrepairable', 'refunded', 'completed', 'done', 'fixed', 'closed', 'picked_up', 'handover'])
    const COMPLETION_KEYWORDS = ['complet', 'done', 'fixed', 'pick', 'closed', 'resolv', 'finish', 'collect', 'handover']
    const isTerminal = (s: string) => {
      const lo = s.toLowerCase().trim()
      return TERMINAL_NAMES.has(lo) || COMPLETION_KEYWORDS.some(kw => lo.includes(kw))
    }

    let repairsQ = db.from('repairs')
      .select('id, status, deposit_paid, actual_cost, estimated_cost, refund_amount')
      .eq('branch_id', branchId)
    if (from) repairsQ = repairsQ.gte('created_at', from)
    if (to)   repairsQ = repairsQ.lte('created_at', to)

    let saleItemsQ = db.from('sale_items')
      .select('repair_id, total, sales!inner(is_refund, branch_id, created_at)')
      .eq('sales.branch_id', branchId)
      .not('repair_id', 'is', null)
    if (from) saleItemsQ = saleItemsQ.gte('sales.created_at', from)
    if (to)   saleItemsQ = saleItemsQ.lte('sales.created_at', to)

    const [repairsRes, saleItemsRes] = await Promise.all([repairsQ, saleItemsQ])
    const repairs: any[] = repairsRes.data ?? []

    // Net amount actually charged through POS per repair (refund sales subtract)
    const posRepairAmounts = new Map<string, number>()
    for (const row of (saleItemsRes.data ?? []) as any[]) {
      const rid = row.repair_id
      if (!rid) continue
      const amt = row.sales?.is_refund ? -(row.total ?? 0) : (row.total ?? 0)
      posRepairAmounts.set(rid, (posRepairAmounts.get(rid) ?? 0) + amt)
    }

    let revenue = 0
    let refundAmount = 0
    let count = 0
    let refundCount = 0

    for (const r of repairs) {
      const posAmt = posRepairAmounts.get(r.id)
      if (posAmt !== undefined) {
        // Already reflected in the `sales` table's own stats — skip entirely
        // here so it isn't counted twice between the two sources.
        continue
      }

      const s        = (r.status ?? '').toLowerCase().trim()
      const deposit   = r.deposit_paid  ?? 0
      const fullCost  = r.actual_cost   ?? r.estimated_cost ?? 0
      const refund    = r.refund_amount ?? 0

      if (s === 'refunded') {
        const net = Math.max(0, deposit - refund)
        revenue += net
        refundAmount += Math.min(deposit, refund)
        refundCount += 1
      } else if (isTerminal(s)) {
        revenue += fullCost
        count += 1
      } else if (deposit > 0) {
        revenue += deposit
        count += 1
      }
    }

    return { revenue, refundAmount, count, refundCount }
  },
}
