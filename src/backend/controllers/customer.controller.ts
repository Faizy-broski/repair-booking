import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { CustomerService } from '@/backend/services/customer.service'
import { VehicleService, normalizePlate } from '@/backend/services/vehicle.service'
import { ok, created, notFound, forbidden, serverError, conflict } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { PlanLimitService } from '@/backend/services/plan-limit.service'
import { z } from 'zod'

const createSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  business_name: z.string().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).default({}),
})

const updateSchema = createSchema.partial()

// Call-intake flow: staff take the caller's phone number first, look up whether
// they're an existing customer, and only fall through to creating a new
// customer (+ optionally a vehicle) if there's no match.
const findOrCreateSchema = z.object({
  phone: z.string().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  vehicle: z.object({
    registration_number: z.string().min(1),
    make: z.string().optional().nullable(),
    model: z.string().optional().nullable(),
    colour: z.string().optional().nullable(),
    tyre_size: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }).optional(),
})

export const CustomerController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await CustomerService.list(ctx.businessId, {
        page,
        limit,
        search: searchParams.get('search') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch customers', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const { searchParams } = request.nextUrl
    const detail = searchParams.get('detail') === 'true'
    try {
      if (detail) {
        const customer = await CustomerService.getDetail(id, ctx.businessId)
        if (!customer) return notFound('Customer not found')
        return ok(customer)
      }
      const customer = await CustomerService.getById(id, ctx.businessId)
      if (!customer) return notFound('Customer not found')
      return ok(customer)
    } catch (err) {
      return serverError('Failed to fetch customer', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const limitCheck = await PlanLimitService.checkLimit(ctx.businessId, 'max_customers')
      if (!limitCheck.allowed) {
        return forbidden(`Customer limit reached. Your plan allows ${limitCheck.limit} customers.`, 'LIMIT_REACHED')
      }

      const customer = await CustomerService.create({
        ...data,
        business_id: ctx.businessId,
        email: data.email || null,
      })
      return created(customer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('already exists')) return conflict(msg)
      return serverError('Failed to create customer', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const customer = await CustomerService.update(id, ctx.businessId, {
        ...data,
        email: data.email || null,
      })
      return ok(customer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('already exists')) return conflict(msg)
      return serverError('Failed to update customer', err)
    }
  },

  async remove(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await CustomerService.remove(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete customer', err)
    }
  },

  // POST /api/customers/find-or-create — phone-first call-intake lookup.
  // - No match + no intake details -> just reports no match (staff still typing).
  // - No match + first_name present -> creates the customer (+ vehicle if given).
  // - One or more matches -> returned for staff to pick, never auto-merged.
  // - vehicle.registration_number already registered to a DIFFERENT customer ->
  //   flagged as a warning instead of silently creating a duplicate vehicle row.
  async findOrCreate(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, findOrCreateSchema)
    if (error) return error
    try {
      const matches = await CustomerService.findByPhone(ctx.businessId, data.phone)

      if (matches.length > 0) {
        return ok({ matched: true, created: false, customers: matches })
      }

      if (!data.first_name) {
        return ok({ matched: false, created: false, customers: [] })
      }

      let plateWarning: string | null = null
      if (data.vehicle?.registration_number) {
        const existingVehicles = await VehicleService.findByPlate(ctx.businessId, data.vehicle.registration_number)
        if (existingVehicles.length > 0) {
          const owner = (existingVehicles[0] as any).customers
          plateWarning = `${normalizePlate(data.vehicle.registration_number)} is already registered to ${owner ? `${owner.first_name} ${owner.last_name ?? ''}`.trim() : 'another customer'}.`
        }
      }

      const limitCheck = await PlanLimitService.checkLimit(ctx.businessId, 'max_customers')
      if (!limitCheck.allowed) {
        return forbidden(`Customer limit reached. Your plan allows ${limitCheck.limit} customers.`, 'LIMIT_REACHED')
      }

      const customer = await CustomerService.create({
        business_id: ctx.businessId,
        branch_id: data.branch_id ?? null,
        first_name: data.first_name,
        last_name: data.last_name ?? null,
        email: data.email || null,
        phone: data.phone,
        address: data.address ?? null,
      })

      let vehicle = null
      if (data.vehicle) {
        vehicle = await VehicleService.create({ ...data.vehicle, business_id: ctx.businessId, customer_id: (customer as any).id })
      }

      return created({ matched: false, created: true, customer, vehicle, plate_warning: plateWarning })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('already exists')) return conflict(msg)
      return serverError('Failed to find or create customer', err)
    }
  },
}
