import { withMiddleware } from '@/backend/middleware'
import { OtherIncomeController } from '@/backend/controllers/other-income.controller'

export const GET = withMiddleware(OtherIncomeController.listCategories, { requiredRole: 'staff' })
export const POST = withMiddleware(OtherIncomeController.createCategory, { requiredRole: 'branch_manager' })
