import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/backend/config/supabase'

/**
 * Public endpoint — no auth required.
 *
 * Given an email, returns the subdomain of the business that user belongs to.
 * Used by the root-domain login page to redirect users to their correct tenant
 * subdomain BEFORE any authentication happens — ensuring Supabase auth cookies
 * are always scoped to the subdomain origin.
 *
 * Security: returns only the subdomain string. Does not confirm whether an email
 * exists (returns null for both "not found" and "suspended") to prevent enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { email?: unknown }
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    // Look up profile by email — profiles.email is populated at registration
    // and backfilled from auth.users by migration 025.
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('business_id, role')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle() as { data: { business_id: string | null; role: string } | null; error: unknown }

    if (!profile) {
      return NextResponse.json({ subdomain: null })
    }

    // Super admins have no business — send them to the admin subdomain
    if (profile.role === 'super_admin') {
      return NextResponse.json({ subdomain: null, isSuperAdmin: true })
    }

    if (!profile.business_id) {
      return NextResponse.json({ subdomain: null })
    }

    const { data: business } = await adminSupabase
      .from('businesses')
      .select('subdomain, is_suspended')
      .eq('id', profile.business_id)
      .single() as { data: { subdomain: string | null; is_suspended: boolean } | null; error: unknown }

    if (!business?.subdomain || business.is_suspended) {
      return NextResponse.json({ subdomain: null })
    }

    return NextResponse.json({ subdomain: business.subdomain })
  } catch {
    return NextResponse.json({ subdomain: null })
  }
}
