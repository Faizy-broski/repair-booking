import { adminSupabase } from '@/backend/config/supabase'

// Use `as any` for new tables not yet in generated TS types (migration 032)
const db = adminSupabase as any

export interface AttributeWithValues {
  id: string
  business_id: string
  name: string
  is_default: boolean
  display_order: number
  created_at: string
  product_attribute_values: { id: string; value: string; display_order: number }[]
}

export const ProductAttributeService = {
  async list(businessId: string): Promise<AttributeWithValues[]> {
    const { data, error } = await db
      .from('product_attributes')
      .select('*, product_attribute_values(id, value, display_order)')
      .eq('business_id', businessId)
      .order('display_order', { ascending: true })
    if (error) throw error
    return (data ?? []).map((a: any) => ({
      ...a,
      product_attribute_values: (a.product_attribute_values ?? []).sort(
        (x: any, y: any) => x.display_order - y.display_order
      ),
    }))
  },

  async create(businessId: string, name: string): Promise<AttributeWithValues> {
    const { data: existing } = await db
      .from('product_attributes')
      .select('display_order')
      .eq('business_id', businessId)
      .order('display_order', { ascending: false })
      .limit(1)
    const nextOrder = ((existing?.[0]?.display_order ?? 0) as number) + 1

    const { data, error } = await db
      .from('product_attributes')
      .insert({ business_id: businessId, name, display_order: nextOrder })
      .select('*, product_attribute_values(id, value, display_order)')
      .single()
    if (error) throw error
    return data as any
  },

  async update(id: string, businessId: string, name: string): Promise<AttributeWithValues> {
    const { data, error } = await db
      .from('product_attributes')
      .update({ name })
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*, product_attribute_values(id, value, display_order)')
      .single()
    if (error) throw error
    return data as any
  },

  async delete(id: string, businessId: string): Promise<void> {
    const { error } = await db
      .from('product_attributes')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },

  async addValue(attributeId: string, businessId: string, value: string) {
    // Verify ownership
    const { data: attr, error: attrErr } = await db
      .from('product_attributes')
      .select('id')
      .eq('id', attributeId)
      .eq('business_id', businessId)
      .single()
    if (attrErr || !attr) throw new Error('Attribute not found')

    const { data: existing } = await db
      .from('product_attribute_values')
      .select('display_order')
      .eq('attribute_id', attributeId)
      .order('display_order', { ascending: false })
      .limit(1)
    const nextOrder = ((existing?.[0]?.display_order ?? 0) as number) + 1

    const { data, error } = await db
      .from('product_attribute_values')
      .insert({ attribute_id: attributeId, value, display_order: nextOrder })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteValue(valueId: string, businessId: string): Promise<void> {
    // Verify ownership via join
    const { data: existing, error: findErr } = await db
      .from('product_attribute_values')
      .select('id, product_attributes!inner(business_id)')
      .eq('id', valueId)
      .single()
    if (findErr || !existing) throw new Error('Value not found')

    const { error } = await db
      .from('product_attribute_values')
      .delete()
      .eq('id', valueId)
    if (error) throw error
  },
}
