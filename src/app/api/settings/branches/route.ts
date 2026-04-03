import { withMiddleware } from '@/backend/middleware'
import { BranchController } from '@/backend/controllers/branch.controller'

export const GET = withMiddleware(BranchController.list, { requiredRole: 'business_owner' })
export const POST = withMiddleware(BranchController.create, { requiredRole: 'business_owner' })
