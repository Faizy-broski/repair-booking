import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { unauthorized } from '@/backend/utils/api-response'

export interface AuthContext {
  userId: string
  role: string
  businessId: string | null
  branchId: string | null
}

export async function authMiddleware(
  request: NextRequest
): Promise<{ context: AuthContext; error: null } | { context: null; error: ReturnType<typeof unauthorized> }> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { context: null, error: unauthorized() }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, business_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return { context: null, error: unauthorized('Profile not found') }
  }

  return {
    context: {
      userId: user.id,
      role: profile.role,
      businessId: profile.business_id,
      branchId: profile.branch_id,
    },
    error: null,
  }
}
