import { adminSupabase } from '@/backend/config/supabase'
import { DEFAULT_INVOICE_SETTINGS, type InvoiceSettings } from '@/types/invoice-settings'

export const InvoiceSettingsService = {
  /**
   * Returns effective settings for a branch:
   *   1. Branch-level override (branch_id matches)
   *   2. Business-wide default (branch_id IS NULL)
   *   3. Hard-coded defaults if neither exists
   */
  async get(businessId: string, branchId?: string | null): Promise<InvoiceSettings> {
    const results = await adminSupabase
      .from('invoice_settings')
      .select('*')
      .eq('business_id', businessId)
      .or(branchId ? `branch_id.eq.${branchId},branch_id.is.null` : 'branch_id.is.null')
      .order('branch_id', { ascending: false, nullsFirst: false }) // branch row before null

    const rows = (results.data ?? []) as any[]

    // Prefer branch-specific row, fall back to business default
    const row = branchId
      ? (rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => r.branch_id === null))
      : rows.find((r) => r.branch_id === null)

    if (!row) return { ...DEFAULT_INVOICE_SETTINGS }

    return {
      id: row.id,
      business_id: row.business_id,
      branch_id: row.branch_id ?? null,
      paper_size: row.paper_size ?? DEFAULT_INVOICE_SETTINGS.paper_size,
      orientation: row.orientation ?? DEFAULT_INVOICE_SETTINGS.orientation,
      logo_url: row.logo_url ?? null,
      primary_color: row.primary_color ?? DEFAULT_INVOICE_SETTINGS.primary_color,
      secondary_color: row.secondary_color ?? DEFAULT_INVOICE_SETTINGS.secondary_color,
      text_color: row.text_color ?? DEFAULT_INVOICE_SETTINGS.text_color,
      font_family: row.font_family ?? DEFAULT_INVOICE_SETTINGS.font_family,
      show_logo: row.show_logo ?? true,
      show_business_name: row.show_business_name ?? true,
      show_branch_name: row.show_branch_name ?? true,
      show_address: row.show_address ?? true,
      show_phone: row.show_phone ?? true,
      show_email: row.show_email ?? true,
      footer_line_1: row.footer_line_1 ?? null,
      footer_line_2: row.footer_line_2 ?? null,
      footer_line_3: row.footer_line_3 ?? null,
      thank_you_message: row.thank_you_message ?? DEFAULT_INVOICE_SETTINGS.thank_you_message,
      policy_text: row.policy_text ?? null,
      social_links: (row.social_links as object) ?? {},
      show_tax_breakdown: row.show_tax_breakdown ?? true,
      show_payment_method: row.show_payment_method ?? false,
      show_unpaid_watermark: row.show_unpaid_watermark ?? true,
    }
  },

  /**
   * Upsert settings for either the business default (branch_id = null)
   * or a specific branch override.
   */
  async upsert(
    businessId: string,
    branchId: string | null,
    data: Partial<InvoiceSettings>
  ): Promise<InvoiceSettings> {
    const payload: Record<string, unknown> = {
      business_id: businessId,
      branch_id: branchId,
      updated_at: new Date().toISOString(),
      ...data,
    }
    delete payload.id

    const { data: row, error } = await adminSupabase
      .from('invoice_settings')
      .upsert(payload, {
        onConflict: branchId
          ? 'business_id,branch_id'
          : 'business_id',        // handled by partial unique index
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) throw error
    return this.get(businessId, branchId)
  },
}
