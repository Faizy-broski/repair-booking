/**
 * Rate Limit Middleware — in-memory sliding window rate limiter.
 *
 * For production, replace the in-memory store with Upstash Redis:
 *   @upstash/ratelimit + @upstash/redis
 *
 * Current implementation uses a Map keyed by IP address.
 * Suitable for single-instance deployments (Vercel Serverless: use Redis).
 */
import { NextRequest, NextResponse } from 'next/server'
import { tooManyRequests } from '@/backend/utils/api-response'

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store — cleared on cold start. Safe for development.
const store = new Map<string, RateLimitEntry>()

interface RateLimitOptions {
  /** Max requests per window */
  limit?: number
  /** Window duration in seconds */
  windowMs?: number
}

export function rateLimitMiddleware(
  request: NextRequest,
  options: RateLimitOptions = {}
): NextResponse | null {
  // No rate limiting in development — all requests share one IP bucket
  // ('unknown') which causes false 429s during normal navigation.
  if (process.env.NODE_ENV !== 'production') return null

  const { limit = 300, windowMs = 60 * 1000 } = options

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs })
    return null // OK
  }

  entry.count += 1

  if (entry.count > limit) {
    return tooManyRequests()
  }

  return null // OK
}

// Periodically clean up expired entries to avoid memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000) // every 5 minutes
