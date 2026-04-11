import {
  Document, Page, Text, View, StyleSheet, Image, Font,
} from '@react-pdf/renderer'

// ── Styles ─────────────────────────────────────────────────────────────────────

const C = {
  brand:    '#0d9488',
  dark:     '#111827',
  mid:      '#374151',
  muted:    '#6b7280',
  faint:    '#9ca3af',
  border:   '#e5e7eb',
  bg:       '#f9fafb',
  bgBrand:  '#f0fdfa',
  red:      '#ef4444',
  green:    '#16a34a',
  orange:   '#f97316',
  amber:    '#d97706',
}

const s = StyleSheet.create({
  page:        { padding: 0, fontFamily: 'Helvetica', fontSize: 10, backgroundColor: '#ffffff' },

  // Header band
  headerBand:  { backgroundColor: C.brand, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 20 },
  logoBox:     { width: 56, height: 56, borderRadius: 10, backgroundColor: '#ffffff22', marginBottom: 12, overflow: 'hidden' },
  logoImage:   { width: 56, height: 56, objectFit: 'contain' },
  logoFallback:{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#ffffff33', alignItems: 'center', justifyContent: 'center' },
  logoPadding: { paddingTop: 8 },
  brandName:   { fontSize: 18, fontWeight: 'bold', color: '#ffffff', letterSpacing: 0.3 },
  brandSub:    { fontSize: 8.5, color: '#ccfbf1', marginTop: 2 },
  receiptLabel:{ fontSize: 9, color: '#ccfbf1', letterSpacing: 1, textTransform: 'uppercase', marginTop: 14 },
  receiptTitle:{ fontSize: 22, fontWeight: 'bold', color: '#ffffff', marginTop: 2 },
  receiptId:   { fontSize: 9, color: '#99f6e4', marginTop: 4 },

  // Body
  body:        { paddingHorizontal: 32, paddingTop: 20, paddingBottom: 32 },

  // Meta info grid
  metaGrid:    { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 8, padding: 14, marginBottom: 18, gap: 8 },
  metaCell:    { flex: 1 },
  metaLabel:   { fontSize: 7.5, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  metaValue:   { fontSize: 9.5, color: C.dark, fontWeight: 'bold' },

  // Rush badge
  rushBadge:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff7ed', borderRadius: 6,
                 borderWidth: 1, borderColor: '#fed7aa', paddingHorizontal: 10, paddingVertical: 5, marginBottom: 16 },
  rushDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange, marginRight: 6 },
  rushText:    { fontSize: 8.5, color: C.amber, fontWeight: 'bold' },

  // Refund banner
  refundBanner:{ backgroundColor: '#fef2f2', borderRadius: 6, borderWidth: 1, borderColor: '#fecaca',
                 paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  refundText:  { fontSize: 8.5, color: '#991b1b' },

  // Items table
  tableHead:   { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1.5, borderBottomColor: C.border, marginBottom: 4 },
  thText:      { fontSize: 7.5, fontWeight: 'bold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  tableRow:    { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: C.border },
  tableRowAlt: { backgroundColor: C.bg },
  tdText:      { fontSize: 9.5, color: C.dark },
  tdMuted:     { fontSize: 8.5, color: C.muted },

  cItem:  { flex: 4 },
  cQty:   { flex: 1, textAlign: 'center' },
  cPrice: { flex: 1.4, textAlign: 'right' },
  cDisc:  { flex: 1.4, textAlign: 'right' },
  cTotal: { flex: 1.6, textAlign: 'right' },

  // Totals block
  totalsWrap:  { marginTop: 14, borderTopWidth: 1.5, borderTopColor: C.border, paddingTop: 12 },
  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 5 },
  totalLabel:  { width: 100, textAlign: 'right', color: C.muted, fontSize: 9 },
  totalVal:    { width: 90, textAlign: 'right', fontSize: 9.5, color: C.dark },
  grandRow:    { flexDirection: 'row', justifyContent: 'flex-end',
                 marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border },
  grandLabel:  { width: 100, textAlign: 'right', fontWeight: 'bold', fontSize: 11, color: C.dark },
  grandVal:    { width: 90, textAlign: 'right', fontWeight: 'bold', fontSize: 13, color: C.brand },

  // Payment splits
  splitsWrap:  { marginTop: 12, backgroundColor: C.bgBrand, borderRadius: 6, padding: 10 },
  splitsTitle: { fontSize: 7.5, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, fontWeight: 'bold' },
  splitRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  splitMethod: { fontSize: 9, color: C.mid },
  splitAmt:    { fontSize: 9, color: C.dark, fontWeight: 'bold' },

  // Notes
  notesWrap:   { marginTop: 14, padding: 10, backgroundColor: C.bg, borderRadius: 6 },
  notesLabel:  { fontSize: 7.5, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  notesText:   { fontSize: 9, color: C.mid },

  // Footer
  footer:      { marginTop: 28, borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 14, alignItems: 'center' },
  footerMain:  { fontSize: 10, color: C.mid, textAlign: 'center', marginBottom: 4 },
  footerSub:   { fontSize: 8, color: C.faint, textAlign: 'center' },
  footerBrand: { fontSize: 7.5, color: C.faint, marginTop: 10, textAlign: 'center' },
})

// ── Types ──────────────────────────────────────────────────────────────────────

interface SaleItem {
  name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
}

export interface SaleReceiptPdfProps {
  saleId: string
  date: string
  customerName: string
  cashierName: string
  paymentMethod: string
  paymentStatus: string
  items: SaleItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  isRefund?: boolean
  refundReason?: string | null
  paymentSplits?: { method: string; amount: number }[] | null
  notes?: string | null
  // Branch info
  branchName?: string | null
  branchAddress?: string | null
  branchPhone?: string | null
  branchEmail?: string | null
  logoUrl?: string | null
  currency?: string
  taxRate?: number
  // Rush job flag — shown prominently on receipt
  isRushJob?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', gift_card: 'Gift Card',
  split: 'Split Payment', voucher: 'Voucher',
}

const STATUS_COLORS: Record<string, string> = {
  paid: C.green, refunded: C.red, partial: C.amber, pending: C.faint,
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SaleReceiptPdf({
  saleId, date, customerName, cashierName, paymentMethod, paymentStatus,
  items, subtotal, discount, tax, total,
  isRefund, refundReason, paymentSplits, notes,
  branchName, branchAddress, branchPhone, branchEmail, logoUrl,
  currency = '£', taxRate, isRushJob,
}: SaleReceiptPdfProps) {
  const fmt = (n: number) => `${currency}${Number(n).toFixed(2)}`
  const statusColor = STATUS_COLORS[paymentStatus] ?? C.muted

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header band ── */}
        <View style={s.headerBand}>
          {/* Logo */}
          {logoUrl ? (
            <Image src={logoUrl} style={s.logoImage} />
          ) : (
            <View style={[s.logoFallback, s.logoPadding]}>
              <Text style={{ fontSize: 22, color: '#ffffff', fontWeight: 'bold' }}>
                {(branchName ?? 'B').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          {/* Branch name / address */}
          <Text style={s.brandName}>{branchName ?? 'Business Name'}</Text>
          {branchAddress && <Text style={s.brandSub}>{branchAddress}</Text>}
          {(branchPhone || branchEmail) && (
            <Text style={s.brandSub}>
              {[branchPhone, branchEmail].filter(Boolean).join('  ·  ')}
            </Text>
          )}

          {/* Receipt type label */}
          <Text style={s.receiptLabel}>{isRefund ? 'Refund Receipt' : 'Sale Receipt'}</Text>
          <Text style={s.receiptTitle}>{isRefund ? 'Refund' : 'Invoice'}</Text>
          <Text style={s.receiptId}>
            #{saleId.slice(-8).toUpperCase()}  ·  {date}
          </Text>
        </View>

        {/* ── Body ── */}
        <View style={s.body}>

          {/* Rush Job Banner */}
          {isRushJob && (
            <View style={s.rushBadge}>
              <View style={s.rushDot} />
              <Text style={s.rushText}>⚡  RUSH JOB — Priority Repair</Text>
            </View>
          )}

          {/* Refund reason */}
          {isRefund && refundReason && (
            <View style={s.refundBanner}>
              <Text style={s.refundText}>Refund reason: {refundReason}</Text>
            </View>
          )}

          {/* Meta grid: Customer | Cashier | Payment | Status */}
          <View style={s.metaGrid}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Customer</Text>
              <Text style={s.metaValue}>{customerName}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Cashier</Text>
              <Text style={s.metaValue}>{cashierName}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Payment</Text>
              <Text style={s.metaValue}>
                {paymentMethod === 'split' && paymentSplits?.length
                  ? 'Split'
                  : PAYMENT_LABELS[paymentMethod] ?? paymentMethod}
              </Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Status</Text>
              <Text style={[s.metaValue, { color: statusColor }]}>
                {paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}
              </Text>
            </View>
          </View>

          {/* ── Items table ── */}
          <View style={s.tableHead}>
            <Text style={[s.thText, s.cItem]}>Item</Text>
            <Text style={[s.thText, s.cQty]}>Qty</Text>
            <Text style={[s.thText, s.cPrice]}>Price</Text>
            <Text style={[s.thText, s.cDisc]}>Disc.</Text>
            <Text style={[s.thText, s.cTotal]}>Total</Text>
          </View>

          {items.map((item, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tdText, s.cItem]}>{item.name}</Text>
              <Text style={[s.tdText, s.cQty]}>{item.quantity}</Text>
              <Text style={[s.tdText, s.cPrice]}>{fmt(Number(item.unit_price))}</Text>
              <Text style={[s.tdMuted, s.cDisc]}>
                {Number(item.discount) > 0 ? `-${fmt(Number(item.discount))}` : '—'}
              </Text>
              <Text style={[s.tdText, s.cTotal, { fontWeight: 'bold' }]}>
                {fmt(Number(item.total))}
              </Text>
            </View>
          ))}

          {/* ── Totals ── */}
          <View style={s.totalsWrap}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalVal}>{fmt(subtotal)}</Text>
            </View>
            {discount > 0 && (
              <View style={s.totalRow}>
                <Text style={[s.totalLabel, { color: C.green }]}>Discount</Text>
                <Text style={[s.totalVal, { color: C.green }]}>-{fmt(discount)}</Text>
              </View>
            )}
            {tax > 0 && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Tax{taxRate ? ` (${taxRate}%)` : ''}</Text>
                <Text style={s.totalVal}>{fmt(tax)}</Text>
              </View>
            )}
            <View style={s.grandRow}>
              <Text style={s.grandLabel}>{isRefund ? 'Amount Refunded' : 'Total'}</Text>
              <Text style={[s.grandVal, isRefund ? { color: C.red } : {}]}>{fmt(total)}</Text>
            </View>
          </View>

          {/* ── Payment splits breakdown ── */}
          {paymentMethod === 'split' && paymentSplits && paymentSplits.length > 0 && (
            <View style={s.splitsWrap}>
              <Text style={s.splitsTitle}>Payment Breakdown</Text>
              {paymentSplits.map((sp, i) => (
                <View key={i} style={s.splitRow}>
                  <Text style={s.splitMethod}>{PAYMENT_LABELS[sp.method] ?? sp.method}</Text>
                  <Text style={s.splitAmt}>{fmt(sp.amount)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Notes ── */}
          {notes && (
            <View style={s.notesWrap}>
              <Text style={s.notesLabel}>Notes</Text>
              <Text style={s.notesText}>{notes}</Text>
            </View>
          )}

          {/* ── Footer ── */}
          <View style={s.footer}>
            <Text style={s.footerMain}>
              {isRefund ? 'Your refund has been processed.' : 'Thank you for your business!'}
            </Text>
            {branchPhone && (
              <Text style={s.footerSub}>Questions? Call us at {branchPhone}</Text>
            )}
            {branchEmail && <Text style={s.footerSub}>{branchEmail}</Text>}
            <Text style={s.footerBrand}>
              Receipt generated by SwiftPOS · {date}
            </Text>
          </View>

        </View>
      </Page>
    </Document>
  )
}
