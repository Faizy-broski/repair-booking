import type { Product } from '@/types/database'

// ── Tab / level types ──────────────────────────────────────────────────────────
export type PosTab = 'repairs' | 'products'
export type ProductsView = 'all_products' | 'by_products' | 'by_parts' | 'by_category' | 'custom_item'
export type CatLevel = 'device_types' | 'brands' | 'models' | 'products'
export type PartLevel = 'device_types' | 'brands' | 'models' | 'part_types' | 'parts'

// ── Domain interfaces ──────────────────────────────────────────────────────────
export interface ProductVariant   {
  id: string; name: string; sku: string | null; selling_price: number; cost_price: number | null
  attributes: Record<string, string>; image_url?: string | null; stock?: number | null
  active_discount?: { discount_price: number; quantity_remaining: number } | null
}
export type ProductWithStock = Product & {
  on_hand?: number; has_variants?: boolean; variant_count?: number
  active_discount?: { discount_price: number; quantity_remaining: number } | null
  // True when at least one variant of this product has an active discount —
  // the exact price/quantity varies per variant, so the card just shows a
  // SALE indicator; the specific price choice happens in the variant popover.
  has_variant_discount?: boolean
}
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
  // Riseteck-only: other_sales broken down by individual custom channel
  // (eBay/Deliveroo/Website) — empty/undefined for every other business.
  // See Part 12 of the plan / migration 198.
  other_sales_breakdown?: Record<string, number>
  transaction_count?: number
  cash_in?: number
  cash_out?: number
  buyback_out?: number
  credit_repayments_cash?: number
  credit_repayments_total?: number
  opening_float?: number
  closing_cash?: number
  closing_card_total?: number
  expected_cash?: number
  variance?: number
  repair_sales?: number
  repair_refunds?: number
  repair_transaction_count?: number
  repair_cash_sales?: number
  repair_card_sales?: number
  // Repair revenue collected via the Repairs module directly (deposits,
  // top-ups, direct-collection payments) — deliberately excludes any repair
  // paid through the POS cart, since that portion is already inside
  // cash_sales/card_sales above. Combining these with cash_sales/card_sales
  // gives a correct "Total Cash/Card Sales" figure with no double-counting
  // — see Part 11 of the plan (migration 197 exposed repair_cash_deposits;
  // repair_card_deposits was already exposed by migration 190 but never
  // added to this type until now).
  repair_cash_deposits?: number
  repair_card_deposits?: number
  repair_store_credit_sales?: number
  repair_loyalty_points_sales?: number
  repair_other_sales?: number
  credit_activity?: CreditActivityEntry[]
  grand_total?: number
  opened_at?: string
  closed_at?: string
  expenses?: number
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
  payment_methods: ('cash' | 'card' | 'store_credit' | 'loyalty_points')[]
  payment_amounts: { cash: string; card: string }
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

// Display label for a payment/split-tender method. Covers the built-in
// methods plus Riseteck's custom split-payment channels (eBay, Deliveroo,
// Website — gated via business_module_access.settings_override.
// custom_payment_channels, see supabase/migrations/106_custom_payment_
// channels.sql). Was previously duplicated as a local CHANNEL_LABELS map in
// cart-panel.tsx; shared here so the same labels render consistently in the
// End Shift screen, live stats bar, Z-Report, and Reports > Payments page
// (see Part 12 of the plan). Falls back to simple title-case for any other
// custom channel a business might be granted later, so a future channel
// name doesn't need another code change to display sensibly.
const CHANNEL_LABEL_OVERRIDES: Record<string, string> = {
  cash: 'Cash', card: 'Card', ebay: 'eBay', deliveroo: 'Deliveroo', website: 'Website',
  gift_card: 'Gift Card', store_credit: 'Store Credit', loyalty_points: 'Loyalty Points',
  on_account: 'On Account',
}
export function channelLabel(method: string): string {
  if (CHANNEL_LABEL_OVERRIDES[method]) return CHANNEL_LABEL_OVERRIDES[method]
  return method
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}
