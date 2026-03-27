import { withMiddleware } from '@/backend/middleware'
import { BundleController } from '@/backend/controllers/advanced-inventory.controller'

export const GET  = withMiddleware(BundleController.list,   { requiredRole: 'staff' })
export const POST = withMiddleware(BundleController.create, { requiredRole: 'branch_manager' })
