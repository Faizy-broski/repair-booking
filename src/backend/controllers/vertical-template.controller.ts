/**
 * VerticalTemplateController
 * Superadmin handlers for business vertical template CRUD + apply operations.
 */
import { NextRequest, NextResponse } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { VerticalTemplateService } from '@/backend/services/vertical-template.service'
import { ok, created, badRequest, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'
import { MODULES } from '@/backend/config/constants'
import type {
  CreateVerticalTemplatePayload,
  ModuleName,
} from '@/types/module-config'

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
  description: z.string().optional(),
  icon: z.string().optional(),
  modules_enabled: z.array(z.enum(MODULES as unknown as [string, ...string[]])).min(1),
  module_settings: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  default_plan_id: z.string().uuid().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
})

const updateSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
})

const applySchema = z.object({
  business_id: z.string().uuid(),
  mode: z.enum(['initial', 'reapply', 'merge']).default('initial'),
})

export const VerticalTemplateController = {
  async list(request: NextRequest, _ctx: RequestContext): Promise<NextResponse> {
    try {
      const url = new URL(request.url)
      const activeOnly = url.searchParams.get('active') === 'true'
      const data = await VerticalTemplateService.list(activeOnly)
      return ok(data)
    } catch (error) {
      return serverError('Failed to list vertical templates', error)
    }
  },

  async getById(
    _request: NextRequest,
    _ctx: RequestContext,
    routeCtx: { params: Promise<{ id: string }> }
  ): Promise<NextResponse> {
    try {
      const { id } = await routeCtx.params
      const data = await VerticalTemplateService.getById(id)
      if (!data) return notFound('Vertical template not found')
      return ok(data)
    } catch (error) {
      return serverError('Failed to get vertical template', error)
    }
  },

  async create(request: NextRequest, _ctx: RequestContext): Promise<NextResponse> {
    const { data: body, error: valErr } = await validateBody(request, createSchema)
    if (valErr) return valErr
    try {
      const payload = body as unknown as CreateVerticalTemplatePayload
      const data = await VerticalTemplateService.create(payload)
      return created(data)
    } catch (error) {
      return serverError('Failed to create vertical template', error)
    }
  },

  async update(
    request: NextRequest,
    _ctx: RequestContext,
    routeCtx: { params: Promise<{ id: string }> }
  ): Promise<NextResponse> {
    const { id } = await routeCtx.params
    const { data: body, error: valErr } = await validateBody(request, updateSchema)
    if (valErr) return valErr
    try {
      const payload = body as unknown as Partial<CreateVerticalTemplatePayload> & { is_active?: boolean }
      const data = await VerticalTemplateService.update(id, payload)
      return ok(data)
    } catch (error) {
      return serverError('Failed to update vertical template', error)
    }
  },

  async delete(
    _request: NextRequest,
    _ctx: RequestContext,
    routeCtx: { params: Promise<{ id: string }> }
  ): Promise<NextResponse> {
    try {
      const { id } = await routeCtx.params
      await VerticalTemplateService.delete(id)
      return ok({ success: true })
    } catch (error) {
      return serverError('Failed to delete vertical template', error)
    }
  },

  async apply(
    request: NextRequest,
    ctx: RequestContext,
    routeCtx: { params: Promise<{ id: string }> }
  ): Promise<NextResponse> {
    const { id } = await routeCtx.params
    const { data: body, error: valErr } = await validateBody(request, applySchema)
    if (valErr) return valErr
    try {
      const result = await VerticalTemplateService.applyToBusiness(
        id,
        body.business_id,
        ctx.auth.userId,
        body.mode
      )
      return ok(result)
    } catch (error) {
      return serverError('Failed to apply vertical template', error)
    }
  },

  async getApplyLog(
    _request: NextRequest,
    _ctx: RequestContext,
    routeCtx: { params: Promise<{ id: string }> }
  ): Promise<NextResponse> {
    try {
      const { id: businessId } = await routeCtx.params
      const data = await VerticalTemplateService.getApplyLog(businessId)
      return ok(data)
    } catch (error) {
      return serverError('Failed to get apply log', error)
    }
  },
}
