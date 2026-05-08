import { withMiddleware } from '@/backend/middleware'
import { RepairService } from '@/backend/services/repair.service'
import { NotificationEngine } from '@/backend/services/notification-engine.service'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

const STATUS_LABELS: Record<string, string> = {
  received:      'Received',
  in_progress:   'In Progress',
  waiting_parts: 'Waiting for Parts',
  repaired:      'Repaired & Ready',
  unrepairable:  'Unfortunately Unrepairable',
  collected:     'Collected',
}

export const POST = withMiddleware(
  async (req, ctx, { params }) => {
    const { id } = await params
    try {
      const branchId = ctx.auth.branchId ?? null
      const [repair, { data: business }] = await Promise.all([
        RepairService.getById(id, branchId ?? undefined),
        adminSupabase.from('businesses').select('name, phone, email').eq('id', ctx.businessId).single(),
      ])

      if (!repair) return serverError('Repair not found')
      if (!repair.customers?.email) return ok({ sent: false, reason: 'No customer email on file' })

      const customerName = `${repair.customers.first_name} ${repair.customers.last_name ?? ''}`.trim()
      const deviceInfo   = [repair.device_brand, repair.device_model].filter(Boolean).join(' ') || 'Device'
      const businessName = business?.name ?? 'RepairBooking'
      const currentStatus = repair.status ?? 'received'
      const triggerEvent  = currentStatus === 'repaired' ? 'repair_ready' : 'ticket_status_changed'

      await NotificationEngine.fire(triggerEvent as any, {
        businessId: ctx.businessId,
        branchId,
        relatedId:   id,
        relatedType: 'repair',
        variables: {
          customer_name: customerName,
          ticket_number: repair.job_number,
          device_type:   repair.device_type   ?? '',
          device_brand:  repair.device_brand  ?? '',
          device_model:  deviceInfo,
          issue:         repair.issue          ?? '',
          status:        STATUS_LABELS[currentStatus] ?? currentStatus,
          note:          '',
          store_name:    businessName,
          store_phone:   business?.phone  ?? '',
          store_email:   business?.email  ?? '',
        },
        recipient: {
          email: repair.customers.email,
          phone: repair.customers.phone ?? null,
        },
      })

      return ok({ sent: true })
    } catch (err) {
      return serverError('Failed to send notification', err)
    }
  },
  { requiredRole: 'staff' }
)
