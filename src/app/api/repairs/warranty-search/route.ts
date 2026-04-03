import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (req, ctx) => {
  try {
    const { searchParams } = req.nextUrl
    const imei         = searchParams.get('imei')?.trim()
    const customerName = searchParams.get('customer_name')?.trim()
    const customerMobile = searchParams.get('customer_mobile')?.trim()
    const ticketId     = searchParams.get('ticket_id')?.trim()
    const invoiceId    = searchParams.get('invoice_id')?.trim()

    const branchId = searchParams.get('branch_id')
    if (!branchId) return ok([])

    let q = adminSupabase
      .from('repairs')
      .select(`
        id, job_number, status, device_brand, device_model, device_type,
        serial_number, issue, created_at, collected_at,
        customers ( id, first_name, last_name, phone, email ),
        repair_items ( id, name, unit_price, warranty_days, warranty_starts_at, product_id )
      `)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (imei)           q = q.ilike('serial_number', `%${imei}%`)
    if (ticketId)       q = q.ilike('job_number', `%${ticketId}%`)
    if (invoiceId)      q = q.eq('id', invoiceId)

    const { data, error } = await q
    if (error) throw error

    let results = data ?? []

    // Customer name / mobile filter (post-filter since Supabase can't easily filter on joined table columns)
    if (customerName) {
      const lower = customerName.toLowerCase()
      results = results.filter(r => {
        const c = r.customers as { first_name: string; last_name: string | null; phone: string | null } | null
        if (!c) return false
        return `${c.first_name} ${c.last_name ?? ''}`.toLowerCase().includes(lower)
      })
    }
    if (customerMobile) {
      results = results.filter(r => {
        const c = r.customers as { phone: string | null } | null
        return c?.phone?.includes(customerMobile)
      })
    }

    // Enrich with warranty status per item
    const now = Date.now()
    const enriched = results.map(r => ({
      ...r,
      repair_items: (r.repair_items as Array<{
        id: string; name: string; unit_price: number | null
        warranty_days: number | null; warranty_starts_at: string | null; product_id: string | null
      }>).map(item => {
        let warrantyExpiry: string | null = null
        let inWarranty = false
        if (item.warranty_days && item.warranty_starts_at) {
          const expiry = new Date(item.warranty_starts_at)
          expiry.setDate(expiry.getDate() + item.warranty_days)
          warrantyExpiry = expiry.toISOString()
          inWarranty = expiry.getTime() > now
        }
        return { ...item, warrantyExpiry, inWarranty }
      }),
    }))

    return ok(enriched)
  } catch (err) {
    return serverError('Warranty search failed', err)
  }
}, { requiredRole: 'cashier' })
