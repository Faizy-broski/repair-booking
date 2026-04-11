import { NextRequest } from 'next/server'
import { AuthService } from '@/backend/services/auth.service'
import { ok, badRequest } from '@/backend/utils/api-response'

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email')
  if (!email || !email.includes('@')) return badRequest('Invalid email')

  const available = await AuthService.checkEmailAvailable(email.toLowerCase())
  return ok({ available })
}
