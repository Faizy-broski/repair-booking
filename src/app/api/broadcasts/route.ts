import { withMiddleware } from '@/backend/middleware'
import { BroadcastController } from '@/backend/controllers/broadcast.controller'

// GET /api/broadcasts — tenant fetches active broadcasts + their read IDs
export const GET = withMiddleware(BroadcastController.listForTenant, { requiredRole: 'cashier' })
