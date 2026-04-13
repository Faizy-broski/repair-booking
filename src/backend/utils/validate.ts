import { z, ZodSchema } from 'zod'
import { badRequest } from './api-response'
import { NextResponse } from 'next/server'

export async function validateBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { data: null, error: badRequest('Request body must be valid JSON') }
  }
  const result = schema.safeParse(body)
  if (!result.success) {
    // Zod v4 uses .issues; v3 used .errors — support both for safety
    const issues = result.error.issues ?? (result.error as any).errors ?? []
    const message = issues.map((e: { path: (string | number)[]; message: string }) =>
      e.path.length ? `${e.path.join('.')}: ${e.message}` : e.message
    ).join(', ')
    return { data: null, error: badRequest(message || 'Validation failed', 'VALIDATION_ERROR') }
  }
  return { data: result.data, error: null }
}

// Common reusable schemas
export const uuidSchema = z.string().uuid()

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
