import { withPublicMiddleware } from '@/backend/middleware/public.middleware'
import { PublicLeadController } from '@/backend/controllers/public-lead.controller'

// 10 req/min — plenty for a human filling out a form, tight enough to deter abuse.
export const POST = withPublicMiddleware(PublicLeadController.submit, { rateLimit: 10 })
