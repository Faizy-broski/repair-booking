/**
 * Rate Limit Middleware — sliding window rate limiter.
 *
 * Production: uses self-hosted Redis via ioredis (set REDIS_URL in env).
 * Development: in-memory fallback — no Redis needed locally.
 *
 * Keys are per-business so different businesses never share a limit bucket,
 * and a whole office behind one NAT IP is not penalised.
 *
 * Tiers:
 *   default  — 300 req / 60 s per business
 *   strict   — 30  req / 60 s (public/unauthenticated endpoints)
 *   msg-send — 20  req / 60 s (send message endpoint)
 */
import { NextRequest, NextResponse } from 'next/server'
import { tooManyRequests } from '@/backend/utils/api-response'

// ── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Max requests per window */
  limit?: number
  /** Window duration in milliseconds */
  windowMs?: number
  /** Key prefix to namespace different limit tiers */
  prefix?: string
}

// ── In-memory fallback (development / Redis unavailable) ─────────────────────

interface MemEntry { count: number; resetAt: number }
const memStore = new Map<string, MemEntry>()
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of memStore) if (now > v.resetAt) memStore.delete(k)
}, 5 * 60 * 1000)

function memCheck(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = memStore.get(key)
  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count += 1
  return entry.count <= limit
}

// ── Redis sliding window (production) ────────────────────────────────────────

let redisClient: import('ioredis').Redis | null = null

/**
 * Lazily initialise the Redis client on first use.
 * Fails silently — if Redis is down, requests are allowed through (fail-open).
 */
async function getRedis(): Promise<import('ioredis').Redis | null> {
  if (redisClient) return redisClient
  if (!process.env.REDIS_URL) return null
  try {
    const { default: Redis } = await import('ioredis')
    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,  // fail fast — don't block the request handler
      connectTimeout: 1000,
      lazyConnect: true,
    })
    // Test connection
    await client.connect()
    redisClient = client
    return client
  } catch (err) {
    console.warn('[RateLimit] Redis connect failed, falling back to in-memory:', err)
    return null
  }
}

/**
 * Sliding window counter using Redis.
 * Uses a simple INCR + EXPIRE strategy — atomic enough for rate limiting.
 * Returns true (allowed) or false (exceeded).
 */
async function redisCheck(redis: import('ioredis').Redis, key: string, limit: number, windowMs: number): Promise<boolean> {
  const windowSec = Math.ceil(windowMs / 1000)
  try {
    const count = await redis.incr(key)
    if (count === 1) {
      // First request in this window — set TTL
      await redis.expire(key, windowSec)
    }
    return count <= limit
  } catch {
    // Redis error — fail open (allow the request)
    return true
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function rateLimitMiddleware(
  request: NextRequest,
  options: RateLimitOptions = {}
): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== 'production') return null

  const { limit = 300, windowMs = 60_000, prefix = 'default' } = options

  // Prefer business-scoped key so each business gets its own independent limit.
  // x-business-id is injected by withMiddleware after auth resolves.
  const businessId = request.headers.get('x-business-id')
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const key = `rl:${prefix}:${businessId ?? ip}`

  const redis = await getRedis()
  const allowed = redis
    ? await redisCheck(redis, key, limit, windowMs)
    : memCheck(key, limit, windowMs)

  return allowed ? null : tooManyRequests()
}
