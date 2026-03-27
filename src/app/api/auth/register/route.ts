import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/backend/services/auth.service'
import { created, badRequest, conflict, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'

const schema = z.object({
  businessName: z.string().min(2),
  subdomain: z.string().min(2).max(30).regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  phone: z.string().optional(),
  fullName: z.string().min(2),
  password: z.string().min(8),
  mainBranchName: z.string().min(2),
})

export async function POST(request: NextRequest) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error

  try {
    const result = await AuthService.register(data)
    return created({ businessId: result.business.id })
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('already taken') || message.includes('already exists')) return conflict(message)
    return serverError(message, err)
  }
}
