import { NextRequest, NextResponse } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { RepairService } from '@/backend/services/repair.service'
import { StoreCreditService } from '@/backend/services/store-credit.service'
import { LoyaltyService } from '@/backend/services/loyalty.service'
import { CommissionService } from '@/backend/services/payroll.service'
import { NotificationEngine } from '@/backend/services/notification-engine.service'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

// ── Shared repair PDF generators ────────────────────────────────────────────
// Server-rendered with a fixed page size so the print output is deterministic —
// no client-side height measurement, no popup timing races. Same pattern as
// buildReceiptBuffer in pos.controller.ts.

function pdfResponse(buffer: Buffer | Uint8Array, filename: string) {
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      // Content depends on invoice design settings which can change at any time
      'Cache-Control': 'no-store',
    },
  })
}

// Assembles the plain-data shape shared by the server-rendered PDF (standard
// paper sizes: A4/A5/Letter) and the thermal HTML print path (Receipt80/58/
// Custom — see getInvoiceData/RepairReceiptHtml). Keeping one data-builder
// means both paths always agree on totals/items/branch info.
async function getRepairInvoiceData(repairId: string, branchId: string | null, businessId: string) {
  const [repair, { InvoiceSettingsService }, { DEFAULT_INVOICE_SETTINGS }] = await Promise.all([
    RepairService.getById(repairId, branchId ?? undefined),
    import('@/backend/services/invoice-settings.service'),
    import('@/types/invoice-settings'),
  ])

  if (!repair) return null
  const r = repair as any

  const [settings, branchRow, businessRow] = await Promise.all([
    InvoiceSettingsService.get(businessId, r.branch_id ?? null),
    adminSupabase.from('branches').select('name, address, phone, email, logo_url').eq('id', r.branch_id).single().then((res) => res.data),
    adminSupabase.from('businesses').select('name, currency').eq('id', businessId).single().then((res) => res.data),
  ])

  const repairItems: any[] = Array.isArray(r.repair_items) ? r.repair_items : []
  const items = repairItems.length > 0
    ? repairItems.map((item) => ({
        description: item.name,
        quantity:    item.quantity ?? 1,
        unit_price:  Number(item.unit_price ?? 0),
      }))
    : [{
        description: `${r.issue || 'Repair Service'} (${r.device_type} ${r.device_brand} ${r.device_model})`,
        quantity:    1,
        unit_price:  Number(r.estimated_cost ?? 0),
      }]

  const invoiceTotal = repairItems.length > 0
    ? items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
    : Number(r.estimated_cost ?? 0)

  const customer     = r.customers
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name ?? ''}`.trim()
    : 'Walk-In'
  const cf = (r.custom_fields as Record<string, unknown>) ?? {}

  const mergedSettings = {
    ...DEFAULT_INVOICE_SETTINGS,
    ...settings,
    logo_url:  settings.logo_url  ?? branchRow?.logo_url ?? null,
    show_logo: settings.show_logo !== false && !!(settings.logo_url ?? branchRow?.logo_url),
  }

  return {
    settings:        mergedSettings,
    invoiceNumber:   r.job_number as string,
    status:          r.status as string,
    issuedAt:        r.created_at as string,
    dueAt:           (cf.due_date as string) ?? null,
    businessName:    businessRow?.name ?? branchRow?.name ?? 'Business',
    branchName:      branchRow?.name ?? null,
    branchAddress:   branchRow?.address ?? null,
    branchPhone:     branchRow?.phone ?? null,
    branchEmail:     branchRow?.email ?? null,
    customerName,
    customerEmail:   customer?.email ?? null,
    customerPhone:   customer?.phone ?? null,
    customerAddress: customer?.address ?? null,
    items,
    subtotal:        invoiceTotal,
    discount:        0,
    tax:             0,
    total:           invoiceTotal,
    amountPaid:      Number(r.deposit_paid ?? 0),
    notes:           r.notes ?? null,
    currency:        businessRow?.currency ?? 'GBP',
    jobNumber:       r.job_number as string,
  }
}

async function buildRepairInvoiceBuffer(repairId: string, branchId: string | null, businessId: string) {
  const [data, renderToBuffer, { InvoicePdf }, React] = await Promise.all([
    getRepairInvoiceData(repairId, branchId, businessId),
    import('@react-pdf/renderer').then((m) => m.renderToBuffer),
    import('@/components/pdf/invoice-pdf'),
    import('react').then((m) => m.default),
  ])

  if (!data) return null
  const doc = React.createElement(InvoicePdf, data)
  return { buffer: await renderToBuffer(doc as any), jobNumber: data.jobNumber }
}

// Same split as above: plain data for the thermal HTML path, PDF for A4/A5/Letter.
// Extended to include full repair details so the HTML slip matches the Laravel blade output.
async function getRepairSlipData(repairId: string, branchId: string | null, businessId: string) {
  const [repair, { code128DataUrl }, { InvoiceSettingsService }] = await Promise.all([
    RepairService.getById(repairId, branchId ?? undefined),
    import('@/backend/utils/barcode'),
    import('@/backend/services/invoice-settings.service'),
  ])

  if (!repair) return null
  const r = repair as any
  const jobNumber = r.job_number as string
  const settings = await InvoiceSettingsService.get(businessId, r.branch_id ?? null)

  // Fetch branch info for header (name, address, phone)
  const [{ data: branchRow }, { data: businessRow }] = await Promise.all([
    adminSupabase.from('branches').select('name, address, phone').eq('id', r.branch_id).single(),
    adminSupabase.from('businesses').select('name').eq('id', businessId).single(),
  ])

  const customer = r.customers
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name ?? ''}`.trim()
    : 'Walk-In'

  // Faults come from the issue field or custom_fields
  const cf = (r.custom_fields as Record<string, unknown>) ?? {}
  const faults: string[] = cf.faults
    ? (Array.isArray(cf.faults) ? cf.faults : [String(cf.faults)])
    : r.issue
    ? [r.issue]
    : []

  const deviceLabel = [r.device_brand, r.device_model].filter(Boolean).join(' ') || r.device_type || 'Device'

  // Charges: use repair_items if present, otherwise estimated_cost
  const repairItems: any[] = Array.isArray(r.repair_items) ? r.repair_items : []
  const totalRepairCharges = repairItems.length > 0
    ? repairItems.reduce((s: number, it: any) => s + (it.quantity ?? 1) * Number(it.unit_price ?? 0), 0)
    : Number(r.estimated_cost ?? 0)
  const deposit = Number(r.deposit_paid ?? 0)
  const remaining = Math.max(0, totalRepairCharges - deposit)

  return {
    jobNumber,
    barcodeDataUrl: await code128DataUrl(jobNumber),
    paperSize: settings.paper_size as string,
    customWidth: settings.custom_width ?? null,
    // Full repair details for the HTML slip
    businessName:   businessRow?.name ?? branchRow?.name ?? 'Business',
    branchAddress:  branchRow?.address ?? null,
    branchPhone:    branchRow?.phone ?? null,
    customerName,
    deviceLabel,
    faults,
    dueDate:        r.due_date ?? null,
    createdAt:      r.created_at as string,
    totalRepairCharges,
    deposit,
    remaining,
  }
}

async function buildRepairSlipBuffer(repairId: string, branchId: string | null, businessId: string) {
  const [data, renderToBuffer, { RepairSlipPdf }, React] = await Promise.all([
    getRepairSlipData(repairId, branchId, businessId),
    import('@react-pdf/renderer').then((m) => m.renderToBuffer),
    import('@/components/pdf/repair-slip-pdf'),
    import('react').then((m) => m.default),
  ])

  if (!data) return null
  const doc = React.createElement(RepairSlipPdf, data)
  return { buffer: await renderToBuffer(doc as any), jobNumber: data.jobNumber }
}

const createSchema = z.object({
  branch_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  device_type: z.string().optional().nullable(),
  device_brand: z.string().optional().nullable(),
  device_model: z.string().optional().nullable(),
  serial_number: z.string().optional().nullable(),
  issue: z.string().min(1),
  estimated_cost: z.number().min(0).optional().nullable(),
  deposit_paid: z.number().min(0).default(0),
  notify_customer: z.boolean().default(true),
  is_rush: z.boolean().default(false),
  lock_type: z.string().optional().nullable(),
  passcode: z.string().optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).default({}),
  asset_id: z.string().uuid().optional().nullable(),
  store_credit_applied: z.number().min(0).optional(),
  loyalty_points_applied: z.number().int().min(0).optional(),
  parts: z.array(z.object({
    product_id: z.string().uuid().optional().nullable(),
    name: z.string(),
    quantity: z.number().int().min(1).default(1),
    unit_cost: z.number().min(0).default(0),
    unit_price: z.number().min(0).default(0),
  })).optional().default([]),
})

const updateSchema = createSchema.partial().omit({ branch_id: true })

const statusSchema = z.object({
  status: z.string().min(1),
  note: z.string().optional().default(''),
  send_email: z.boolean().default(false),
})

// Debits store credit / loyalty points for a repair payment (deposit or a later
// top-up). Failures are logged and reported back as a warning rather than
// failing the whole request — the repair itself (and its deposit_paid figure)
// has already been saved by this point.
async function applyRepairCreditLoyalty(
  businessId: string,
  customerId: string,
  repair: { id: string; job_number?: string | null },
  amounts: { storeCreditApplied?: number; loyaltyPointsApplied?: number }
): Promise<string | null> {
  const warnings: string[] = []

  if (amounts.storeCreditApplied && amounts.storeCreditApplied > 0) {
    try {
      await StoreCreditService.debit(businessId, customerId, amounts.storeCreditApplied, {
        note: `Repair #${repair.job_number ?? repair.id.slice(-8)} payment`,
        referenceId: repair.id,
        referenceType: 'repair',
      })
    } catch (err: any) {
      warnings.push(`Store credit not applied: ${err?.message ?? 'unknown error'}`)
    }
  }

  if (amounts.loyaltyPointsApplied && amounts.loyaltyPointsApplied > 0) {
    try {
      await LoyaltyService.redeemPoints(businessId, customerId, amounts.loyaltyPointsApplied, {
        referenceId: repair.id,
        referenceType: 'repair',
      })
    } catch (err: any) {
      warnings.push(`Loyalty points not applied: ${err?.message ?? 'unknown error'}`)
    }
  }

  return warnings.length > 0 ? warnings.join('; ') : null
}

export const RepairController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await RepairService.list(branchId, {
        page,
        limit,
        status: searchParams.get('status') ?? undefined,
        search: searchParams.get('search') ?? undefined,
        businessId: ctx.businessId,
        customerId: searchParams.get('customer_id') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch repairs', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? undefined
    try {
      const repair = await RepairService.getById(id, branchId)
      if (!repair) return notFound('Repair not found')
      return ok(repair)
    } catch (err) {
      return serverError('Failed to fetch repair', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const { parts, store_credit_applied, loyalty_points_applied, ...repairPayload } = data
      const repair = await RepairService.create(repairPayload)

      // Save repair items (parts) if any
      if (parts && parts.length > 0 && repair) {
        const knownParts   = parts.filter(p => p.product_id)
        const quickAddParts = parts.filter(p => !p.product_id)

        // Resolve quick-add parts: single batch lookup instead of N sequential queries
        const resolvedQuickAdd: typeof parts = []
        if (quickAddParts.length > 0) {
          const names = quickAddParts.map(p => p.name.trim())

          // 1 query: fetch all existing parts matching any of the names (case-insensitive)
          const { data: existingProducts } = await adminSupabase
            .from('products')
            .select('id, name')
            .eq('business_id', ctx.businessId)
            .eq('item_type', 'part')
            .or(names.map(n => `name.ilike.${n.replace(/[,()]/g, '')}`).join(','))

          const existingMap = new Map(
            (existingProducts ?? []).map(p => [p.name.toLowerCase(), p.id])
          )

          const toCreate = quickAddParts.filter(p => !existingMap.has(p.name.trim().toLowerCase()))

          // 1 query: batch insert all new products
          let newProductMap = new Map<string, string>()
          if (toCreate.length > 0) {
            const { data: created } = await adminSupabase
              .from('products')
              .insert(toCreate.map(p => ({
                business_id:   ctx.businessId,
                name:          p.name.trim(),
                item_type:     'part',
                is_service:    false,
                cost_price:    p.unit_cost ?? 0,
                selling_price: p.unit_price ?? 0,
              })))
              .select('id, name')

            newProductMap = new Map((created ?? []).map(p => [p.name.toLowerCase(), p.id]))

            // 1 query: batch seed inventory rows for all new products
            const inventoryRows = (created ?? []).map(p => ({
              branch_id:       data.branch_id,
              product_id:      p.id,
              variant_id:      null,
              quantity:        0,
              low_stock_alert: 5,
            }))
            if (inventoryRows.length > 0) {
              await adminSupabase.from('inventory').insert(inventoryRows)
            }
          }

          // Build resolved list
          for (const p of quickAddParts) {
            const key = p.name.trim().toLowerCase()
            const productId = existingMap.get(key) ?? newProductMap.get(key) ?? null
            resolvedQuickAdd.push({ ...p, product_id: productId })
          }

          // 1 query: batch upsert branch_products visibility for all resolved parts
          const branchProductRows = resolvedQuickAdd
            .filter(p => p.product_id)
            .map(p => ({ branch_id: data.branch_id, product_id: p.product_id!, is_enabled: true }))
          if (branchProductRows.length > 0) {
            await adminSupabase
              .from('branch_products')
              .upsert(branchProductRows, { onConflict: 'branch_id,product_id' })
          }
        }

        const allResolved = [...knownParts, ...resolvedQuickAdd]
        const items = allResolved.map(p => ({
          repair_id:  repair.id,
          product_id: p.product_id,
          name:       p.name,
          quantity:   p.quantity,
          unit_cost:  p.unit_cost,
          unit_price: p.unit_price,
        }))
        await adminSupabase.from('repair_items').insert(items)

        // Deduct inventory for physical parts immediately on creation
        const { error: deductError } = await adminSupabase.rpc('deduct_repair_parts', {
          p_repair_id: repair.id,
          p_branch_id: data.branch_id,
        })
        if (deductError) console.error('[RepairController.create] deduct_repair_parts failed:', deductError)
      }

      // Fire ticket_created notification in background
      if (data.notify_customer && data.customer_id && repair) {
        Promise.all([
          RepairService.getById(repair.id, data.branch_id),
          adminSupabase.from('businesses').select('name, phone, email').eq('id', ctx.businessId).single()
        ]).then(([repairDetail, { data: business }]) => {
          if (repairDetail?.customers) {
            const customerName = `${repairDetail.customers.first_name} ${repairDetail.customers.last_name ?? ''}`.trim()
            const deviceInfo = [repairDetail.device_brand, repairDetail.device_model].filter(Boolean).join(' ') || 'Device'

            NotificationEngine.fire('ticket_created', {
              businessId: ctx.businessId,
              branchId: data.branch_id,
              relatedId: repair.id,
              relatedType: 'repair',
              variables: {
                customer_name: customerName,
                ticket_number: repair.job_number,
                device_type:   repairDetail.device_type ?? '',
                device_brand:  repairDetail.device_brand ?? '',
                device_model:  deviceInfo,
                issue:         repairDetail.issue ?? '',
                store_name:    business?.name ?? 'RepairBooking',
                store_phone:   business?.phone ?? '',
                store_email:   business?.email ?? '',
              },
              recipient: {
                email: repairDetail.customers.email ?? null,
                phone: repairDetail.customers.phone ?? null,
              },
            }).catch(console.error)
          }
        }).catch(console.error)
      }

      const credit_apply_warning = repair && data.customer_id
        ? await applyRepairCreditLoyalty(ctx.businessId, data.customer_id, repair, {
            storeCreditApplied: store_credit_applied,
            loyaltyPointsApplied: loyalty_points_applied,
          })
        : null

      return created({ ...repair, credit_apply_warning })
    } catch (err) {
      return serverError('Failed to create repair', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    const branchId = ctx.auth.branchId ?? undefined
    try {
      const { parts, store_credit_applied, loyalty_points_applied, ...repairPayload } = data
      const repair = await RepairService.update(id, branchId, repairPayload)

      const customerId = repair && (repair as any).customer_id
      const credit_apply_warning = repair && customerId
        ? await applyRepairCreditLoyalty(ctx.businessId, customerId, repair, {
            storeCreditApplied: store_credit_applied,
            loyaltyPointsApplied: loyalty_points_applied,
          })
        : null

      return ok({ ...repair, credit_apply_warning })
    } catch (err) {
      return serverError('Failed to update repair', err)
    }
  },

  async updateStatus(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, statusSchema)
    if (error) return error
    try {
      await RepairService.updateStatus(id, data.status, data.note, ctx.auth.userId)

      // When marked as refunded, record the deposit_paid as the refund_amount
      // and restore any store credit / loyalty points that were used to pay for it.
      if (data.status === 'refunded') {
        const branchId = ctx.auth.branchId ?? null
        const repair = await RepairService.getById(id, branchId)
        if (repair) {
          const depositPaid = (repair as any).deposit_paid ?? 0
          await adminSupabase
            .from('repairs')
            .update({ refund_amount: depositPaid })
            .eq('id', id)

          const customerId = (repair as any).customer_id
          if (customerId) {
            const note = `Refund reversal for repair #${(repair as any).job_number ?? id.slice(-8)}`

            const { data: creditDebits } = await adminSupabase
              .from('store_credit_transactions')
              .select('amount')
              .eq('business_id', ctx.businessId)
              .eq('customer_id', customerId)
              .eq('reference_type', 'repair')
              .eq('reference_id', id)
              .eq('type', 'debit')
            for (const txn of creditDebits ?? []) {
              await StoreCreditService.credit(ctx.businessId, customerId, -(txn as any).amount, {
                note, referenceId: id, referenceType: 'repair_refund',
              }).catch(() => {})
            }

            const { data: loyaltyRedemptions } = await adminSupabase
              .from('loyalty_transactions')
              .select('points')
              .eq('business_id', ctx.businessId)
              .eq('customer_id', customerId)
              .eq('reference_type', 'repair')
              .eq('reference_id', id)
              .eq('type', 'redeemed')
            for (const txn of loyaltyRedemptions ?? []) {
              await LoyaltyService.addPoints(ctx.businessId, customerId, -(txn as any).points, 'adjusted', id).catch(() => {})
            }
          }
        }
      }

      // Fire-and-forget commission recording on completion
      if (data.status === 'completed') {
        const branchId = ctx.auth.branchId ?? null
        RepairService.getById(id, branchId).then((repair) => {
          if (repair?.assigned_to) {
            const total = (repair as Record<string, unknown>).total_cost as number ?? 0
            CommissionService.recordForRepair(ctx.businessId, repair.assigned_to, id, total).catch(() => {})
          }
        }).catch(() => {})
      }

      // Non-blocking notification via NotificationEngine — always fires on every status change.
      // The NotificationEngine checks whether an active template exists for this event;
      // if none is configured the call is a no-op.  send_email flag is no longer the gate.
      const branchId = ctx.auth.branchId ?? null
      Promise.all([
        RepairService.getById(id, branchId),
        adminSupabase.from('businesses').select('name, phone, email').eq('id', ctx.businessId).single()
      ]).then(([repair, { data: business }]) => {
        if (repair?.customers) {
          const customerName = `${repair.customers.first_name} ${repair.customers.last_name ?? ''}`.trim()
          const deviceInfo = [repair.device_brand, repair.device_model].filter(Boolean).join(' ') || 'Device'
          const businessName = business?.name ?? 'RepairBooking'

          const STATUS_LABELS: Record<string, string> = {
            received: 'Received', in_progress: 'In Progress', waiting_parts: 'Waiting for Parts',
            repaired: 'Repaired & Ready', unrepairable: 'Unfortunately Unrepairable', collected: 'Collected',
          }
          const triggerEvent = data.status === 'repaired' ? 'repair_ready' : 'ticket_status_changed'

          NotificationEngine.fire(triggerEvent as any, {
            businessId: ctx.businessId,
            branchId,
            relatedId: id,
            relatedType: 'repair',
            variables: {
              customer_name:  customerName,
              ticket_number:  repair.job_number,
              device_type:    repair.device_type ?? '',
              device_brand:   repair.device_brand ?? '',
              device_model:   deviceInfo,
              issue:          repair.issue ?? '',
              status:         STATUS_LABELS[data.status] ?? data.status,
              note:           data.note || '',
              store_name:     businessName,
              store_phone:    business?.phone ?? '',
              store_email:    business?.email ?? '',
            },
            recipient: {
              email: repair.customers.email ?? null,
              phone: repair.customers.phone ?? null,
            },
          }).catch(console.error)

          // Mark email sent in status history
          if (data.send_email) {
            adminSupabase
              .from('repair_status_history')
              .update({ email_sent: true })
              .eq('repair_id', id)
              .eq('new_status', data.status)
              .order('created_at', { ascending: false })
              .limit(1)
              .then()
          }
        }
      }).catch(console.error)

      return ok({ updated: true })
    } catch (err) {
      return serverError('Failed to update repair status', err)
    }
  },

  async getStatusHistory(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const history = await RepairService.getStatusHistory(id)
      return ok(history)
    } catch (err) {
      return serverError('Failed to fetch status history', err)
    }
  },

  async generateInvoicePdf(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const result = await buildRepairInvoiceBuffer(id, ctx.auth.branchId ?? null, ctx.businessId)
      if (!result) return notFound('Repair not found')
      return pdfResponse(result.buffer, `invoice-${result.jobNumber}.pdf`)
    } catch (err) {
      return serverError('Failed to generate invoice PDF', err)
    }
  },

  async generateSlipPdf(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const result = await buildRepairSlipBuffer(id, ctx.auth.branchId ?? null, ctx.businessId)
      if (!result) return notFound('Repair not found')
      return pdfResponse(result.buffer, `slip-${result.jobNumber}.pdf`)
    } catch (err) {
      return serverError('Failed to generate slip PDF', err)
    }
  },

  // ── Plain-data endpoints for thermal (Receipt80/58/Custom) printing ──────────
  // The client prints these via an HTML popup + dynamic @page sizing instead of
  // a PDF — @react-pdf output isn't reliably honoured by the browser's native
  // PDF print dialog on thermal printers (paper size defaults to Letter/A4 and
  // shrinks the whole page). Same data as the PDF path, see getRepairInvoiceData.

  async getInvoiceData(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const data = await getRepairInvoiceData(id, ctx.auth.branchId ?? null, ctx.businessId)
      if (!data) return notFound('Repair not found')
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch invoice data', err)
    }
  },

  async getSlipData(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const data = await getRepairSlipData(id, ctx.auth.branchId ?? null, ctx.businessId)
      if (!data) return notFound('Repair not found')
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch slip data', err)
    }
  },

  async remove(_request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? undefined
    try {
      await RepairService.remove(id, branchId)
      return ok({ deleted: true })
    } catch (err: any) {
      if (err?.message?.includes('not found')) return notFound('Repair not found')
      return serverError('Failed to delete repair', err)
    }
  },
}
