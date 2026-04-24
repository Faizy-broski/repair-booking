import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

const db = (table: string): any => (adminSupabase as any).from(table)

const PAGE_SIZE = 50 // default page size for paginated catalogue endpoints

// ── Categories ──────────────────────────────────────────────────────────────

export const ServiceCategoryService = {
  async list(businessId: string) {
    const { data, error } = await adminSupabase
      .from('service_categories')
      .select('*')
      .eq('business_id', businessId)
      .order('display_order', { ascending: true })
    if (error) throw error
    return data
  },

  async create(payload: InsertTables<'service_categories'>) {
    const { data, error } = await db('service_categories')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'service_categories'>) {
    const { data, error } = await db('service_categories')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('service_categories')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}

// ── Manufacturers ────────────────────────────────────────────────────────────

export const ServiceManufacturerService = {
  async list(businessId: string, categoryId?: string, opts?: { page?: number; limit?: number }) {
    const page  = Math.max(1, opts?.page  ?? 1)
    const limit = Math.min(100, opts?.limit ?? PAGE_SIZE)
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    let q = (adminSupabase as any)
      .from('service_manufacturers')
      .select('id, name, category_id', { count: 'exact' })
      .eq('business_id', businessId)
      .order('name', { ascending: true })
      .range(from, to)

    if (categoryId) q = q.eq('category_id', categoryId)

    const { data, count, error } = await q
    if (error) throw error
    return { data: data ?? [], total: count ?? 0 }
  },

  async create(payload: InsertTables<'service_manufacturers'>) {
    const { data, error } = await db('service_manufacturers')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'service_manufacturers'>) {
    const { data, error } = await db('service_manufacturers')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('service_manufacturers')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}

// ── Devices ──────────────────────────────────────────────────────────────────

export const ServiceDeviceService = {
  async list(
    businessId: string,
    params: { manufacturerId?: string; brandId?: string; categoryId?: string },
    opts?: { page?: number; limit?: number },
  ) {
    const page  = Math.max(1, opts?.page  ?? 1)
    const limit = Math.min(100, opts?.limit ?? PAGE_SIZE)
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    let q = (adminSupabase as any)
      .from('service_devices')
      .select('id, name, manufacturer_id, category_id', { count: 'exact' })
      .eq('business_id', businessId)
      .order('name', { ascending: true })
      .range(from, to)

    if (params.manufacturerId) q = q.eq('manufacturer_id', params.manufacturerId)
    if (params.brandId)        q = q.eq('brand_id', params.brandId)
    if (params.categoryId)     q = q.eq('category_id', params.categoryId)

    const { data, count, error } = await q
    if (error) throw error
    return { data: data ?? [], total: count ?? 0 }
  },

  async create(payload: InsertTables<'service_devices'>) {
    const { data, error } = await db('service_devices')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'service_devices'>) {
    const { data, error } = await db('service_devices')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('service_devices')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}

// ── Problems / Services ──────────────────────────────────────────────────────

export const ServiceProblemService = {
  async list(
    businessId: string,
    params: { deviceId?: string; categoryId?: string },
    opts?: { page?: number; limit?: number },
  ) {
    const page  = Math.max(1, opts?.page  ?? 1)
    const limit = Math.min(100, opts?.limit ?? PAGE_SIZE)
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    let q = (adminSupabase as any)
      .from('service_problems')
      .select('id, name, price, cost, warranty_days, show_on_pos, device_id, category_id', { count: 'exact' })
      .eq('business_id', businessId)
      .order('name', { ascending: true })
      .range(from, to)

    if (params.deviceId)   q = q.eq('device_id', params.deviceId)
    if (params.categoryId) q = q.eq('category_id', params.categoryId)

    const { data, count, error } = await q
    if (error) throw error
    return { data: data ?? [], total: count ?? 0 }
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('service_problems')
      .select('*, service_problem_parts(*, products(name, sku))')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    return data
  },

  async create(payload: InsertTables<'service_problems'>) {
    const { data, error } = await db('service_problems')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'service_problems'>) {
    const { data, error } = await db('service_problems')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('service_problems')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },

  // Parts management
  async setParts(problemId: string, parts: Array<{ product_id: string; default_qty: number; default_warranty_days: number; part_status: string }>) {
    // Replace all parts for this problem atomically
    const { error: delErr } = await adminSupabase
      .from('service_problem_parts')
      .delete()
      .eq('problem_id', problemId)
    if (delErr) throw delErr

    if (parts.length === 0) return []

    const { data, error } = await db('service_problem_parts')
      .insert(parts.map((p) => ({ ...p, problem_id: problemId })))
      .select()
    if (error) throw error
    return data
  },
}
