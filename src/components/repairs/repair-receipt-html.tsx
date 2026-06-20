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
  const width = settings.paper_size === 'Receipt58' ? '58mm' : '80mm'

  const socialEntries = Object.entries(settings.social_links ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const display = String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
      return [k as keyof SocialLinks, display] as const
    })

  const uniqueFooterLines = [settings.footer_line_1, settings.footer_line_2, settings.footer_line_3]
    .filter((line): line is string => !!line && line !== settings.thank_you_message)

  const dateStr = new Date(issuedAt).toLocaleDateString('en-GB')

  // All styles are inline so Tailwind purging never removes them in print context
  const s = {
    page: { width, margin: '0 auto', padding: '10px', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '8px', color: '#000', backgroundColor: '#fff' } as React.CSSProperties,
    center: { textAlign: 'center' as const },
    logo: { display: 'block', margin: '0 auto 6px', width: '48px', height: '48px', objectFit: 'contain' as const },
    businessName: { fontSize: '12px', fontWeight: 'bold', textAlign: 'center' as const, marginBottom: '1px' },
    branchName: { fontSize: '8px', color: '#6b7280', textAlign: 'center' as const, marginBottom: '1px' },
    detail: { fontSize: '7.5px', color: '#6b7280', textAlign: 'center' as const, marginBottom: '1px' },
    divider: { borderTop: '1px dashed #9ca3af', margin: '6px 0' },
    invoiceNo: { fontSize: '9px', fontWeight: 'bold', textAlign: 'center' as const, marginBottom: '2px' },
    row: { display: 'flex', justifyContent: 'space-between', marginBottom: '2px' } as React.CSSProperties,
    label: { fontSize: '7.5px', color: '#6b7280' },
    value: { fontSize: '7.5px', fontWeight: 'bold' },
    itemRow: { display: 'flex', alignItems: 'flex-start', marginBottom: '4px' } as React.CSSProperties,
    itemDesc: { flex: 1, paddingRight: '4px', fontSize: '8px' },
    itemAmt: { fontSize: '8px', textAlign: 'right' as const, width: '52px', flexShrink: 0 },
    totalRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '1.5px' } as React.CSSProperties,
    totalLabel: { fontSize: '8px', color: '#6b7280' },
    totalValue: { fontSize: '8px' },
    grandRow: { display: 'flex', justifyContent: 'space-between', marginTop: '3px' } as React.CSSProperties,
    grandLabel: { fontSize: '11px', fontWeight: 'bold' },
    grandValue: { fontSize: '11px', fontWeight: 'bold', color: pc },
    balanceRow: { display: 'flex', justifyContent: 'space-between', backgroundColor: pc, padding: '6px', borderRadius: '3px', marginTop: '4px' } as React.CSSProperties,
    balanceLabel: { fontSize: '9px', fontWeight: 'bold', color: '#fff' },
    balanceValue: { fontSize: '9px', fontWeight: 'bold', color: '#fff' },
    thankYou: { fontSize: '9px', fontWeight: 'bold', color: '#000', textAlign: 'center' as const, marginTop: '6px' },
    footerText: { fontSize: '8px', color: '#000', textAlign: 'center' as const, marginTop: '2px' },
    policy: { fontSize: '7px', color: '#000', textAlign: 'center' as const, marginTop: '5px', borderTop: '1px solid #e5e7eb', paddingTop: '4px' },
    footer: { margin: 0, paddingBottom: '10px' } as React.CSSProperties,
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

      {/* Footer — must sit in normal flow, never absolute-positioned */}
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
