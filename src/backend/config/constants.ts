export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  BUSINESS_OWNER: 'business_owner',
  BRANCH_MANAGER: 'branch_manager',
  STAFF: 'staff',
  CASHIER: 'cashier',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const REPAIR_STATUSES = [
  'received',
  'in_progress',
  'waiting_parts',
  'repaired',
  'unrepairable',
  'collected',
] as const

export type RepairStatus = (typeof REPAIR_STATUSES)[number]

export const MODULES = [
  'pos',
  'inventory',
  'repairs',
  'customers',
  'appointments',
  'expenses',
  'employees',
  'reports',
  'messages',
  'invoices',
  'gift_cards',
  'google_reviews',
  'phone',
] as const

export type Module = (typeof MODULES)[number]

export const PAGINATION_LIMIT = 20
