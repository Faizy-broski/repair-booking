import type { InvoiceSettings, SocialLinks } from '@/types/invoice-settings'

const SOCIAL_LABELS: Record<keyof SocialLinks, string> = {
  website: 'Web', facebook: 'FB', instagram: 'IG',
  twitter: 'TW', whatsapp: 'WA', tiktok: 'TT',
}

function fmt(n: number, currency = 'GBP') {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  return `${sym}${n.toFixed(2)}`
}

export interface RepairReceiptHtmlProps {
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

export function RepairReceiptHtml({
  settings,
  invoiceNumber,
  status,
  issuedAt,
  businessName,
  branchName,
  branchAddress,
  branchPhone,
  customerName,
  items,
  subtotal,
  discount = 0,
  tax = 0,
  total,
  amountPaid = 0,
  currency = 'GBP',
}: RepairReceiptHtmlProps) {
  const pc = settings.primary_color ?? '#0f766e'
  const balanceDue = Math.max(0, total - amountPaid)
  const dateStr = new Date(issuedAt).toLocaleDateString('en-GB')

  const socialEntries = Object.entries(settings.social_links ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const display = String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
      return [k as keyof SocialLinks, display] as const
    })

  const uniqueFooterLines = [settings.footer_line_1, settings.footer_line_2, settings.footer_line_3]
    .filter((line): line is string => !!line && line !== settings.thank_you_message)

  // maxWidth caps the receipt at the physical paper width so it prints correctly
  // even when the browser's @page size negotiation with the printer driver fails.
  // width: 100% fills up to that cap; margin: 0 auto keeps it left-aligned on narrow rolls.
  const paperWidth = settings.paper_size === 'Receipt58' ? '58mm' : '80mm'

  const s = {
    page: {
      width: '100%',
      maxWidth: paperWidth,
      margin: '0 auto',
      padding: '10px',
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '12px',
      color: '#000',
      backgroundColor: '#fff',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      colorAdjust: 'exact',
    } as React.CSSProperties,
    logo: { display: 'block', margin: '0 auto 6px', width: '56px', height: '56px', objectFit: 'contain' as const },
    businessName: { fontSize: '16px', fontWeight: 'bold', textAlign: 'center' as const, marginBottom: '2px' },
    branchName: { fontSize: '11px', color: '#6b7280', textAlign: 'center' as const, marginBottom: '2px' },
    detail: { fontSize: '10px', color: '#6b7280', textAlign: 'center' as const, marginBottom: '2px' },
    divider: { borderTop: '1px dashed #9ca3af', margin: '6px 0' },
    invoiceNo: { fontSize: '13px', fontWeight: 'bold', textAlign: 'center' as const, marginBottom: '3px' },
    row: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px' } as React.CSSProperties,
    label: { fontSize: '11px', color: '#6b7280' },
    value: { fontSize: '11px', fontWeight: 'bold' },
    itemRow: { display: 'flex', alignItems: 'flex-start', marginBottom: '5px' } as React.CSSProperties,
    itemDesc: { flex: 1, paddingRight: '6px', fontSize: '12px' },
    itemAmt: { fontSize: '12px', textAlign: 'right' as const, minWidth: '60px', flexShrink: 0 },
    totalRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '2px' } as React.CSSProperties,
    totalLabel: { fontSize: '12px', color: '#6b7280' },
    totalValue: { fontSize: '12px' },
    grandRow: { display: 'flex', justifyContent: 'space-between', marginTop: '4px' } as React.CSSProperties,
    grandLabel: { fontSize: '15px', fontWeight: 'bold' },
    grandValue: { fontSize: '15px', fontWeight: 'bold', color: pc },
    balanceRow: {
      display: 'flex',
      justifyContent: 'space-between',
      backgroundColor: pc,
      padding: '8px',
      borderRadius: '3px',
      marginTop: '6px',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      colorAdjust: 'exact',
    } as React.CSSProperties,
    balanceLabel: { fontSize: '13px', fontWeight: 'bold', color: '#fff' },
    balanceValue: { fontSize: '13px', fontWeight: 'bold', color: '#fff' },
    thankYou: { fontSize: '12px', fontWeight: 'bold', color: pc, textAlign: 'center' as const, marginTop: '8px' },
    footerText: { fontSize: '10px', color: '#6b7280', textAlign: 'center' as const, marginTop: '2px' },
    policy: { fontSize: '9px', color: '#9ca3af', textAlign: 'center' as const, marginTop: '6px', borderTop: '0.5px solid #e5e7eb', paddingTop: '4px' },
    footer: { pageBreakInside: 'avoid', breakInside: 'avoid' } as React.CSSProperties,
  }

  return (
    <div style={s.page}>
      {settings.show_logo && settings.logo_url && (
        <img src={settings.logo_url} alt="" style={s.logo} />
      )}
      {settings.show_business_name !== false && (
        <div style={s.businessName}>{businessName}</div>
      )}
      {settings.show_branch_name && branchName && (
        <div style={s.branchName}>{branchName}</div>
      )}
      {settings.show_address && branchAddress && (
        <div style={s.detail}>{branchAddress}</div>
      )}
      {settings.show_phone && branchPhone && (
        <div style={s.detail}>{branchPhone}</div>
      )}

      <div style={s.divider} />
      <div style={s.invoiceNo}>{invoiceNumber}</div>
      <div style={s.row}>
        <span style={s.label}>Date</span>
        <span style={s.value}>{dateStr}</span>
      </div>
      <div style={s.row}>
        <span style={s.label}>Customer</span>
        <span style={s.value}>{customerName}</span>
      </div>
      <div style={s.row}>
        <span style={s.label}>Status</span>
        <span style={s.value}>{status}</span>
      </div>

      <div style={s.divider} />
      {items.map((item, i) => (
        <div key={i} style={s.itemRow}>
          <div style={s.itemDesc}>{item.description}</div>
          <div style={s.itemAmt}>{fmt(item.quantity * item.unit_price, currency)}</div>
        </div>
      ))}

      <div style={s.divider} />
      <div style={s.totalRow}>
        <span style={s.totalLabel}>Subtotal</span>
        <span style={s.totalValue}>{fmt(subtotal, currency)}</span>
      </div>
      {discount > 0 && (
        <div style={s.totalRow}>
          <span style={s.totalLabel}>Discount</span>
          <span style={{ ...s.totalValue, color: '#10b981' }}>-{fmt(discount, currency)}</span>
        </div>
      )}
      {settings.show_tax_breakdown && tax > 0 && (
        <div style={s.totalRow}>
          <span style={s.totalLabel}>Tax</span>
          <span style={s.totalValue}>{fmt(tax, currency)}</span>
        </div>
      )}
      <div style={s.divider} />
      <div style={s.grandRow}>
        <span style={s.grandLabel}>Total</span>
        <span style={s.grandValue}>{fmt(total, currency)}</span>
      </div>
      {amountPaid > 0 && (
        <div style={s.totalRow}>
          <span style={s.totalLabel}>Paid</span>
          <span style={{ ...s.totalValue, color: '#10b981' }}>{fmt(amountPaid, currency)}</span>
        </div>
      )}
      {balanceDue > 0 && (
        <div style={s.balanceRow}>
          <span style={s.balanceLabel}>Balance Due</span>
          <span style={s.balanceValue}>{fmt(balanceDue, currency)}</span>
        </div>
      )}

      {/* Footer in normal document flow — never absolute-positioned */}
      <div style={s.footer}>
        <div style={s.divider} />
        {settings.thank_you_message && (
          <div style={s.thankYou}>{settings.thank_you_message}</div>
        )}
        {uniqueFooterLines.map((line, i) => (
          <div key={i} style={s.footerText}>{line}</div>
        ))}
        {socialEntries.map(([key, val]) => (
          <div key={key} style={s.footerText}>{SOCIAL_LABELS[key]}: {val}</div>
        ))}
        {settings.policy_text && (
          <div style={s.policy}>{settings.policy_text}</div>
        )}
      </div>
    </div>
  )
}
