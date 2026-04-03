import { withMiddleware } from '@/backend/middleware'
import { ServiceCategoryController } from '@/backend/controllers/service-hierarchy.controller'

export const GET  = withMiddleware(ServiceCategoryController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(ServiceCategoryController.create,  { requiredRole: 'branch_manager' })
