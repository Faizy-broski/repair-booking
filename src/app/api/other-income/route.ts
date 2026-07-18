import { withMiddleware } from '@/backend/middleware'
import { OtherIncomeController } from '@/backend/controllers/other-income.controller'

export const GET = withMiddleware(OtherIncomeController.listOtherIncome, { requiredRole: 'staff' })
export const POST = withMiddleware(OtherIncomeController.createOtherIncome, { requiredRole: 'staff' })
