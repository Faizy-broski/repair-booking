import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ok, unauthorized, serverError, badRequest } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'
import { cookies } from 'next/headers'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (pairs) => {
          pairs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

export const AuthController = {
  async login(request: NextRequest) {
    const { data, error } = await validateBody(request, loginSchema)
    if (error) return error

    try {
      const supabase = await createClient()
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) return unauthorized(authError.message)

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, businesses(subdomain,name,currency,timezone)')
        .eq('id', authData.user.id)
        .single()

      return ok({ user: authData.user, session: authData.session, profile })
    } catch (err) {
      return serverError('Login failed', err)
    }
  },

  async logout(request: NextRequest) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.signOut()
      if (error) return serverError('Logout failed', error)
      return ok({ logged_out: true })
    } catch (err) {
      return serverError('Logout failed', err)
    }
  },
}
