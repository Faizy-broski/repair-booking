import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'
import { escapeIlike } from '@/backend/utils/search'

// Plates are compared/stored uppercased with spaces stripped so "AB12 CDE",
// "ab12cde" and "AB12CDE" are all treated as the same registration.
export function normalizePlate(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

export const VehicleService = {
  async list(businessId: string, params: { search?: string; customerId?: string }) {
    let q = adminSupabase
      .from('vehicles')
      .select('*, customers(id, first_name, last_name, phone, email)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (params.customerId) q = q.eq('customer_id', params.customerId)
    if (params.search) {
      const term = `%${escapeIlike(normalizePlate(params.search))}%`
      q = q.ilike('registration_number', term)
    }

    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('vehicles')
      .select('*, customers(id, first_name, last_name, phone, email)')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) return null
    return data
  },

  // Used by the phone find-or-create flow to warn staff when a plate is
  // already attached to a different customer, instead of silently creating
  // a duplicate vehicle row.
  async findByPlate(businessId: string, plate: string) {
    const { data, error } = await adminSupabase
      .from('vehicles')
      .select('*, customers(id, first_name, last_name, phone, email)')
      .eq('business_id', businessId)
      .eq('registration_number', normalizePlate(plate))
      .eq('is_active', true)
    if (error) throw error
    return data ?? []
  },

  async create(payload: InsertTables<'vehicles'>) {
    const { data, error } = await adminSupabase
      .from('vehicles')
      .insert({ ...payload, registration_number: normalizePlate(payload.registration_number) })
      .select('*, customers(id, first_name, last_name, phone, email)')
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'vehicles'>) {
    const patch = { ...payload }
    if (patch.registration_number) patch.registration_number = normalizePlate(patch.registration_number)
    const { data, error } = await adminSupabase
      .from('vehicles')
      .update(patch)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*, customers(id, first_name, last_name, phone, email)')
      .single()
    if (error) throw error
    return data
  },

  // Soft-delete: vehicles are referenced by historical repairs (vehicle_id),
  // so we deactivate rather than hard-delete to keep job history intact.
  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('vehicles')
      .update({ is_active: false })
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}
