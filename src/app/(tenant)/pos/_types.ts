import type { Product } from '@/types/database'

// ── Tab / level types ──────────────────────────────────────────────────────────
export type PosTab = 'repairs' | 'products'
export type RepairLevel = 'categories' | 'brands' | 'devices' | 'problems' | 'details'
export type ProductsView = 'all_products' | 'by_products' | 'by_parts' | 'custom_item'
export type CatLevel = 'device_types' | 'brands' | 'models' | 'products'
export type PartLevel = 'device_types' | 'brands' | 'models' | 'part_types' | 'parts'

// ── Domain interfaces ──────────────────────────────────────────────────────────
export interface ServiceCategory  { id: string; name: string; image_url?: string | null; slug: string }
export interface ServiceBrand     { id: string; name: string; logo_url?: string | null }
export interface ServiceDevice    { id: string; name: string; image_url?: string | null; manufacturer_id: string }
export interface ServiceProblem   { id: string; name: string; price: number; cost: number; warranty_days: number }
export interface ProductVariant   { id: string; name: string; sku: string | null; selling_price: number; cost_price: number | null; attributes: Record<string, string> }
export type ProductWithStock = Product & { on_hand?: number; has_variants?: boolean; variant_count?: number }
export interface RegisterSession  { id: string; status: 'open' | 'closed'; opening_float: number; opened_at: string; cashier_id: string }
export interface Employee         { id: string; full_name: string }

export interface RepairDetailsForm {
  imei_type: 'Serial' | 'IMEI'
  serial_number: string
  lock_type: 'passcode' | 'pattern'
  passcode: string
  repair_charges: number
  charge_deposit: boolean
  deposit_amount: number
  is_rush: boolean
  assigned_to: string
  due_date: string
  status: string
  physical_location: string
  task_type: string
  problem_warranties: Record<string, string>
}

// ── Shared constants ───────────────────────────────────────────────────────────
export const WARRANTY_OPTIONS = ['No Warranty', '30 Days', '60 Days', '90 Days', '6 Months', '1 Year', '2 Years']

export const REPAIR_STATUS_OPTIONS = [
  { value: 'waiting_for_inspection', label: 'Waiting for Inspection' },
  { value: 'in_progress',            label: 'In Progress' },
  { value: 'waiting_for_parts',      label: 'Waiting for Parts' },
  { value: 'repaired',               label: 'Repaired' },
  { value: 'picked_up',              label: 'Picked Up' },
]

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
