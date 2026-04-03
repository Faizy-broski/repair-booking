import { adminSupabase } from '@/backend/config/supabase'
import { forbidden } from '@/backend/utils/api-response'

export async function validateBranchAccess(
  branchId: string,
  businessId: string
): Promise<{ valid: true; error: null } | { valid: false; error: ReturnType<typeof forbidden> }> {
  const { data } = await adminSupabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('business_id', businessId)
    .single()

  if (!data) {
    return { valid: false, error: forbidden('Branch does not belong to this business') }
  }

  return { valid: true, error: null }
}
