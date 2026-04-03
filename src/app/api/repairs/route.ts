import { withMiddleware } from '@/backend/middleware'
import { RepairController } from '@/backend/controllers/repair.controller'

export const GET = withMiddleware(RepairController.list, { requiredRole: 'cashier' })
export const POST = withMiddleware(RepairController.create, { requiredRole: 'staff' })
