import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { CustomFieldService } from '@/backend/services/custom-field.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { MODULES } from '@/backend/config/constants'
import { z } from 'zod'

const createSchema = z.object({
  module: z.enum(MODULES),
  field_key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  field_type: z.enum(['text', 'number', 'select', 'date', 'boolean']),
  options: z.array(z.string()).optional().nullable(),
  is_required: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
})

const updateSchema = createSchema.partial().omit({ module: true, field_key: true })

export const CustomFieldController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const module = request.nextUrl.searchParams.get('module') ?? undefined
    try {
      const data = await CustomFieldService.list(ctx.businessId, module)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch custom fields', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const field = await CustomFieldService.create({
        ...data,
        business_id: ctx.businessId,
        options: data.options ? { choices: data.options } : null,
      })
      return created(field)
    } catch (err) {
      return serverError('Failed to create custom field', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const field = await CustomFieldService.update(id, ctx.businessId, {
        ...data,
        options: data.options ? { choices: data.options } : undefined,
      })
      return ok(field)
    } catch (err) {
      return serverError('Failed to update custom field', err)
    }
  },

  async delete(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await CustomFieldService.delete(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete custom field', err)
    }
  },
}
