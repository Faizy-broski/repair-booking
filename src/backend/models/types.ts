/**
 * Backend domain models — typed views of the database rows used by services and controllers.
 * These are re-exports and extensions of the generated database types.
 */
export type {
  Plan,
  Business,
  Branch,
  Profile,
  Subscription,
  Product,
  ProductVariant,
  Inventory,
  StockMovement,
  Brand,
  Category,
  Customer,
  Sale,
  SaleItem,
  Repair,
  RepairItem,
  RepairStatusHistory,
  Expense,
  ExpenseCategory,
  Salary,
  Employee,
  TimeClock,
  Appointment,
  Message,
  Invoice,
  GiftCard,
  GoogleReview,
  GoogleReviewSettings,
  CustomFieldDefinition,
  ModuleSettings,
  InsertTables,
  UpdateTables,
  Json,
} from '@/types/database'

// ──────────────────────────────────────────────────────────────────────────────
// Domain-level extended types (include joined relations returned by services)
// ──────────────────────────────────────────────────────────────────────────────

export interface RepairWithRelations {
  id: string
  branch_id: string
  job_number: string
  status: string
  device_type: string | null
  device_brand: string | null
  device_model: string | null
  serial_number: string | null
  issue: string
  estimated_cost: number | null
  actual_cost: number | null
  deposit_paid: number
  notify_customer: boolean
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
  customers: {
    id: string
    first_name: string
    last_name: string | null
    email: string | null
    phone: string | null
  } | null
  profiles: { full_name: string | null } | null
  repair_items: {
    id: string
    name: string
    quantity: number
    unit_price: number
    unit_cost: number
  }[]
  repair_status_history: {
    id: string
    old_status: string | null
    new_status: string
    note: string | null
    email_sent: boolean
    created_at: string
    profiles: { full_name: string | null } | null
  }[]
}

export interface SaleWithRelations {
  id: string
  branch_id: string
  total: number
  subtotal: number
  discount: number
  tax: number
  payment_method: string
  payment_status: string
  created_at: string
  customers: { first_name: string; last_name: string | null } | null
  profiles: { full_name: string | null } | null
  sale_items?: {
    id: string
    name: string
    quantity: number
    unit_price: number
    total: number
  }[]
}

export interface DashboardStats {
  total_sales: number
  sales_count: number
  repairs_open: number
  repairs_completed: number
  total_expenses: number
  low_stock_count: number
}

export interface BranchRevenueStat {
  branchId: string
  branchName: string
  total: number
}

export interface ProfitLossReport {
  revenue: number
  expenses: number
  salaries: number
  totalCosts: number
  profit: number
}
