'use client'
import type { InvoiceSettings, SocialLinks, FooterLineScope } from '@/types/invoice-settings'
import { formatCurrency } from '@/lib/utils'

// Full names used for the side-by-side social header row on the receipt
// (e.g. "Instagram   TikTok" with handles below).
const SOCIAL_LABELS: Record<keyof SocialLinks, string> = {
  website: 'Website', facebook: 'Facebook', instagram: 'Instagram',
  twitter: 'Twitter', whatsapp: 'WhatsApp', landline: 'Landline', tiktok: 'TikTok',
}

// Small monochrome icons (currentColor) shown next to each platform name.
const iconProps = { width: 12, height: 12 }
const SOCIAL_ICONS: Record<keyof SocialLinks, React.ReactNode> = {
  website: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...iconProps}>
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...iconProps}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...iconProps}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...iconProps}>
      <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="currentColor" {...iconProps}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.36a9.85 9.85 0 0 0 4.62 1.17h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.64-1.03-5.13-2.9-7C17.17 3.03 14.68 2 12.04 2zm5.86 14.11c-.25.7-1.45 1.34-2 1.43-.5.08-1.14.11-1.84-.12-.42-.14-.96-.31-1.65-.61-2.9-1.26-4.8-4.17-4.94-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.77-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.72.81 2.02.96.3.15.5.22.57.35.07.13.07.75-.18 1.45z" />
    </svg>
  ),
  landline: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...iconProps}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="currentColor" {...iconProps}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
    </svg>
  ),
}

interface Props {
  settings: InvoiceSettings
  invoiceNumber: string
  status: string
  issuedAt: string
  dueAt?: string | null
  businessName: string
  branchName?: string | null
  branchAddress?: string | null
  branchPhone?: string | null
  customerName: string
  deviceName?: string
  deviceImei?: string
  faults?: string
  items: Array<{ description: string; quantity: number; unit_price: number; discount?: number }>
  subtotal: number
  discount?: number
  tax?: number
  total: number
  amountPaid?: number
  paymentMethods?: Array<{ method: string; amount: number }>
  currency?: string
}

function money(n: number, currency?: string) {
  return formatCurrency(n, currency)
}

// "cash" -> "Cash", "store_credit" -> "Store Credit"
function paymentMethodLabel(method: string): string {
  return method.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function paymentMethodText(methods: Array<{ method: string; amount: number }> | undefined, currency?: string): string {
  if (!methods || methods.length === 0) return ''
  if (methods.length === 1) return paymentMethodLabel(methods[0].method)
  return methods.map((m) => `${paymentMethodLabel(m.method)} ${money(m.amount, currency)}`).join(' + ')
}

// Only the labour/repair-fee line is hidden when show_final_amount_only is on —
// parts keep showing their description and price. Identified by the literal
// description getRepairInvoiceData() gives it ("Repair Fee").
function visibleItems<T extends { description: string }>(items: T[], settings: InvoiceSettings): T[] {
  if (!settings.show_final_amount_only) return items
  return items.filter((i) => i.description !== 'Repair Fee')
}

export function RepairReceiptHtml({
  settings, invoiceNumber, status, issuedAt, dueAt,
  businessName, branchName, branchAddress, branchPhone, customerName, deviceName, deviceImei, faults,
  items, subtotal, discount = 0, tax = 0, total, amountPaid = 0, paymentMethods, currency = 'GBP',
}: Props) {
  const pc      = settings.primary_color ?? '#0f766e'
  const bal     = Math.max(0, total - amountPaid)
  const width   = settings.paper_size === 'Receipt58' ? '58mm'
               : settings.paper_size === 'Custom'    ? `${settings.custom_width ?? 80}mm`
               : '80mm'
  const dateStr = new Date(issuedAt).toLocaleDateString('en-GB')

  const socials = Object.entries(settings.social_links ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => ({
      label: SOCIAL_LABELS[k as keyof SocialLinks],
      icon: SOCIAL_ICONS[k as keyof SocialLinks],
      val: String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    }))

  // This component only renders repair-job invoices (see invoice-modal.tsx),
  // so a footer line shows here whenever its scope isn't restricted to POS.
  const footerLineDefs: Array<{ line: string | null; scope: FooterLineScope | undefined }> = [
    { line: settings.footer_line_1, scope: settings.footer_line_1_scope },
    { line: settings.footer_line_2, scope: settings.footer_line_2_scope },
    { line: settings.footer_line_3, scope: settings.footer_line_3_scope },
  ]
  const footerLines = footerLineDefs
    .filter(({ line, scope }) => !!line && line !== settings.thank_you_message && (scope ?? 'both') !== 'pos')
    .map(({ line }) => line as string)

  const s = {
    // fontWeight 700 here is the fix for "dull/faint" thermal print output —
    // thin (normal-weight) strokes print light on a thermal head, bold prints solid.
    // Every element below inherits this unless it sets its own fontWeight.
    root:     { width, margin: '0 auto', padding: '10px 10px 30px 10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', fontWeight: 700, lineHeight: 1.35, color: '#000', background: '#fff' } as React.CSSProperties,
    center:   { textAlign: 'center' as const },
    logo:     { display: 'block', margin: '0 auto 5px', width: '64px', height: '64px', objectFit: 'contain' as const },
    bizName:  { fontSize: '18px', fontWeight: 'bold', textAlign: 'center' as const, marginBottom: '2px' },
    since:    { fontSize: '10px', fontWeight: 'bold', color: '#000', textAlign: 'center' as const, marginBottom: '2px' },
    branch:   { fontSize: '10px', color: '#000', textAlign: 'center' as const, marginBottom: '2px' },
    detail:   { fontSize: '9.5px', color: '#000', textAlign: 'center' as const, marginBottom: '2px' },
    divider:  { border: 'none', borderTop: '1px dashed #000', margin: '7px 0' } as React.CSSProperties,
    invoiceNo:{ fontSize: '11px', fontWeight: 'bold', textAlign: 'center' as const, marginBottom: '3px' },
    row:      { display: 'flex', justifyContent: 'space-between', marginBottom: '5px' } as React.CSSProperties,
    lbl:      { fontSize: '9.5px', color: '#000', fontWeight: 600 },
    val:      { fontSize: '9.5px', fontWeight: 'bold' },
    itemRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' } as React.CSSProperties,
    itemVal:  { fontSize: '9.5px', fontWeight: 'bold', textAlign: 'right' as const, maxWidth: '65%', wordBreak: 'break-word' as const },
    totRow:   { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } as React.CSSProperties,
    totLbl:   { fontSize: '10px', color: '#000', fontWeight: 600 },
    totVal:   { fontSize: '10px', fontWeight: 'bold' },
    grandRow: { display: 'flex', justifyContent: 'space-between', marginTop: '7px' } as React.CSSProperties,
    grandLbl: { fontSize: '13px', fontWeight: 'bold', color: '#000' },
    grandVal: { fontSize: '13px', fontWeight: 'bold', color: '#000' },
    balBar:   { display: 'flex', justifyContent: 'space-between', backgroundColor: '#000', padding: '8px', borderRadius: '3px', marginTop: '7px', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties,
    balLbl:   { fontSize: '11px', fontWeight: 'bold', color: '#fff' },
    balVal:   { fontSize: '11px', fontWeight: 'bold', color: '#fff' },
    footer:   { pageBreakInside: 'avoid', breakInside: 'avoid', pageBreakBefore: 'avoid' } as React.CSSProperties,
    thankYou: { fontSize: '12px', fontWeight: 'bold', color: '#000', textAlign: 'center' as const, marginTop: '9px' },
    guarantee:{ fontSize: '10.5px', fontWeight: 'bold', color: '#000', textAlign: 'center' as const, marginTop: '6px' },
    footLine: { fontSize: '10.5px', color: '#000', textAlign: 'center' as const, marginTop: '5px', wordBreak: 'break-word' as const, whiteSpace: 'pre-line' as const },
    lblHead:  { fontSize: '9px', fontWeight: 'bold', color: '#000', textAlign: 'center' as const, letterSpacing: '0.5px', marginTop: '7px' },
    dividerThick: { border: 'none', borderTop: '2px solid #000', margin: '10px 0' } as React.CSSProperties,
    policy:   { fontSize: '8.5px', color: '#000', textAlign: 'center' as const, marginTop: '8px', borderTop: '1px solid #000', paddingTop: '6px', whiteSpace: 'pre-line' as const },
    green:    { color: '#000' },
    socRow:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px', marginTop: '7px' } as React.CSSProperties,
    socCol:   { textAlign: 'center' as const },
    socLbl:   { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '9px', fontWeight: 'bold', color: '#000' } as React.CSSProperties,
    socVal:   { fontSize: '9px', color: '#000', wordBreak: 'break-word' as const },
  }

  return (
    <div style={s.root}>
      {settings.show_logo && settings.logo_url && (
        <img src={settings.logo_url} alt="" style={s.logo} />
      )}
      {settings.show_business_name !== false && (
        <div style={s.bizName}>{businessName}</div>
      )}
      {settings.since_year && (
        <div style={s.since}>Since {settings.since_year}</div>
      )}
      {settings.show_branch_name && branchName && (
        <div style={s.branch}>{branchName}</div>
      )}
      {settings.show_address && branchAddress && (
        <div style={s.detail}>{branchAddress}</div>
      )}
      {settings.show_phone && branchPhone && (
        <div style={s.detail}>{branchPhone}</div>
      )}

      <hr style={s.divider} />

      <div style={s.row}><span style={s.lbl}>Order No.</span><span style={s.val}>{invoiceNumber}</span></div>
      <div style={s.row}><span style={s.lbl}>Order Date</span><span style={s.val}>{dateStr}</span></div>
      {dueAt && (
        <div style={s.row}><span style={s.lbl}>Due Date</span><span style={s.val}>{new Date(dueAt).toLocaleDateString('en-GB')}</span></div>
      )}
      <div style={s.row}><span style={s.lbl}>Customer</span><span style={s.val}>{customerName}</span></div>
      <div style={s.row}><span style={s.lbl}>Status</span><span style={s.val}>{status}</span></div>

      <div style={{ marginTop: '8px', border: '1px solid #000' }}>
        <div style={{ textAlign: 'center', fontWeight: 'bold', borderBottom: '1px solid #000', padding: '4px 0', fontSize: '11px', backgroundColor: '#f9f9f9' }}>
          Order Detail
        </div>
        <div style={{ padding: '6px' }}>
          {deviceName && (
            <div style={{ marginBottom: '4px', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase' }}>{deviceName}</div>
          )}
          <div style={{ marginBottom: '4px' }}><span style={s.lbl}>Serial No.: </span><span style={{fontWeight: 'bold', wordBreak: 'break-all'}}>{deviceImei || 'N/A'}</span></div>
          <div style={{ marginBottom: '6px' }}><span style={s.lbl}>Faults: </span><span style={{fontWeight: 'bold'}}>{faults || 'N/A'}</span></div>

          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

          {visibleItems(items, settings).map((item, i) => {
            const gross = item.quantity * item.unit_price
            const itemDiscount = item.discount ?? 0
            const net = gross - itemDiscount
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '10px', flex: 1, paddingRight: '8px', wordBreak: 'break-word' }}>{item.description}</span>
                <span style={{ fontSize: '10px', textAlign: 'right' }}>
                  {itemDiscount > 0 && (
                    <span style={{ textDecoration: 'line-through', color: '#888', fontWeight: 'normal', marginRight: '4px' }}>{money(gross, currency)}</span>
                  )}
                  <span style={{ fontWeight: 'bold' }}>{money(net, currency)}</span>
                </span>
              </div>
            )
          })}
          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

      {!settings.show_final_amount_only && (
        <>
          <div style={s.totRow}>
            <span style={s.totLbl}>Discount</span>
            <span style={s.totVal}>{discount > 0 ? `-${money(discount, currency)}` : money(0, currency)}</span>
          </div>
          <div style={s.totRow}>
            <span style={s.totLbl}>Subtotal</span>
            <span style={s.totVal}>{money(subtotal, currency)}</span>
          </div>
          {settings.show_tax_breakdown && tax > 0 && (
            <div style={s.totRow}>
              <span style={s.totLbl}>Tax</span>
              <span style={s.totVal}>{money(tax, currency)}</span>
            </div>
          )}
        </>
      )}

      <hr style={s.divider} />

      <div style={s.grandRow}>
        <span style={s.grandLbl}>Total Charges</span>
        <span style={s.grandVal}>{money(total, currency)}</span>
      </div>
      <div style={s.totRow}>
        <span style={s.totLbl}>Deposit / Paid</span>
        <span style={s.totVal}>{money(amountPaid, currency)}</span>
      </div>
      {!!paymentMethods?.length && (
        <div style={s.totRow}>
          <span style={s.totLbl}>Payment Method</span>
          <span style={s.totVal}>{paymentMethodText(paymentMethods, currency)}</span>
        </div>
      )}
      {bal > 0 && (
        <div style={s.balBar}>
          <span style={s.balLbl}>Remaining</span>
          <span style={s.balVal}>{money(bal, currency)}</span>
        </div>
      )}
      
        </div>
      </div>

      {/* Footer in normal document flow — never clipped */}
      <div style={s.footer}>
        <hr style={s.divider} />
        {settings.thank_you_message && (
          <div style={s.thankYou}>{settings.thank_you_message}</div>
        )}
        {settings.guarantee_line_1 && <div style={s.guarantee}>• {settings.guarantee_line_1}</div>}
        {settings.guarantee_line_2 && <div style={s.guarantee}>• {settings.guarantee_line_2}</div>}
        {footerLines.map((line, i) => (
          <div key={i} style={s.footLine}>{line}</div>
        ))}
        {settings.footer_address && (
          <>
            <hr style={s.divider} />
            <div style={s.lblHead}>ADDRESS</div>
            <div style={s.footLine}>{settings.footer_address}</div>
          </>
        )}
        {settings.footer_phone && (
          <>
            <hr style={s.divider} />
            <div style={s.lblHead}>PH</div>
            <div style={s.footLine}>{settings.footer_phone}</div>
          </>
        )}
        {socials.length > 0 && (
          <>
            <hr style={s.dividerThick} />
            <div style={s.socRow}>
              {socials.map(({ label, icon, val }, i) => (
                <div key={i} style={s.socCol}>
                  <div style={s.socLbl}>{icon}<span>{label}</span></div>
                  <div style={s.socVal}>{val}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {settings.policy_text_repair && (
          <div style={s.policy}>{settings.policy_text_repair}</div>
        )}
      </div>
    </div>
  )
}
