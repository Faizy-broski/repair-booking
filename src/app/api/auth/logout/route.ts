import { NextRequest } from 'next/server'
import { AuthController } from '@/backend/controllers/auth.controller'

export async function POST(request: NextRequest) {
  return AuthController.logout(request)
}
