'use client'
import type { InvoiceSettings, SocialLinks } from '@/types/invoice-settings'
import { formatCurrency } from '@/lib/utils'

const SOCIAL_LABELS: Record<keyof SocialLinks, string> = {
  website: 'Web', facebook: 'FB', instagram: 'IG',
  twitter: 'TW', whatsapp: 'WA', tiktok: 'TT',
}

interface Props {
  settings: InvoiceSettings
  invoiceNumber: string
  status: string
  issuedAt: string
  businessName: string
  branchName?: string | null
  branchAddress?: string | null
  branchPhone?: string | null
  customerName: string
  items: Array<{ description: string; quantity: number; unit_price: number }>
  subtotal: number
  discount?: number
  tax?: number
  total: number
  amountPaid?: number
  currency?: string
}

function money(n: number, currency?: string) {
  return formatCurrency(n, currency)
}

export function RepairReceiptHtml({
  settings, invoiceNumber, status, issuedAt,
  businessName, branchName, branchAddress, branchPhone, customerName,
  items, subtotal, discount = 0, tax = 0, total, amountPaid = 0, currency = 'GBP',
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
      val: String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    }))

  const footerLines = [settings.footer_line_1, settings.footer_line_2, settings.footer_line_3]
    .filter((l): l is string => !!l && l !== settings.thank_you_message)

  const s = {
    root:     { width, margin: '0 auto', padding: '10px 10px 30px 10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', color: '#000', background: '#fff' } as React.CSSProperties,
    center:   { textAlign: 'center' as const },
    logo:     { display: 'block', margin: '0 auto 6px', width: '48px', height: '48px', objectFit: 'contain' as const },
    bizName:  { fontSize: '14px', fontWeight: 'bold', textAlign: 'center' as const, marginBottom: '2px' },
    branch:   { fontSize: '10px', color: '#000', textAlign: 'center' as const, marginBottom: '2px' },
    detail:   { fontSize: '9.5px', color: '#000', textAlign: 'center' as const, marginBottom: '2px' },
    divider:  { border: 'none', borderTop: '1px dashed #000', margin: '6px 0' } as React.CSSProperties,
    invoiceNo:{ fontSize: '11px', fontWeight: 'bold', textAlign: 'center' as const, marginBottom: '2px' },
    row:      { display: 'flex', justifyContent: 'space-between', marginBottom: '2px' } as React.CSSProperties,
    lbl:      { fontSize: '9.5px', color: '#000', fontWeight: 600 },
    val:      { fontSize: '9.5px', fontWeight: 'bold' },
    itemRow:  { display: 'flex', alignItems: 'flex-start', marginBottom: '4px' } as React.CSSProperties,
    itemDesc: { flex: 1, paddingRight: '4px', fontSize: '10px', wordBreak: 'break-word' as const },
    itemAmt:  { fontSize: '10px', textAlign: 'right' as const, width: '52px', flexShrink: 0, fontWeight: 'bold' },
    totRow:   { display: 'flex', justifyContent: 'space-between', marginBottom: '1.5px' } as React.CSSProperties,
    totLbl:   { fontSize: '10px', color: '#000', fontWeight: 600 },
    totVal:   { fontSize: '10px', fontWeight: 'bold' },
    grandRow: { display: 'flex', justifyContent: 'space-between', marginTop: '3px' } as React.CSSProperties,
    grandLbl: { fontSize: '13px', fontWeight: 'bold', color: '#000' },
    grandVal: { fontSize: '13px', fontWeight: 'bold', color: '#000' },
    balBar:   { display: 'flex', justifyContent: 'space-between', backgroundColor: '#000', padding: '6px', borderRadius: '3px', marginTop: '4px', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties,
    balLbl:   { fontSize: '11px', fontWeight: 'bold', color: '#fff' },
    balVal:   { fontSize: '11px', fontWeight: 'bold', color: '#fff' },
    footer:   { pageBreakInside: 'avoid', breakInside: 'avoid', pageBreakBefore: 'avoid' } as React.CSSProperties,
    thankYou: { fontSize: '11px', fontWeight: 'bold', color: '#000', textAlign: 'center' as const, marginTop: '6px' },
    footLine: { fontSize: '9.5px', color: '#000', textAlign: 'center' as const, marginTop: '2px', wordBreak: 'break-word' as const },
    policy:   { fontSize: '8.5px', color: '#000', textAlign: 'center' as const, marginTop: '5px', borderTop: '1px solid #000', paddingTop: '4px' },
    green:    { color: '#000' },
  }

  return (
    <div style={s.root}>
      {settings.show_logo && settings.logo_url && (
        <img src={settings.logo_url} alt="" style={s.logo} />
      )}
      {settings.show_business_name !== false && (
        <div style={s.bizName}>{businessName}</div>
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

      <div style={s.invoiceNo}>{invoiceNumber}</div>
      <div style={s.row}><span style={s.lbl}>Date</span><span style={s.val}>{dateStr}</span></div>
      <div style={s.row}><span style={s.lbl}>Customer</span><span style={s.val}>{customerName}</span></div>
      <div style={s.row}><span style={s.lbl}>Status</span><span style={s.val}>{status}</span></div>

      <hr style={s.divider} />

      {items.map((item, i) => (
        <div key={i} style={s.itemRow}>
          <div style={s.itemDesc}>{item.description}</div>
          <div style={s.itemAmt}>{money(item.quantity * item.unit_price, currency)}</div>
        </div>
      ))}

      <hr style={s.divider} />

      <div style={s.totRow}>
        <span style={s.totLbl}>Subtotal</span>
        <span style={s.totVal}>{money(subtotal, currency)}</span>
      </div>
      {discount > 0 && (
        <div style={s.totRow}>
          <span style={s.totLbl}>Discount</span>
          <span style={{ ...s.totVal, ...s.green }}>-{money(discount, currency)}</span>
        </div>
      )}
      {settings.show_tax_breakdown && tax > 0 && (
        <div style={s.totRow}>
          <span style={s.totLbl}>Tax</span>
          <span style={s.totVal}>{money(tax, currency)}</span>
        </div>
      )}

      <hr style={s.divider} />

      <div style={s.grandRow}>
        <span style={s.grandLbl}>Total</span>
        <span style={s.grandVal}>{money(total, currency)}</span>
      </div>
      {amountPaid > 0 && (
        <div style={s.totRow}>
          <span style={s.totLbl}>Paid</span>
          <span style={{ ...s.totVal, ...s.green }}>{money(amountPaid, currency)}</span>
        </div>
      )}
      {bal > 0 && (
        <div style={s.balBar}>
          <span style={s.balLbl}>Balance Due</span>
          <span style={s.balVal}>{money(bal, currency)}</span>
        </div>
      )}

      {/* Footer in normal document flow — never clipped */}
      <div style={s.footer}>
        <hr style={s.divider} />
        {settings.thank_you_message && (
          <div style={s.thankYou}>{settings.thank_you_message}</div>
        )}
        {footerLines.map((line, i) => (
          <div key={i} style={s.footLine}>{line}</div>
        ))}
        {socials.map(({ label, val }, i) => (
          <div key={i} style={s.footLine}>{label}: {val}</div>
        ))}
        {settings.policy_text && (
          <div style={s.policy}>{settings.policy_text}</div>
        )}
      </div>
    </div>
  )
}
