import { randomBytes } from 'crypto'
import { adminSupabase } from '@/backend/config/supabase'

// Bypass Supabase type recursion limit — short_links isn't in generated types yet.
const db = (table: string): any => (adminSupabase as any).from(table)

// No 0/O/1/l/I — avoids characters that look alike when read off a screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generateCode(length = 7): string {
  const bytes = randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) code += ALPHABET[bytes[i] % ALPHABET.length]
  return code
}

export const ShortLinkService = {
  // Wraps targetUrl behind a short /s/{code} redirect, expiring at the same
  // time as whatever it points to (typically a signed storage URL) so the
  // short link never outlives the thing it's shortening.
  async create(targetUrl: string, businessId: string, expiresAt: Date): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode()
      const { error } = await db('short_links').insert({
        code,
        target_url: targetUrl,
        business_id: businessId,
        expires_at: expiresAt.toISOString(),
      })
      if (!error) return code
      if (error.code !== '23505') throw new Error(error.message) // not a PK collision — real failure
      // else: extremely unlikely code collision — loop and try a fresh one
    }
    throw new Error('Failed to generate a unique short link code')
  },

  async resolve(code: string): Promise<string | null> {
    const { data } = await db('short_links')
      .select('target_url, expires_at')
      .eq('code', code)
      .maybeSingle()
    if (!data) return null
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null
    return data.target_url as string
  },
}
