#!/usr/bin/env node
/**
 * Restore a single business from a JSON backup file.
 *
 * Usage:
 *   node --env-file=.env.local scripts/restore-business.mjs <path-to-backup.json.gz>
 *
 * IMPORTANT:
 *   - Run against a STAGING project first — upserts WILL overwrite existing records.
 *   - auth.users (login credentials) are not in this backup. Use Layer 1 (pg_dump) for
 *     full auth restore, or re-invite users via the Supabase dashboard.
 *   - The 'businesses' row is included — it will overwrite the current business record.
 */

import { readFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  console.error('Run with: node --env-file=.env.local scripts/restore-business.mjs <file>')
  process.exit(1)
}

const backupFile = process.argv[2]
if (!backupFile) {
  console.error('Usage: node --env-file=.env.local scripts/restore-business.mjs <backup.json.gz>')
  process.exit(1)
}

// FK-safe restore order — must match the export order in backup.service.ts.
// Parents MUST be upserted before their children.
const RESTORE_ORDER = [
  // ── Core tenant ──
  'businesses',
  'subscriptions',
  'branches',
  'profiles',
  'module_settings',
  'business_module_access',      // depends on module_config_templates (global/seeded, not backed up)
  'invoice_settings',
  'invoice_reminder_settings',
  'role_permissions',
  'messages',                    // depends on profiles (sender_id)
  'employee_activity_log',       // depends on profiles (user_id)

  // ── Customer management ──
  'customer_groups',
  'customers',
  'store_credits',
  'store_credit_transactions',
  'loyalty_settings',
  'loyalty_points',
  'loyalty_transactions',
  'custom_field_definitions',

  // ── Product catalog ──
  'brands',
  'categories',
  'part_types',
  'product_attributes',
  'product_attribute_values',    // child of product_attributes
  'category_attributes',         // depends on categories AND product_attributes
  'products',
  'product_variants',
  'product_bundles',
  'suppliers',

  // ── Service catalog ──
  'service_categories',
  'service_manufacturers',
  'service_devices',
  'service_problems',
  'service_problem_parts',      // child of service_problems

  // ── Employee management ──
  'employees',
  'commission_rules',
  'employee_commissions',

  // ── Repair configuration ──
  'repair_custom_statuses',
  'repair_faults',
  'ticket_workflows',
  'ticket_workflow_steps',      // child of ticket_workflows
  'canned_responses',
  'notification_templates',
  'notification_log',           // depends on notification_templates
  'ticket_labels',

  // ── Financial configuration ──
  'expense_categories',
  'gift_cards',
  'invoices',
  'expenses',
  'other_income_categories',

  // ── Trade-ins ──
  'trade_in_transactions',

  // ── Branch-scoped: Inventory ──
  'inventory',
  'inventory_serials',
  'inventory_cost_layers',
  'inventory_counts',
  'inventory_count_items',      // child of inventory_counts
  'stock_movements',
  'branch_products',

  // ── Branch-scoped: Sales & POS ──
  'register_sessions',
  'register_session_members',   // child of register_sessions
  'cash_movements',
  'sales',
  'sale_items',                 // child of sales
  'sale_payments',               // depends on sales (and customers)

  // ── Branch-scoped: Repairs ──
  'repairs',
  'repair_items',               // child of repairs
  'repair_status_history',      // child of repairs
  'repair_estimates',           // child of repairs
  'repair_condition_items',     // depends on repairs

  // ── Branch-scoped: Supply chain ──
  'purchase_orders',
  'purchase_order_items',       // child of purchase_orders
  'goods_receiving_notes',      // child of purchase_orders
  'grn_items',                  // child of goods_receiving_notes
  'supplier_payments',          // depends on purchase_orders (and suppliers)

  // ── Branch-scoped: Employee time tracking ──
  'shifts',
  'employee_shifts',            // child of shifts
  'time_clocks',
  'salaries',
  'payroll_periods',

  // ── Branch-scoped: Appointments & Booking ──
  'appointments',
  'business_hours',
  'booking_settings',
  'blocked_dates',

  // ── Branch-scoped: Google Reviews ──
  'google_reviews',
  'google_review_settings',

  // ── Branch-scoped: Other income ──
  'other_income',                // depends on other_income_categories

  // ── Customer assets ──
  'customer_assets',             // depends on customers

  // ── Product bundle children ──
  'product_bundle_items',       // child of product_bundles
]

const UPSERT_CHUNK = 200

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nReading backup: ${backupFile}`)
  const raw = readFileSync(backupFile)
  const json = backupFile.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8')
  const backup = JSON.parse(json)

  const { schemaVersion, businessId, exportedAt, tables, recordCounts } = backup

  console.log(`  Business ID    : ${businessId}`)
  console.log(`  Exported at    : ${exportedAt}`)
  console.log(`  Schema version : ${schemaVersion}`)
  console.log(`  Total records  : ${Object.values(recordCounts ?? {}).reduce((a, b) => a + b, 0)}\n`)

  const RESTORE_SCRIPT_VERSION = 88
  if (schemaVersion > RESTORE_SCRIPT_VERSION) {
    console.warn(`WARNING: Backup schema version ${schemaVersion} is newer than this restore script (${RESTORE_SCRIPT_VERSION}).`)
    console.warn('Some tables added after this script was written may be missing from RESTORE_ORDER — see the "unordered" pass below.\n')
  }

  let totalRestored = 0

  async function restoreTable(table) {
    const rows = tables[table]
    if (!rows?.length) {
      process.stdout.write(`  ${table.padEnd(34)} skipped (empty)\n`)
      return
    }

    process.stdout.write(`  ${table.padEnd(34)} ${String(rows.length).padStart(6)} records ... `)

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK)
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
      if (error) {
        process.stdout.write(`\nERROR at chunk ${i}: ${error.message}\n`)
        process.exit(1)
      }
    }

    totalRestored += rows.length
    process.stdout.write('done\n')
  }

  for (const table of RESTORE_ORDER) {
    await restoreTable(table)
  }

  // The export side (backup.service.ts) discovers business/branch-scoped
  // tables dynamically, so a table can exist in the backup JSON without a
  // hand-curated FK position here yet. Restore it anyway rather than silently
  // dropping real data — just flag it loudly so someone adds it to
  // RESTORE_ORDER in the correct FK position once they've checked its
  // dependencies (see backup.service.ts's CHILD_TABLE_MAP / migration
  // definitions for the actual foreign keys).
  const known = new Set(RESTORE_ORDER)
  const unordered = Object.keys(tables).filter(t => !known.has(t))
  if (unordered.length > 0) {
    console.warn(`\nWARNING: ${unordered.length} table(s) in this backup aren't in RESTORE_ORDER yet — restoring last, in unverified order:`)
    console.warn(`  ${unordered.join(', ')}`)
    console.warn('  If any of these reference another table in this list via a foreign key, this could fail or restore in the wrong order.\n')
    for (const table of unordered) {
      await restoreTable(table)
    }
  }

  console.log(`\nRestore complete — ${totalRestored} records upserted.`)
  console.log('\nNOTE: auth.users (login credentials) are not in this backup.')
  console.log('      Re-invite users via Supabase dashboard if restoring to a fresh project.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
