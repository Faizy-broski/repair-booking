import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { VehicleService } from '@/backend/services/vehicle.service'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const createSchema = z.object({
  customer_id: z.string().uuid(),
  registration_number: z.string().min(1),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  colour: z.string().optional().nullable(),
  tyre_size: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const updateSchema = createSchema.partial().omit({ customer_id: true })

export const VehicleController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    try {
      const data = await VehicleService.list(ctx.businessId, {
        search: searchParams.get('search') ?? undefined,
        customerId: searchParams.get('customer_id') ?? undefined,
      })
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch vehicles', err)
    }
  },

  async getById(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const vehicle = await VehicleService.getById(id, ctx.businessId)
      if (!vehicle) return notFound('Vehicle not found')
      return ok(vehicle)
    } catch (err) {
      return serverError('Failed to fetch vehicle', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const vehicle = await VehicleService.create({ ...data, business_id: ctx.businessId })
      return created(vehicle)
    } catch (err) {
      return serverError('Failed to create vehicle', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const vehicle = await VehicleService.update(id, ctx.businessId, data)
      return ok(vehicle)
    } catch (err) {
      return serverError('Failed to update vehicle', err)
    }
  },

  async remove(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await VehicleService.remove(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete vehicle', err)
    }
  },
}
