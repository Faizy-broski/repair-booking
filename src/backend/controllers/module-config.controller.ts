import { NextRequest, NextResponse } from 'next/server'
import { ModuleConfigService } from '@/backend/services/module-config.service'
import { ok, created, badRequest, forbidden, serverError } from '@/backend/utils/api-response'
import { MODULES } from '@/backend/config/constants'
import type { RequestContext } from '@/backend/middleware'
import type {
  ModuleName,
  UpdateBranchModuleOverridePayload,
  UpdateBusinessModuleAccessPayload,
  CreateTemplatePayload,
  PushTemplatePayload,
} from '@/types/module-config'

function isValidModule(m: string): m is ModuleName {
  return (MODULES as readonly string[]).includes(m)
}

// ── Tenant: bootstrap all module configs for a branch ─────────────────────────

export async function getAllModuleConfigs(
  _request: NextRequest,
  ctx: RequestContext
): Promise<NextResponse> {
  try {
    const { auth, businessId } = ctx

    // Determine branchId: use the user's branch, or fall back to query param for owners
    const url = new URL(_request.url)
    const branchId =
      url.searchParams.get('branchId') ??
      auth.branchId

    if (!branchId) {
      return badRequest('branchId is required')
    }

    // Pass businessId so service can verify branchId ownership (prevents cross-tenant reads)
    const data = await ModuleConfigService.getAllForBranch(branchId, businessId)
    return ok(data)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'FORBIDDEN') return forbidden('Branch access denied')
    return serverError('Failed to load module configs', error)
  }
}

// ── Tenant: get single module config for a branch ────────────────────────────

export async function getModuleConfig(
  request: NextRequest,
  ctx: RequestContext,
  routeCtx: { params: Promise<{ module: string }> }
): Promise<NextResponse> {
  try {
    const { module } = await routeCtx.params
    if (!isValidModule(module)) return badRequest(`Invalid module: ${module}`)

    const url = new URL(request.url)
    const branchId = url.searchParams.get('branchId') ?? ctx.auth.branchId
    if (!branchId) return badRequest('branchId is required')

    const data = await ModuleConfigService.getOneForBranch(branchId, module)
    return ok(data)
  } catch (error) {
    return serverError('Failed to load module config', error)
  }
}

// ── Tenant: branch-level override (branch_manager+) ──────────────────────────

export async function updateBranchModuleOverride(
  request: NextRequest,
  ctx: RequestContext,
  routeCtx: { params: Promise<{ module: string }> }
): Promise<NextResponse> {
  try {
    const { module } = await routeCtx.params
    if (!isValidModule(module)) return badRequest(`Invalid module: ${module}`)

    const url = new URL(request.url)
    const branchId = url.searchParams.get('branchId') ?? ctx.auth.branchId
    if (!branchId) return badRequest('branchId is required')

    const body = await request.json() as UpdateBranchModuleOverridePayload
    if (!body.settings_override || typeof body.settings_override !== 'object') {
      return badRequest('settings_override must be an object')
    }

    await ModuleConfigService.upsertBranchOverride(branchId, module, body)
    return ok({ success: true })
  } catch (error) {
    return serverError('Failed to update branch module override', error)
  }
}

// ── Tenant: business-level settings override (business_owner only) ───────────

export async function updateBusinessModuleSettings(
  request: NextRequest,
  ctx: RequestContext,
  routeCtx: { params: Promise<{ module: string }> }
): Promise<NextResponse> {
  try {
    // Only business owners can set business-level overrides
    if (ctx.auth.role !== 'business_owner' && ctx.auth.role !== 'super_admin') {
      return forbidden('Only business owners can update business-level module settings')
    }

    const { module } = await routeCtx.params
    if (!isValidModule(module)) return badRequest(`Invalid module: ${module}`)

    const body = await request.json() as { settings_override: Record<string, unknown> }
    if (!body.settings_override || typeof body.settings_override !== 'object') {
      return badRequest('settings_override must be an object')
    }

    await ModuleConfigService.updateBusinessModuleAccess(ctx.businessId, module, {
      settings_override: body.settings_override,
    })

    return ok({ success: true })
  } catch (error) {
    return serverError('Failed to update business module settings', error)
  }
}

// ── Superadmin: module template CRUD ─────────────────────────────────────────

export async function listTemplates(
  request: NextRequest,
  _ctx: RequestContext
): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const moduleFilter = url.searchParams.get('module') as ModuleName | null
    if (moduleFilter && !isValidModule(moduleFilter)) {
      return badRequest(`Invalid module: ${moduleFilter}`)
    }
    const data = await ModuleConfigService.listTemplates(moduleFilter ?? undefined)
    return ok(data)
  } catch (error) {
    return serverError('Failed to list templates', error)
  }
}

export async function createTemplate(
  request: NextRequest,
  _ctx: RequestContext
): Promise<NextResponse> {
  try {
    const body = await request.json() as CreateTemplatePayload
    if (!body.module || !isValidModule(body.module)) return badRequest('Invalid module')
    if (!body.name?.trim()) return badRequest('name is required')

    const data = await ModuleConfigService.createTemplate(body)
    return created(data)
  } catch (error) {
    return serverError('Failed to create template', error)
  }
}

export async function updateTemplate(
  request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await routeCtx.params
    const body = await request.json() as Partial<CreateTemplatePayload>
    const data = await ModuleConfigService.updateTemplate(id, body)
    return ok(data)
  } catch (error) {
    return serverError('Failed to update template', error)
  }
}

export async function deleteTemplate(
  _request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await routeCtx.params
    await ModuleConfigService.deleteTemplate(id)
    return ok({ success: true })
  } catch (error) {
    return serverError('Failed to delete template', error)
  }
}

export async function pushTemplate(
  request: NextRequest,
  ctx: RequestContext,
  routeCtx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await routeCtx.params
    const body = await request.json() as PushTemplatePayload
    if (!body.push_mode) return badRequest('push_mode is required')
    if (!body.business_ids) return badRequest('business_ids is required')

    const result = await ModuleConfigService.pushTemplate(id, ctx.auth.userId, body)
    return ok(result)
  } catch (error) {
    return serverError('Failed to push template', error)
  }
}

export async function pushTemplateDiffPreview(
  request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await routeCtx.params
    const body = await request.json() as { push_mode: string; business_ids: string[] | 'all' }
    if (!body.push_mode) return badRequest('push_mode is required')
    if (!body.business_ids) return badRequest('business_ids is required')

    const diff = await ModuleConfigService.generatePushDiff(
      id,
      body.push_mode as 'force_override' | 'merge_missing_only',
      body.business_ids
    )
    return ok(diff)
  } catch (error) {
    return serverError('Failed to generate push diff', error)
  }
}

// ── Superadmin: per-business module access management ────────────────────────

export async function getBusinessModules(
  _request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: businessId } = await routeCtx.params
    const data = await ModuleConfigService.getBusinessModuleSummary(businessId)
    return ok(data)
  } catch (error) {
    return serverError('Failed to get business modules', error)
  }
}

export async function updateBusinessModule(
  request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ id: string; module: string }> }
): Promise<NextResponse> {
  try {
    const { id: businessId, module } = await routeCtx.params
    if (!isValidModule(module)) return badRequest(`Invalid module: ${module}`)

    const body = await request.json() as UpdateBusinessModuleAccessPayload
    await ModuleConfigService.updateBusinessModuleAccess(businessId, module, body)
    return ok({ success: true })
  } catch (error) {
    return serverError('Failed to update business module', error)
  }
}
