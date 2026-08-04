import { withMiddleware } from '@/backend/middleware'
import { RepairController } from '@/backend/controllers/repair.controller'

export const POST = withMiddleware(RepairController.checkConflict, { requiredRole: 'staff' })
