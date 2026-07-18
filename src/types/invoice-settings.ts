export interface SocialLinks {
  website?: string
  facebook?: string
  instagram?: string
  twitter?: string
  whatsapp?: string
  tiktok?: string
}

export type PaperSize = 'A4' | 'A5' | 'Letter' | 'Receipt80' | 'Receipt58' | 'Custom'
export type Orientation = 'portrait' | 'landscape'

export interface InvoiceSettings {
  id?: string
  business_id?: string
  branch_id?: string | null

  // Page
  paper_size: PaperSize
  orientation: Orientation
  custom_width?: number | null   // mm
  custom_height?: number | null  // mm

  // Branding
  logo_url: string | null
  primary_color: string
  secondary_color: string
  text_color: string
  font_family: string

  // Header toggles
  show_logo: boolean
  show_business_name: boolean
  show_branch_name: boolean
  show_address: boolean
  show_phone: boolean
  show_email: boolean

  // Footer
  footer_address: string | null
  footer_phone: string | null
  footer_line_1: string | null
  footer_line_2: string | null
  footer_line_3: string | null
  thank_you_message: string | null
  policy_text: string | null
  since_year: string | null
  guarantee_line_1: string | null
  guarantee_line_2: string | null

  // Social links
  social_links: SocialLinks

  // Options
  show_tax_breakdown: boolean
  show_payment_method: boolean
  show_unpaid_watermark: boolean
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  paper_size: 'A4',
  orientation: 'portrait',
  custom_width: null,
  custom_height: null,
  logo_url: null,
  primary_color: '#0f766e',
  secondary_color: '#f0fdfa',
  text_color: '#111827',
  font_family: 'Helvetica',
  show_logo: true,
  show_business_name: true,
  show_branch_name: true,
  show_address: true,
  show_phone: true,
  show_email: true,
  footer_address: null,
  footer_phone: null,
  footer_line_1: null,
  footer_line_2: null,
  footer_line_3: null,
  thank_you_message: 'Thank you for your business!',
  policy_text: null,
  since_year: null,
  guarantee_line_1: null,
  guarantee_line_2: null,
  social_links: {},
  show_tax_breakdown: true,
  show_payment_method: false,
  show_unpaid_watermark: true,
}
