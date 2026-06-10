import { PassThrough } from 'stream'
import { createGzip } from 'zlib'
import { adminSupabase } from '@/backend/config/supabase'
import nodemailer from 'nodemailer'

const BUCKET = 'business-backups'
const PAGE_SIZE = 500

// Bump this whenever a table is added to or removed from the backup scope.
export const BACKUP_SCHEMA_VERSION = 86

// ── Table manifest ─────────────────────────────────────────────────────────────
// All tables are in FK-safe order (parents before children) for safe restore.

// Queried via .eq('business_id', businessId)
const BUSINESS_TABLES = [
  // Core tenant
  'businesses',
  'subscriptions',
  'branches',
  'profiles',
  'module_settings',
  'invoice_settings',
  'role_permissions',
  // Customer management
  'customer_groups',
  'customers',
  'store_credits',
  'store_credit_transactions',
  'loyalty_settings',
  'loyalty_points',
  'loyalty_transactions',
  'custom_field_definitions',
  // Product catalog
  'brands',
  'categories',
  'part_types',
  'product_attributes',
  'products',
  'product_variants',
  'product_bundles',
  'suppliers',
  // Service catalog (Category → Manufacturer → Device → Problem)
  'service_categories',
  'service_manufacturers',
  'service_devices',
  'service_problems',
  // Employees
  'employees',
  'commission_rules',
  'employee_commissions',
  // Repair configuration
  'repair_custom_statuses',
  'repair_faults',
  'ticket_workflows',
  'canned_responses',
  'notification_templates',
  // Financial
  'expense_categories',
  'gift_cards',
  'invoices',
  'expenses',
  // Misc
  'trade_in_transactions',
] as const

// Queried via .in('branch_id', branchIds)
const BRANCH_TABLES = [
  // Inventory
  'inventory',
  'inventory_serials',
  'inventory_cost_layers',
  'inventory_counts',
  'stock_movements',
  'branch_products',
  // Sales & POS
  'sales',
  'register_sessions',
  'cash_movements',
  // Repairs
  'repairs',
  // Employee time tracking
  'shifts',
  'time_clocks',
  'salaries',
  'payroll_periods',
  // Supply chain
  'purchase_orders',
  // Appointments & booking
  'appointments',
  'business_hours',
  'booking_settings',
  'blocked_dates',
  // Google Reviews
  'google_reviews',
] as const

// Child tables exported after their parents. Key = parent table name.
// 'fk' is the column on the child table that references the parent's 'id'.
// goods_receiving_notes is both a child of purchase_orders AND a parent of grn_items —
// handled separately in the two-level child export.
const CHILD_TABLE_MAP: Record<string, { fk: string; tables: string[] }> = {
  // Business-scoped parents
  ticket_workflows:      { fk: 'workflow_id',      tables: ['ticket_workflow_steps'] },
  product_bundles:       { fk: 'bundle_id',         tables: ['product_bundle_items'] },
  service_problems:      { fk: 'problem_id',        tables: ['service_problem_parts'] },
  // Branch-scoped parents
  repairs:               { fk: 'repair_id',         tables: ['repair_items', 'repair_status_history', 'repair_estimates'] },
  sales:                 { fk: 'sale_id',           tables: ['sale_items'] },
  purchase_orders:       { fk: 'purchase_order_id', tables: ['purchase_order_items', 'goods_receiving_notes'] },
  inventory_counts:      { fk: 'count_id',          tables: ['inventory_count_items'] },
  shifts:                { fk: 'shift_id',          tables: ['employee_shifts'] },
  register_sessions:     { fk: 'session_id',        tables: ['register_session_members'] },
  // goods_receiving_notes itself is a child of purchase_orders; its children are handled
  // in the two-level phase below — do NOT add grn_items here.
}

// ── Pagination helper ──────────────────────────────────────────────────────────

/**
 * Yields 500-record pages filtered by an IN clause.
 * Chunks filterVals into groups of 100 to stay within PostgREST URL length limits.
 * Silently skips tables that return a query error (e.g. migration not yet applied).
 */
async function* paginateByIn(
  table: string,
  filterCol: string,
  filterVals: string[],
): AsyncGenerator<Record<string, unknown>[]> {
  if (!filterVals.length) return

  for (let i = 0; i < filterVals.length; i += 100) {
    const chunk = filterVals.slice(i, i + 100)
    let offset = 0
    while (true) {
      const { data, error } = await (adminSupabase as any)
        .from(table)
        .select('*')
        .in(filterCol, chunk)
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        // Log but do not throw — a missing column or table should not abort the entire backup.
        console.warn(`[BackupService] Query warning on "${table}": ${error.message}`)
        break
      }
      if (!data?.length) break

      yield data
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE

      // Yield to the event loop between pages so ongoing HTTP requests aren't starved.
      await new Promise(r => setImmediate(r))
    }
  }
}

/**
 * Streams one table's records into the gzip pipe as a JSON array.
 * Returns { count, ids } — ids are the 'id' column values for child-table queries.
 */
async function streamTable(
  write: (s: string) => void,
  table: string,
  filterCol: string,
  filterVals: string[],
): Promise<{ count: number; ids: string[] }> {
  write(`"${table}":[`)
  let first = true
  let count = 0
  const ids: string[] = []

  for await (const page of paginateByIn(table, filterCol, filterVals)) {
    for (const record of page) {
      if (!first) write(',')
      write(JSON.stringify(record))
      first = false
      count++
      if (record.id) ids.push(record.id as string)
    }
  }

  write(']')
  return { count, ids }
}

// ── Core export ────────────────────────────────────────────────────────────────

export interface BackupResult {
  path: string
  sizeBytes: number
  recordCounts: Record<string, number>
}

export async function exportBusinessToStorage(
  businessId: string,
  date: string,
): Promise<BackupResult> {
  console.log(`[BackupService] Starting export for business ${businessId} (${date})`)

  const { data: branchRows } = await adminSupabase
    .from('branches')
    .select('id')
    .eq('business_id', businessId)
  const branchIds = (branchRows ?? []).map(r => r.id as string)

  // ── Streaming pipeline setup ────────────────────────────────────────────────
  // PassThrough → gzip Transform → Buffer chunks collected in memory.
  // Data is written page-by-page so peak RAM = one compressed page at a time,
  // not the full uncompressed JSON.
  const pass = new PassThrough()
  const gz = createGzip({ level: 6 })
  pass.pipe(gz)

  const gzipChunks: Buffer[] = []
  let sizeBytes = 0
  gz.on('data', (chunk: Buffer) => { gzipChunks.push(chunk); sizeBytes += chunk.length })

  // Register gzipFinished BEFORE any writes start so no 'end' event is missed.
  // The .catch(() => {}) prevents an unhandled rejection if we destroy the streams
  // in the catch path below — we throw the original error instead.
  const gzipFinished = new Promise<void>((resolve, reject) => {
    gz.once('end', resolve)
    gz.once('error', reject)
  })
  gzipFinished.catch(() => { /* handled via throw in catch block below */ })

  const write = (s: string) => pass.write(s, 'utf8')
  const recordCounts: Record<string, number> = {}
  const businessParentIds: Record<string, string[]> = {}
  const branchParentIds: Record<string, string[]> = {}

  try {
    write(`{"schemaVersion":${BACKUP_SCHEMA_VERSION},"businessId":"${businessId}","exportedAt":"${new Date().toISOString()}","tables":{`)

    // 1. Business-scoped tables
    let firstTable = true
    for (const table of BUSINESS_TABLES) {
      if (!firstTable) write(',')
      const { count, ids } = await streamTable(write, table, 'business_id', [businessId])
      recordCounts[table] = count
      if (CHILD_TABLE_MAP[table]) businessParentIds[table] = ids
      firstTable = false
    }

    // 2. Branch-scoped tables
    if (branchIds.length > 0) {
      for (const table of BRANCH_TABLES) {
        write(',')
        const { count, ids } = await streamTable(write, table, 'branch_id', branchIds)
        recordCounts[table] = count
        if (CHILD_TABLE_MAP[table]) branchParentIds[table] = ids
      }

      // 3. First-level child tables
      const allParentIds = { ...businessParentIds, ...branchParentIds }
      let grnIds: string[] = []

      for (const [parentTable, { fk, tables }] of Object.entries(CHILD_TABLE_MAP)) {
        // grn_items is two levels deep; skip and handle in step 4
        if (parentTable === 'goods_receiving_notes') continue

        const pIds = allParentIds[parentTable] ?? []
        for (const table of tables) {
          write(',')
          if (pIds.length === 0) {
            write(`"${table}":[]`)
            recordCounts[table] = 0
            continue
          }
          const { count, ids } = await streamTable(write, table, fk, pIds)
          recordCounts[table] = count
          if (table === 'goods_receiving_notes') grnIds = ids
        }
      }

      // 4. grn_items: second-level child (goods_receiving_notes → grn_items)
      write(',')
      if (grnIds.length > 0) {
        const { count } = await streamTable(write, 'grn_items', 'grn_id', grnIds)
        recordCounts['grn_items'] = count
      } else {
        write('"grn_items":[]')
        recordCounts['grn_items'] = 0
      }
    } else {
      // No branches — write empty arrays so the restore script has consistent keys
      for (const table of BRANCH_TABLES) {
        write(`,"${table}":[]`)
        recordCounts[table] = 0
      }
      for (const [parentTable, { tables }] of Object.entries(CHILD_TABLE_MAP)) {
        if (parentTable === 'goods_receiving_notes') continue
        for (const table of tables) {
          write(`,"${table}":[]`)
          recordCounts[table] = 0
        }
      }
      write(`,"grn_items":[]`)
      recordCounts['grn_items'] = 0
    }

    write(`},"recordCounts":${JSON.stringify(recordCounts)}}`)

    // Signal end of input to the gzip stream and wait for it to flush.
    pass.end()
  } catch (err) {
    // Destroy both streams so the gzip pipeline doesn't hang and all handles are freed.
    // gzipFinished will reject (triggering gz's 'error' event) but the .catch() above
    // suppresses that as an unhandled rejection — the original error is re-thrown instead.
    pass.destroy()
    gz.destroy()
    throw err
  }

  await gzipFinished

  const compressed = Buffer.concat(gzipChunks)
  const path = `${businessId}/${date}.json.gz`

  const { error: uploadError } = await adminSupabase.storage
    .from(BUCKET)
    .upload(path, compressed, { contentType: 'application/gzip', upsert: true })
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  console.log(`[BackupService] Completed export for ${businessId}: ${(sizeBytes / 1024).toFixed(1)} KB compressed`)
  return { path, sizeBytes, recordCounts }
}

// ── Scheduling helpers ─────────────────────────────────────────────────────────

export async function scheduleBackupsForToday(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]

  const { data: businesses, error } = await adminSupabase
    .from('businesses')
    .select('id')
    .eq('is_active', true)
    .eq('is_suspended', false)
  if (error) throw new Error(`Failed to fetch businesses: ${error.message}`)

  const rows = (businesses ?? []).map(b => ({
    business_id:    b.id,
    backup_date:    today,
    storage_path:   `${b.id}/${today}.json.gz`,
    status:         'pending',
    schema_version: BACKUP_SCHEMA_VERSION,
  }))
  if (rows.length === 0) return 0

  const { error: upsertError } = await adminSupabase
    .from('backup_registry')
    .upsert(rows, { onConflict: 'business_id,backup_date', ignoreDuplicates: true })
  if (upsertError) throw new Error(`Registry upsert failed: ${upsertError.message}`)

  return rows.length
}

export async function processNextPendingBackup(): Promise<{
  processed: boolean
  businessId?: string
  result?: BackupResult
  error?: string
}> {
  const today = new Date().toISOString().split('T')[0]

  // Fetch one pending row. .single() returns an error (code PGRST116) when 0 rows
  // are found — handled by the `if (fetchError || !row)` guard below.
  const { data: row, error: fetchError } = await adminSupabase
    .from('backup_registry')
    .select('id, business_id')
    .eq('status', 'pending')
    .eq('backup_date', today)
    .order('started_at', { ascending: true })
    .limit(1)
    .single()

  if (fetchError || !row) return { processed: false }

  // Mark as running immediately. If two cron calls fire simultaneously (rare with
  // staggered crontab entries), both may claim the same row — the second update
  // is harmless since it overwrites to 'running' again and the export is idempotent
  // (upsert: true on storage upload).
  await adminSupabase
    .from('backup_registry')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', row.id)

  try {
    const result = await exportBusinessToStorage(row.business_id, today)

    await adminSupabase
      .from('backup_registry')
      .update({
        status:        'completed',
        storage_path:  result.path,
        size_bytes:    result.sizeBytes,
        record_counts: result.recordCounts,
        completed_at:  new Date().toISOString(),
      })
      .eq('id', row.id)

    return { processed: true, businessId: row.business_id, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[BackupService] Export failed for ${row.business_id}:`, message)

    await adminSupabase
      .from('backup_registry')
      .update({ status: 'failed', error_message: message })
      .eq('id', row.id)

    await sendFailureAlert(row.business_id, today, message)
    return { processed: true, businessId: row.business_id, error: message }
  }
}

export async function cleanupOldBackups(): Promise<{ deleted: number }> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const { data: old } = await adminSupabase
    .from('backup_registry')
    .select('id, storage_path')
    .lt('backup_date', cutoffStr)
    .eq('status', 'completed')

  if (!old?.length) return { deleted: 0 }

  // Remove files from storage — ignore per-file errors (orphaned files are harmless)
  await adminSupabase.storage.from(BUCKET).remove(old.map(r => r.storage_path))

  const { error } = await adminSupabase
    .from('backup_registry')
    .delete()
    .in('id', old.map(r => r.id))

  if (error) throw new Error(`Cleanup delete failed: ${error.message}`)
  return { deleted: old.length }
}

// ── Failure alert ──────────────────────────────────────────────────────────────

async function sendFailureAlert(businessId: string, date: string, message: string): Promise<void> {
  const to = process.env.ADMIN_ALERT_EMAIL
  if (!to) return

  let transport: ReturnType<typeof nodemailer.createTransport> | null = null
  try {
    const host   = process.env.SMTP_HOST   ?? 'smtp.ethereal.email'
    const port   = parseInt(process.env.SMTP_PORT ?? '587')
    const secure = process.env.SMTP_SECURE === 'true' || port === 465
    const from   = process.env.SMTP_FROM ?? process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? ''

    transport = nodemailer.createTransport({
      host, port, secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { rejectUnauthorized: false, servername: host },
    } as any)

    await transport.sendMail({
      from, to,
      subject: `[BACKUP FAILED] Business ${businessId} — ${date}`,
      text: `A scheduled backup failed.\n\nBusiness ID: ${businessId}\nDate: ${date}\nError: ${message}`,
    })
  } catch (e) {
    console.error('[BackupService] Failed to send alert email:', e)
  } finally {
    // Always close the transport to release the TCP connection.
    transport?.close()
  }
}
