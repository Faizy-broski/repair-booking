import { NextRequest } from 'next/server'
import { AuthService } from '@/backend/services/auth.service'
import { ok, badRequest } from '@/backend/utils/api-response'

export async function GET(request: NextRequest) {
  const subdomain = request.nextUrl.searchParams.get('subdomain')
  if (!subdomain || subdomain.length < 2) return badRequest('Invalid subdomain')

  const available = await AuthService.checkSubdomainAvailable(subdomain.toLowerCase())
  return ok({ available })
}
