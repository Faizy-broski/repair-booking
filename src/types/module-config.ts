import type { Module } from '@/backend/config/constants'

export type ModuleName = Module

// ── Metadata attached to every resolved config ────────────────────────────────

export interface ModuleConfigMeta {
  module: ModuleName
  /** Final computed visibility: plan ceiling AND business is_enabled AND plan_override */
  is_enabled: boolean
  template_id: string | null
  template_name: string | null
  /** True if business or branch has any settings_override on top of the template */
  has_override: boolean
}

// ── Per-module settings shapes ────────────────────────────────────────────────
// All fields are optional — partial override pattern.
// The DB function merges template + business override + branch override.

export interface PosSettings {
  receipt_header?: string
  receipt_footer?: string
  tax_rate?: number              // e.g. 0.20 for 20%
  tax_label?: string             // e.g. "VAT"
  rounding_mode?: 'none' | 'nearest_5p' | 'nearest_10p'
  allow_discounts?: boolean
  require_customer?: boolean
  enable_split_payment?: boolean
}

export interface InventorySettings {
  low_stock_threshold?: number
  track_serial_numbers?: boolean
  allow_negative_stock?: boolean
  default_tax_rate?: number
}

export interface RepairsSettings {
  statuses?: Array<{ key: string; label: string; color: string }>
  device_types?: string[]
  job_number_prefix?: string
  warranty_days?: number
  require_deposit?: boolean
  default_deposit_pct?: number
  sms_on_status_change?: boolean
}

export interface CustomersSettings {
  required_fields?: Array<'email' | 'phone' | 'address'>
  loyalty_enabled?: boolean
  loyalty_points_per_pound?: number
  loyalty_redeem_threshold?: number
}

export interface AppointmentsSettings {
  working_hours?: {
    [day in 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun']?: {
      open: string    // HH:mm
      close: string   // HH:mm
      closed: boolean
    }
  }
  slot_duration_minutes?: number
  buffer_minutes?: number
  allow_online_booking?: boolean
  booking_advance_days?: number
}

export interface ExpensesSettings {
  require_receipt?: boolean
  approval_required_above?: number
}

export interface EmployeesSettings {
  track_time?: boolean
  overtime_threshold_hours?: number
  pay_period?: 'weekly' | 'biweekly' | 'monthly'
}

export interface ReportsSettings {
  default_date_range?: 'today' | 'week' | 'month' | 'year'
  visible_widgets?: string[]
}

export interface MessagesSettings {
  enable_cross_branch?: boolean
}

export interface InvoicesSettings {
  default_due_days?: number
  invoice_prefix?: string
  show_tax_breakdown?: boolean
  footer_text?: string
}

export interface GiftCardsSettings {
  expiry_days?: number | null    // null = never expires
  allow_partial_redemption?: boolean
}

export interface GoogleReviewsSettings {
  auto_reply_enabled?: boolean
  min_rating_to_highlight?: number
}

export interface PhoneSettings {
  recording_enabled?: boolean
  voicemail_greeting?: string
}

export interface NotificationsSettings {
  email_enabled?: boolean
  sms_enabled?: boolean
  push_enabled?: boolean
  notify_on_new_repair?: boolean
  notify_on_status_change?: boolean
  notify_on_payment?: boolean
  notify_on_low_stock?: boolean
}

// ── Map: module name → settings type ─────────────────────────────────────────

export interface ModuleSettingsMap {
  pos: PosSettings
  inventory: InventorySettings
  repairs: RepairsSettings
  customers: CustomersSettings
  appointments: AppointmentsSettings
  expenses: ExpensesSettings
  employees: EmployeesSettings
  reports: ReportsSettings
  messages: MessagesSettings
  invoices: InvoicesSettings
  gift_cards: GiftCardsSettings
  google_reviews: GoogleReviewsSettings
  phone: PhoneSettings
  notifications: NotificationsSettings
}

// ── Resolved config (what the frontend receives from the API) ─────────────────

export type ResolvedModuleConfig<M extends ModuleName = ModuleName> =
  ModuleSettingsMap[M] & { _meta: ModuleConfigMeta }

export type ResolvedModuleConfigMap = {
  [M in ModuleName]: ResolvedModuleConfig<M>
}

// ── DB row types ──────────────────────────────────────────────────────────────

export interface ModuleConfigTemplate {
  id: string
  module: ModuleName
  name: string
  description: string | null
  settings: Partial<ModuleSettingsMap[ModuleName]>
  is_default: boolean
  version: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface BusinessModuleAccess {
  id: string
  business_id: string
  module: ModuleName
  is_enabled: boolean
  plan_override: boolean | null
  template_id: string | null
  template_version: number | null
  settings_override: Partial<ModuleSettingsMap[ModuleName]>
  assigned_by: string | null
  created_at: string
  updated_at: string
}

export interface BranchModuleOverride {
  id: string
  branch_id: string
  module: ModuleName
  settings_override: Partial<ModuleSettingsMap[ModuleName]>
  updated_at: string
}

// ── API payload types ─────────────────────────────────────────────────────────

export interface UpdateBranchModuleOverridePayload {
  settings_override: Partial<ModuleSettingsMap[ModuleName]>
}

export interface UpdateBusinessModuleAccessPayload {
  is_enabled?: boolean
  plan_override?: boolean | null
  template_id?: string | null
  settings_override?: Partial<ModuleSettingsMap[ModuleName]>
}

export interface CreateTemplatePayload {
  module: ModuleName
  name: string
  description?: string
  settings: Partial<ModuleSettingsMap[ModuleName]>
  is_default?: boolean
}

export interface PushTemplatePayload {
  business_ids: string[] | 'all'
  push_mode: 'force_override' | 'merge_missing_only'
}

// ── Phase 10: Business Vertical Templates ─────────────────────────────────────

export interface BusinessVerticalTemplate {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
  modules_enabled: ModuleName[]
  module_settings: Partial<Record<ModuleName, Partial<ModuleSettingsMap[ModuleName]>>>
  default_plan_id: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateVerticalTemplatePayload {
  name: string
  slug: string
  description?: string
  icon?: string
  modules_enabled: ModuleName[]
  module_settings?: Partial<Record<ModuleName, Partial<ModuleSettingsMap[ModuleName]>>>
  default_plan_id?: string | null
  sort_order?: number
}

export interface VerticalTemplateApplyLog {
  id: string
  template_id: string
  business_id: string
  applied_by: string | null
  apply_mode: 'initial' | 'reapply' | 'merge'
  modules_applied: ModuleName[]
  diff_snapshot: Record<string, unknown>
  created_at: string
}

// ── Phase 10: Plan Limits ─────────────────────────────────────────────────────

export interface PlanLimits {
  max_custom_fields?: number
  max_products?: number
  max_services?: number
  max_employees?: number
  max_customers?: number
  max_appointments_per_month?: number
  storage_limit_mb?: number
  has_api_access?: boolean
  has_white_label?: boolean
  has_priority_support?: boolean
  has_customer_portal?: boolean
  has_online_booking?: boolean
  has_multi_branch?: boolean
  has_advanced_reports?: boolean
}

export const PLAN_LIMIT_KEYS: Array<{ key: keyof PlanLimits; label: string; type: 'number' | 'boolean' }> = [
  { key: 'max_custom_fields', label: 'Max Custom Fields', type: 'number' },
  { key: 'max_products', label: 'Max Products', type: 'number' },
  { key: 'max_services', label: 'Max Services', type: 'number' },
  { key: 'max_employees', label: 'Max Employees', type: 'number' },
  { key: 'max_customers', label: 'Max Customers', type: 'number' },
  { key: 'max_appointments_per_month', label: 'Max Appointments/Month', type: 'number' },
  { key: 'storage_limit_mb', label: 'Storage Limit (MB)', type: 'number' },
  { key: 'has_api_access', label: 'API Access', type: 'boolean' },
  { key: 'has_white_label', label: 'White Label', type: 'boolean' },
  { key: 'has_priority_support', label: 'Priority Support', type: 'boolean' },
  { key: 'has_customer_portal', label: 'Customer Portal', type: 'boolean' },
  { key: 'has_online_booking', label: 'Online Booking', type: 'boolean' },
  { key: 'has_multi_branch', label: 'Multi-Branch', type: 'boolean' },
  { key: 'has_advanced_reports', label: 'Advanced Reports', type: 'boolean' },
]

// ── Phase 10: Template Push Diff ──────────────────────────────────────────────

export interface TemplatePushDiffItem {
  business_id: string
  business_name: string
  module: ModuleName
  changes: Array<{
    field: string
    current_value: unknown
    new_value: unknown
  }>
}

export interface TemplatePushPreview {
  template_id: string
  template_name: string
  push_mode: 'force_override' | 'merge_missing_only'
  affected_count: number
  diffs: TemplatePushDiffItem[]
}
