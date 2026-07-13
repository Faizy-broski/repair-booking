import type { Product } from '@/types/database'

// ── Tab / level types ──────────────────────────────────────────────────────────
export type PosTab = 'repairs' | 'products'
export type ProductsView = 'all_products' | 'by_products' | 'by_parts' | 'by_category' | 'custom_item'
export type CatLevel = 'device_types' | 'brands' | 'models' | 'products'
export type PartLevel = 'device_types' | 'brands' | 'models' | 'part_types' | 'parts'

// ── Domain interfaces ──────────────────────────────────────────────────────────
export interface ProductVariant   { id: string; name: string; sku: string | null; selling_price: number; cost_price: number | null; attributes: Record<string, string>; image_url?: string | null; stock?: number | null }
export type ProductWithStock = Product & { on_hand?: number; has_variants?: boolean; variant_count?: number }
export interface RegisterSession  { id: string; status: 'open' | 'closed'; opening_float: number; opened_at: string; cashier_id: string }
export interface Employee         { id: string; full_name: string }

// ── Z-Report (returned by close_register_session RPC) ──────────────────────────
export interface ZReport {
  session_id?: string
  total_sales?: number
  total_refunds?: number
  cash_sales?: number
  card_sales?: number
  store_credit_sales?: number
  loyalty_points_sales?: number
  other_sales?: number
  transaction_count?: number
  cash_in?: number
  cash_out?: number
  buyback_out?: number
  credit_repayments_cash?: number
  credit_repayments_total?: number
  opening_float?: number
  closing_cash?: number
  expected_cash?: number
  variance?: number
  repair_sales?: number
  repair_refunds?: number
  repair_transaction_count?: number
  repair_cash_sales?: number
  repair_card_sales?: number
  repair_store_credit_sales?: number
  repair_loyalty_points_sales?: number
  repair_other_sales?: number
  credit_activity?: CreditActivityEntry[]
  grand_total?: number
  opened_at?: string
  closed_at?: string
}

export interface CreditActivityEntry {
  type: 'store_credit' | 'loyalty_points'
  customer_name: string
  amount: number
  reference_type: string
  reference_id: string
  note: string | null
  created_at: string
}

export interface RepairLineItem {
  tempId: string
  product_id: string | null
  name: string
  qty: number
  unit_price: number
  unit_cost: number
  max_stock: number | null
}

export interface RepairDetailsForm {
  device_type: string
  device_brand: string
  device_model: string
  serial_number: string
  faults: string[]
  job_fee: string
  estimated_cost: string
  deposit_paid: string
  price_pending: boolean
  due_date: string
  status: string
  assigned_to: string
  lock_type: '' | 'passcode' | 'pattern'
  passcode: string
  payment_method: '' | 'cash' | 'card' | 'store_credit' | 'loyalty_points'
  credit_apply_input: string
  loyalty_apply_input: string
  is_rush: boolean
  physical_location: string
  task_type: string
  device_network: string
}

// ── Shared constants ───────────────────────────────────────────────────────────
export const TASK_TYPE_OPTIONS = ['In-Store', 'Mail-In', 'Pick-Up']

export const DENOMINATIONS = [
  { label: '£50', value: 50   }, { label: '£20', value: 20   }, { label: '£10', value: 10   },
  { label: '£5',  value: 5    }, { label: '£2',  value: 2    }, { label: '£1',  value: 1    },
  { label: '50p', value: 0.50 }, { label: '20p', value: 0.20 }, { label: '10p', value: 0.10 },
  { label: '5p',  value: 0.05 }, { label: '2p',  value: 0.02 }, { label: '1p',  value: 0.01 },
]

export function denomTotal(denoms: Record<string, number>): number {
  return DENOMINATIONS.reduce((sum, d) => sum + (denoms[String(d.value)] ?? 0) * d.value, 0)
}
