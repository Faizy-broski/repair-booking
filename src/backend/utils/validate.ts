import { z, ZodSchema } from 'zod'
import { badRequest } from './api-response'
import { NextResponse } from 'next/server'

export async function validateBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const body = await request.json()
    const result = schema.safeParse(body)
    if (!result.success) {
      const message = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      return { data: null, error: badRequest(message, 'VALIDATION_ERROR') }
    }
    return { data: result.data, error: null }
  } catch {
    return { data: null, error: badRequest('Invalid JSON body') }
  }
}

// Common reusable schemas
export const uuidSchema = z.string().uuid()

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
