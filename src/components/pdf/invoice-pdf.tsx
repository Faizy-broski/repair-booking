import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { InvoiceSettings, SocialLinks } from '@/types/invoice-settings'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'GBP') {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  return `${sym}${n.toFixed(2)}`
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const SOCIAL_LABELS: Record<keyof SocialLinks, string> = {
  website: 'Web', facebook: 'FB', instagram: 'IG',
  twitter: 'TW', whatsapp: 'WA', tiktok: 'TT',
}

// ── Paper size map ─────────────────────────────────────────────────────────────

const PAPER_SIZES: Record<string, string | [number, number]> = {
  A4: 'A4',
  A5: 'A5',
  Letter: 'LETTER',
  Receipt80: [227, 841],   // 80mm wide, variable height (points)
  Receipt58: [165, 841],   // 58mm wide
}

// ── Font ───────────────────────────────────────────────────────────────────────
// react-pdf ships Helvetica/Times-Roman/Courier by default.
// Bold variants: Helvetica-Bold, Times-Bold, Courier-Bold.

function boldFont(family: string): string {
  if (family === 'Times-Roman') return 'Times-Bold'
  if (family === 'Courier') return 'Courier-Bold'
  return 'Helvetica-Bold'
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  tax_rate?: number
}

export interface InvoicePdfProps {
  settings: InvoiceSettings
  invoiceNumber: string
  status: string
  issuedAt: string
  dueAt?: string | null
  businessName: string
  branchName?: string | null
  branchAddress?: string | null
  branchPhone?: string | null
  branchEmail?: string | null
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  customerAddress?: string | null
  items: InvoiceLineItem[]
  subtotal: number
  discount?: number
  tax: number
  total: number
  amountPaid?: number
  notes?: string | null
  currency?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoicePdf(props: InvoicePdfProps) {
  const {
    settings, invoiceNumber, status, issuedAt, dueAt,
    businessName, branchName, branchAddress, branchPhone, branchEmail,
    customerName, customerEmail, customerPhone, customerAddress,
    items, subtotal, discount = 0, tax, total, amountPaid = 0,
    notes, currency = 'GBP',
  } = props

  const isReceipt = settings.paper_size === 'Receipt80' || settings.paper_size === 'Receipt58'
  const balanceDue = Math.max(0, total - amountPaid)
  const isUnpaid = (status === 'unpaid' || status === 'issued' || status === 'partial') && balanceDue > 0
  const family = settings.font_family ?? 'Helvetica'
  const bold = boldFont(family)
  const pc = settings.primary_color
  const sc = settings.secondary_color
  const tc = settings.text_color

  // Social links array (non-empty values only)
  const socialEntries = Object.entries(settings.social_links ?? {}).filter(([, v]) => v) as [keyof SocialLinks, string][]

  const paperSizeKey = settings.paper_size in PAPER_SIZES ? settings.paper_size : 'A4'

  if (isReceipt) {
    return <ReceiptPdf {...props} family={family} bold={bold} fmt={(n) => fmt(n, currency)} socialEntries={socialEntries} />
  }

  // ── Full-page invoice ────────────────────────────────────────────────────────

  const s = StyleSheet.create({
    page: {
      fontFamily: family,
      backgroundColor: '#ffffff',
      paddingBottom: 120,
    },

    // ── Header band ──
    header: {
      backgroundColor: pc,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 40,
      paddingVertical: 28,
    },
    headerLeft: { flex: 1, marginRight: 24 },
    headerRight: { alignItems: 'flex-end' },

    logo: { width: 64, height: 64, objectFit: 'contain', marginBottom: 8, borderRadius: 6 },

    businessName: { fontSize: 15, fontFamily: bold, color: '#ffffff', marginBottom: 2 },
    branchName: { fontSize: 9, color: hexToRgba('#ffffff', 0.7), marginBottom: 1 },
    headerDetail: { fontSize: 8.5, color: hexToRgba('#ffffff', 0.75), marginBottom: 1 },

    invoiceTitle: { fontSize: 30, fontFamily: bold, color: '#ffffff', letterSpacing: 2, textAlign: 'right' },
    invoiceNumber: { fontSize: 11, color: hexToRgba('#ffffff', 0.85), textAlign: 'right', marginTop: 3 },
    statusBadge: {
      marginTop: 8,
      backgroundColor: hexToRgba('#ffffff', 0.18),
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 20,
    },
    statusText: { fontSize: 8, fontFamily: bold, color: '#ffffff', textAlign: 'center' },

    // ── Meta row ──
    metaRow: {
      flexDirection: 'row',
      backgroundColor: sc,
      paddingHorizontal: 40,
      paddingVertical: 18,
      borderBottom: `1 solid ${hexToRgba(pc, 0.15)}`,
    },
    metaBlock: { flex: 1, marginRight: 16 },
    metaLabel: { fontSize: 7.5, fontFamily: bold, color: pc, marginBottom: 5 },
    metaName: { fontSize: 11, fontFamily: bold, color: tc, marginBottom: 2 },
    metaDetail: { fontSize: 8.5, color: '#6b7280', marginBottom: 1.5 },
    metaDateRow: { flexDirection: 'row', marginBottom: 3 },
    metaDateLabel: { fontSize: 8.5, color: '#6b7280', width: 76 },
    metaDateValue: { fontSize: 8.5, fontFamily: bold, color: tc },

    // ── Table ──
    table: { marginHorizontal: 40, marginTop: 20 },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: pc,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 5,
      marginBottom: 1,
    },
    thText: { fontSize: 7.5, fontFamily: bold, color: '#ffffff' },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderBottom: '1 solid #f3f4f6',
    },
    tableRowAlt: { backgroundColor: '#fafafa' },
    tdText: { fontSize: 9, color: tc },
    tdSub: { fontSize: 7.5, color: '#9ca3af', marginTop: 1 },

    colNum:   { width: 24 },
    colDesc:  { flex: 1, paddingRight: 8 },
    colQty:   { width: 44, textAlign: 'center' },
    colUnit:  { width: 70, textAlign: 'right' },
    colTotal: { width: 72, textAlign: 'right' },

    // ── Totals ──
    totalsSection: { marginRight: 40, marginTop: 6, alignItems: 'flex-end' },
    totalRow: { flexDirection: 'row', marginBottom: 3.5, width: 220 },
    totalLabel: { flex: 1, fontSize: 9, color: '#6b7280' },
    totalValue: { fontSize: 9, color: tc, textAlign: 'right' },
    divider: { width: 220, borderTop: `1 solid #e5e7eb`, marginVertical: 5 },

    grandTotalRow: { flexDirection: 'row', width: 220, marginBottom: 3.5 },
    grandTotalLabel: { flex: 1, fontSize: 12, fontFamily: bold, color: tc },
    grandTotalValue: { fontSize: 12, fontFamily: bold, color: pc, textAlign: 'right' },

    balanceBadge: {
      width: 220,
      backgroundColor: pc,
      borderRadius: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 5,
    },
    balanceBadgeLabel: { flex: 1, fontSize: 10, fontFamily: bold, color: '#ffffff' },
    balanceBadgeValue: { fontSize: 14, fontFamily: bold, color: '#ffffff' },

    paidBadge: { width: 220, backgroundColor: '#10b981', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 9, marginTop: 5 },
    paidBadgeText: { fontSize: 11, fontFamily: bold, color: '#ffffff', textAlign: 'center' },

    // ── Notes ──
    notesSection: { marginHorizontal: 40, marginTop: 18 },
    notesLabel: { fontSize: 8, fontFamily: bold, color: pc, marginBottom: 4 },
    notesText: { fontSize: 8.5, color: '#4b5563', lineHeight: 1.5 },

    // ── Watermark ──
    watermark: {
      position: 'absolute',
      top: 260,
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: 68,
      fontFamily: bold,
      color: hexToRgba('#ef4444', 0.1),
    },

    // ── Footer ──
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: '#f9fafb',
      borderTop: '1 solid #e5e7eb',
      paddingHorizontal: 40,
      paddingVertical: 14,
    },
    thankYou: { fontSize: 9, fontFamily: bold, color: pc, textAlign: 'center', marginBottom: 5 },
    footerLine: { fontSize: 8, color: '#6b7280', textAlign: 'center', marginBottom: 1.5 },
    socialRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 5, marginBottom: 2 },
    socialItem: { fontSize: 7.5, color: '#9ca3af', marginHorizontal: 5 },
    socialSep: { fontSize: 7.5, color: '#d1d5db' },
    policy: { fontSize: 6.5, color: '#9ca3af', textAlign: 'center', marginTop: 7, paddingTop: 7, borderTop: '1 solid #e5e7eb', lineHeight: 1.4 },
  })

  const pageSize = PAPER_SIZES[paperSizeKey] as any
  const orient = settings.orientation === 'landscape' ? 'landscape' : 'portrait'

  return (
    <Document>
      <Page size={pageSize} orientation={orient} style={s.page}>

        {/* Unpaid watermark */}
        {settings.show_unpaid_watermark && isUnpaid && (
          <Text style={s.watermark}>{status.toUpperCase()}</Text>
        )}

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {settings.show_logo && settings.logo_url && (
              <Image src={settings.logo_url} style={s.logo} />
            )}
            {settings.show_business_name && (
              <Text style={s.businessName}>{businessName}</Text>
            )}
            {settings.show_branch_name && branchName && (
              <Text style={s.branchName}>{branchName}</Text>
            )}
            {settings.show_address && branchAddress && (
              <Text style={s.headerDetail}>{branchAddress}</Text>
            )}
            {settings.show_phone && branchPhone && (
              <Text style={s.headerDetail}>{branchPhone}</Text>
            )}
            {settings.show_email && branchEmail && (
              <Text style={s.headerDetail}>{branchEmail}</Text>
            )}
          </View>
          <View style={s.headerRight}>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={s.invoiceNumber}>{invoiceNumber}</Text>
            <View style={s.statusBadge}>
              <Text style={s.statusText}>{status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* ── Bill To / Invoice Details ── */}
        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>BILL TO</Text>
            <Text style={s.metaName}>{customerName}</Text>
            {customerEmail && <Text style={s.metaDetail}>{customerEmail}</Text>}
            {customerPhone && <Text style={s.metaDetail}>{customerPhone}</Text>}
            {customerAddress && <Text style={s.metaDetail}>{customerAddress}</Text>}
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>INVOICE DETAILS</Text>
            <View style={s.metaDateRow}>
              <Text style={s.metaDateLabel}>Issue Date</Text>
              <Text style={s.metaDateValue}>{new Date(issuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
            </View>
            {dueAt && (
              <View style={s.metaDateRow}>
                <Text style={s.metaDateLabel}>Due Date</Text>
                <Text style={s.metaDateValue}>{new Date(dueAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
              </View>
            )}
            <View style={s.metaDateRow}>
              <Text style={s.metaDateLabel}>Status</Text>
              <Text style={[s.metaDateValue, { color: pc }]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
            </View>
            {amountPaid > 0 && (
              <View style={s.metaDateRow}>
                <Text style={s.metaDateLabel}>Amount Paid</Text>
                <Text style={s.metaDateValue}>{fmt(amountPaid, currency)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Line items table ── */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.thText, s.colNum]}>#</Text>
            <Text style={[s.thText, s.colDesc]}>Description</Text>
            <Text style={[s.thText, s.colQty, { textAlign: 'center' }]}>Qty</Text>
            <Text style={[s.thText, s.colUnit, { textAlign: 'right' }]}>Unit Price</Text>
            <Text style={[s.thText, s.colTotal, { textAlign: 'right' }]}>Amount</Text>
          </View>
          {items.map((item, i) => (
            <View key={i} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
              <Text style={[s.tdText, s.colNum, { color: '#9ca3af' }]}>{i + 1}</Text>
              <View style={s.colDesc}>
                <Text style={s.tdText}>{item.description}</Text>
              </View>
              <Text style={[s.tdText, s.colQty, { textAlign: 'center' }]}>{item.quantity}</Text>
              <Text style={[s.tdText, s.colUnit, { textAlign: 'right' }]}>{fmt(item.unit_price, currency)}</Text>
              <Text style={[s.tdText, s.colTotal, { textAlign: 'right', fontFamily: bold }]}>{fmt(item.quantity * item.unit_price, currency)}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={s.totalsSection}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmt(subtotal, currency)}</Text>
          </View>
          {discount > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Discount</Text>
              <Text style={[s.totalValue, { color: '#10b981' }]}>-{fmt(discount, currency)}</Text>
            </View>
          )}
          {settings.show_tax_breakdown && tax > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Tax</Text>
              <Text style={s.totalValue}>{fmt(tax, currency)}</Text>
            </View>
          )}
          <View style={s.divider} />
          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>Total</Text>
            <Text style={s.grandTotalValue}>{fmt(total, currency)}</Text>
          </View>
          {amountPaid > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Paid</Text>
              <Text style={[s.totalValue, { color: '#10b981' }]}>{fmt(amountPaid, currency)}</Text>
            </View>
          )}
          {balanceDue > 0 ? (
            <View style={s.balanceBadge}>
              <Text style={s.balanceBadgeLabel}>Balance Due</Text>
              <Text style={s.balanceBadgeValue}>{fmt(balanceDue, currency)}</Text>
            </View>
          ) : (
            <View style={s.paidBadge}>
              <Text style={s.paidBadgeText}>PAID IN FULL</Text>
            </View>
          )}
        </View>

        {/* ── Notes ── */}
        {notes && (
          <View style={s.notesSection}>
            <Text style={s.notesLabel}>NOTES</Text>
            <Text style={s.notesText}>{notes}</Text>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          {settings.thank_you_message && (
            <Text style={s.thankYou}>{settings.thank_you_message}</Text>
          )}
          {settings.footer_line_1 && <Text style={s.footerLine}>{settings.footer_line_1}</Text>}
          {settings.footer_line_2 && <Text style={s.footerLine}>{settings.footer_line_2}</Text>}
          {settings.footer_line_3 && <Text style={s.footerLine}>{settings.footer_line_3}</Text>}
          {socialEntries.length > 0 && (
            <View style={s.socialRow}>
              {socialEntries.map(([key, val], i) => (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {i > 0 && <Text style={s.socialSep}> · </Text>}
                  <Text style={s.socialItem}>{SOCIAL_LABELS[key]}: {val}</Text>
                </View>
              ))}
            </View>
          )}
          {settings.policy_text && (
            <Text style={s.policy}>{settings.policy_text}</Text>
          )}
        </View>

      </Page>
    </Document>
  )
}

// ── Receipt layout (narrow thermal) ──────────────────────────────────────────

function ReceiptPdf({
  settings, invoiceNumber, status, issuedAt,
  businessName, branchName, branchAddress, branchPhone,
  customerName,
  items, subtotal, discount = 0, tax, total, amountPaid = 0,
  family, bold, fmt, socialEntries,
}: InvoicePdfProps & {
  family: string; bold: string
  fmt: (n: number) => string
  socialEntries: [keyof SocialLinks, string][]
}) {
  const pc = settings.primary_color
  const tc = settings.text_color
  const balanceDue = Math.max(0, total - amountPaid)
  const pageWidth = settings.paper_size === 'Receipt58' ? 165 : 227

  const s = StyleSheet.create({
    page: { fontFamily: family, backgroundColor: '#ffffff', padding: 10 },
    center: { textAlign: 'center' },
    businessName: { fontSize: 12, fontFamily: bold, color: tc, textAlign: 'center', marginBottom: 1 },
    branchName: { fontSize: 8, color: '#6b7280', textAlign: 'center', marginBottom: 1 },
    detail: { fontSize: 7.5, color: '#6b7280', textAlign: 'center', marginBottom: 1 },
    divider: { borderTop: '1 dashed #d1d5db', marginVertical: 6 },
    invoiceNo: { fontSize: 9, fontFamily: bold, textAlign: 'center', color: tc, marginBottom: 2 },
    dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    dateLabel: { fontSize: 7.5, color: '#6b7280' },
    dateValue: { fontSize: 7.5, color: tc },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    itemDesc: { fontSize: 8, color: tc, flex: 1, paddingRight: 4 },
    itemAmt: { fontSize: 8, color: tc, textAlign: 'right' },
    itemQty: { fontSize: 7, color: '#9ca3af' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 },
    totalLabel: { fontSize: 8, color: '#6b7280' },
    totalValue: { fontSize: 8, color: tc },
    grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
    grandLabel: { fontSize: 11, fontFamily: bold, color: tc },
    grandValue: { fontSize: 11, fontFamily: bold, color: pc },
    balanceRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: pc, padding: 5, borderRadius: 3, marginTop: 4 },
    balanceLabel: { fontSize: 9, fontFamily: bold, color: '#ffffff' },
    balanceValue: { fontSize: 9, fontFamily: bold, color: '#ffffff' },
    thankYou: { fontSize: 8, fontFamily: bold, color: pc, textAlign: 'center', marginTop: 6 },
    footerText: { fontSize: 7, color: '#9ca3af', textAlign: 'center', marginTop: 1 },
    policy: { fontSize: 6, color: '#9ca3af', textAlign: 'center', marginTop: 5 },
  })

  return (
    <Document>
      <Page size={[pageWidth, 841]} style={s.page}>
        {settings.show_logo && settings.logo_url && (
          <Image src={settings.logo_url} style={{ width: 48, height: 48, objectFit: 'contain', alignSelf: 'center', marginBottom: 6 }} />
        )}
        {settings.show_business_name && <Text style={s.businessName}>{businessName}</Text>}
        {settings.show_branch_name && branchName && <Text style={s.branchName}>{branchName}</Text>}
        {settings.show_address && branchAddress && <Text style={s.detail}>{branchAddress}</Text>}
        {settings.show_phone && branchPhone && <Text style={s.detail}>{branchPhone}</Text>}

        <View style={s.divider} />
        <Text style={s.invoiceNo}>{invoiceNumber}</Text>
        <View style={s.dateRow}>
          <Text style={s.dateLabel}>Date</Text>
          <Text style={s.dateValue}>{new Date(issuedAt).toLocaleDateString('en-GB')}</Text>
        </View>
        <View style={s.dateRow}>
          <Text style={s.dateLabel}>Customer</Text>
          <Text style={s.dateValue}>{customerName}</Text>
        </View>
        <View style={s.dateRow}>
          <Text style={s.dateLabel}>Status</Text>
          <Text style={[s.dateValue, { color: pc }]}>{status}</Text>
        </View>

        <View style={s.divider} />
        {items.map((item, i) => (
          <View key={i} style={s.itemRow}>
            <View style={{ flex: 1, paddingRight: 4 }}>
              <Text style={s.itemDesc}>{item.description}</Text>
              <Text style={s.itemQty}>x{item.quantity} @ {fmt(item.unit_price)}</Text>
            </View>
            <Text style={s.itemAmt}>{fmt(item.quantity * item.unit_price)}</Text>
          </View>
        ))}

        <View style={s.divider} />
        <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalValue}>{fmt(subtotal)}</Text></View>
        {discount > 0 && <View style={s.totalRow}><Text style={s.totalLabel}>Discount</Text><Text style={[s.totalValue, { color: '#10b981' }]}>-{fmt(discount)}</Text></View>}
        {settings.show_tax_breakdown && tax > 0 && <View style={s.totalRow}><Text style={s.totalLabel}>Tax</Text><Text style={s.totalValue}>{fmt(tax)}</Text></View>}
        <View style={s.divider} />
        <View style={s.grandRow}><Text style={s.grandLabel}>Total</Text><Text style={s.grandValue}>{fmt(total)}</Text></View>
        {amountPaid > 0 && <View style={s.totalRow}><Text style={s.totalLabel}>Paid</Text><Text style={[s.totalValue, { color: '#10b981' }]}>{fmt(amountPaid)}</Text></View>}
        {balanceDue > 0 && (
          <View style={s.balanceRow}>
            <Text style={s.balanceLabel}>Balance Due</Text>
            <Text style={s.balanceValue}>{fmt(balanceDue)}</Text>
          </View>
        )}

        <View style={s.divider} />
        {settings.thank_you_message && <Text style={s.thankYou}>{settings.thank_you_message}</Text>}
        {settings.footer_line_1 && <Text style={s.footerText}>{settings.footer_line_1}</Text>}
        {settings.footer_line_2 && <Text style={s.footerText}>{settings.footer_line_2}</Text>}
        {settings.footer_line_3 && <Text style={s.footerText}>{settings.footer_line_3}</Text>}
        {socialEntries.map(([key, val]) => (
          <Text key={key} style={s.footerText}>{SOCIAL_LABELS[key]}: {val}</Text>
        ))}
        {settings.policy_text && <Text style={s.policy}>{settings.policy_text}</Text>}
      </Page>
    </Document>
  )
}
