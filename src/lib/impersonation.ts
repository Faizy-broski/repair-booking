import { SignJWT, jwtVerify } from 'jose'

export interface ImpersonationPayload {
  targetUserId: string
  businessId: string
  role: string
  branchId: string | null
  subdomain: string
}

function getSecret(): Uint8Array {
  const secret = process.env.IMPERSONATION_SECRET
  if (!secret) throw new Error('IMPERSONATION_SECRET env var is not set')
  return new TextEncoder().encode(secret)
}

export async function signImpersonationJwt(payload: ImpersonationPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getSecret())
}

export async function verifyImpersonationJwt(token: string): Promise<ImpersonationPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as ImpersonationPayload
  } catch {
    return null
  }
}
