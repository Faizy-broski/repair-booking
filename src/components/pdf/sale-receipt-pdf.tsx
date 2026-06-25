import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'
import type { InvoiceSettings } from '@/types/invoice-settings'
import { DEFAULT_INVOICE_SETTINGS } from '@/types/invoice-settings'
import { formatCurrency } from '@/lib/utils'

// ── Styles ─────────────────────────────────────────────────────────────────────

const C = {
  brand: '#0d9488',
  dark: '#111827',
  mid: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  border: '#e5e7eb',
  bg: '#f9fafb',
  bgBrand: '#f0fdfa',
  red: '#ef4444',
  green: '#16a34a',
  orange: '#f97316',
  amber: '#d97706',
}

const PAPER_SIZES: Record<string, any> = {
  A4: 'A4',
  A5: 'A5',
  Letter: 'LETTER',
  // Heights for thermal receipts are computed dynamically — see calcSaleReceiptPageHeight()
  Receipt80: [227, 841],
  Receipt58: [165, 841],
}

function calcSaleReceiptPageHeight(opts: {
  showLogo: boolean
  showBusinessName: boolean
  showAddress: boolean
  showPhone: boolean
  showEmail: boolean
  isRushJob: boolean
  isRefund: boolean
  hasRefundReason: boolean
  items: { name: string }[]
  hasDiscount: boolean
  showTax: boolean
  hasPaymentSplits: boolean
  isCreditSale: boolean
  hasNotes: boolean
  hasThankYou: boolean
  footerLines: string[]
  socialLinkCount: number
  policyText: string | null | undefined
  pageWidth: number
}): number {
  let h = 0

  // Header band (paddingTop 16, paddingBottom 12, centered items)
  h += 28 // band padding
  if (opts.showLogo) h += 58  // image 48h + marginBottom 10
  if (opts.showBusinessName) h += 20  // fontSize 14 bold + spacing
  if (opts.showAddress) h += 12  // brandSub
  if (opts.showPhone) h += 12  // brandSub
  if (opts.showEmail) h += 12  // brandSub
  h += 20 // receiptLabel + marginTop 8
  h += 22 // receiptTitle fontSize 14
  h += 14 // receiptId + marginTop 4

  // Body (paddingTop 16, paddingBottom 32)
  h += 48 // body padding
  if (opts.isRushJob) h += 28 // rush banner
  if (opts.isRefund && opts.hasRefundReason) h += 28 // refund reason box

  // Meta grid: customer + cashier + payment (status only on full-page)
  h += 3 * 22 // 3 meta cells

  // Items
  h += 16 // items header divider
  let itemsHeight = 0
  for (const item of opts.items) {
    const nameLen = item.name ? item.name.length : 0
    const extraLines = Math.max(0, Math.ceil(nameLen / 24) - 1)
    itemsHeight += 28 + (extraLines * 10)
  }
  h += itemsHeight

  // Totals
  h += 20 // totalsWrap: borderTop + paddingTop
  h += 16 // subtotal
  if (opts.hasDiscount) h += 14
  if (opts.showTax) h += 14
  h += 26 // grandRow: marginTop 4 + paddingTop 6 + fontSize 14

  // Credit breakdown
  if (opts.isCreditSale) h += 80

  // Payment splits
  if (opts.hasPaymentSplits) h += 40

  // Notes
  if (opts.hasNotes) h += 40

  // Footer: marginTop 24 + borderTop 0.5 + paddingTop 12
  h += 40 // footer container
  if (opts.hasThankYou) h += 16
  const footerCharsPerLine = opts.pageWidth < 200 ? 26 : 36
  for (const line of opts.footerLines) {
    const wrappedLines = Math.max(1, Math.ceil(line.length / footerCharsPerLine))
    h += wrappedLines * 10 + 3
  }
  h += opts.socialLinkCount * 10
  if (opts.policyText) {
    const policyWrappedLines = Math.max(2, Math.ceil(opts.policyText.length / footerCharsPerLine))
    h += 15 + policyWrappedLines * 8
  }

  h += 80 // bottom breathing room — generous buffer so printer never clips footer
  return Math.max(h, 200)
}

function boldFont(family: string): string {
  if (family === 'Times-Roman') return 'Times-Bold'
  if (family === 'Courier') return 'Courier-Bold'
  return 'Helvetica-Bold'
}

// Global styles removed to prevent conflicts

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
  amountPaid?: number
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
  isExchange?: boolean
  exchangeReturnedItems?: SaleItem[]
  exchangeReturnedTotal?: number
  settings?: InvoiceSettings
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', gift_card: 'Gift Card',
  split: 'Split Payment', voucher: 'Voucher',
  on_account: 'Credit (On Account)',
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid', refunded: 'Refunded', partial: 'Partially Paid',
  on_account: 'On Account', pending: 'Pending',
}

const STATUS_COLORS: Record<string, string> = {
  paid: C.green, refunded: C.red, partial: C.amber, pending: C.faint,
  on_account: C.orange,
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SaleReceiptPdf({
  saleId, date, customerName, cashierName, paymentMethod, paymentStatus,
  items, subtotal, discount, tax, total, amountPaid,
  isRefund, refundReason, paymentSplits, notes,
  branchName, branchAddress, branchPhone, branchEmail, logoUrl,
  currency = 'GBP', taxRate, isRushJob, isExchange,
  exchangeReturnedItems = [], exchangeReturnedTotal = 0,
  settings = DEFAULT_INVOICE_SETTINGS,
}: SaleReceiptPdfProps) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const statusColor = STATUS_COLORS[paymentStatus] ?? C.muted
  const isCreditSale = paymentMethod === 'on_account'
  const depositPaid = amountPaid ?? 0
  const outstanding = Math.max(0, total - depositPaid)

  const isReceipt = settings.paper_size?.startsWith('Receipt')
  const family = settings.font_family || 'Helvetica'
  const bold = boldFont(family)
  const pc = settings.primary_color || C.brand
  const tc = settings.text_color || C.dark

  const paperSizeKey = settings.paper_size in PAPER_SIZES ? settings.paper_size : 'A4'
  const pageWidth = isReceipt ? (settings.paper_size === 'Receipt58' ? 165 : 227) : null

  const uniqueFooterLines = [settings.footer_line_1, settings.footer_line_2, settings.footer_line_3]
    .filter((l): l is string => !!l && l !== settings.thank_you_message)

  const pageSize = isReceipt && pageWidth
    ? [
      pageWidth,
      calcSaleReceiptPageHeight({
        showLogo: !!(settings.show_logo && (settings.logo_url || logoUrl)),
        showBusinessName: settings.show_business_name !== false,
        showAddress: !!(settings.show_address && branchAddress),
        showPhone: !!(settings.show_phone && branchPhone),
        showEmail: !!(settings.show_email && branchEmail),
        isRushJob: !!isRushJob,
        isRefund: !!isRefund,
        hasRefundReason: !!(isRefund && refundReason),
        items: items,
        hasDiscount: discount > 0,
        showTax: !!(settings.show_tax_breakdown && tax > 0),
        hasPaymentSplits: !!(settings.show_payment_method && paymentMethod === 'split' && paymentSplits?.length),
        isCreditSale: isCreditSale,
        hasNotes: !!notes,
        hasThankYou: !!settings.thank_you_message,
        footerLines: uniqueFooterLines,
        socialLinkCount: settings.social_links ? Object.values(settings.social_links).filter(Boolean).length : 0,
        policyText: settings.policy_text,
        pageWidth,
      }),
    ]
    : PAPER_SIZES[paperSizeKey]
  // Fixed amount column width on narrow thermal paper
  const amtWidth = settings.paper_size === 'Receipt58' ? 44 : 52

  const s = StyleSheet.create({
    page: {
      padding: 0,
      fontFamily: family,
      fontSize: 10,
      backgroundColor: '#ffffff'
    },
    headerBand: {
      backgroundColor: pc,
      paddingHorizontal: isReceipt ? 12 : 32,
      paddingTop: isReceipt ? 16 : 20,
      paddingBottom: isReceipt ? 12 : 16,
      alignItems: isReceipt ? 'center' : 'flex-start'
    },
    logoImage: {
      width: isReceipt ? 48 : 56,
      height: isReceipt ? 48 : 56,
      objectFit: 'contain',
      marginBottom: 10
    },
    brandName: {
      fontSize: isReceipt ? 14 : 18,
      fontFamily: bold,
      color: '#ffffff',
      textAlign: isReceipt ? 'center' : 'left'
    },
    brandSub: {
      fontSize: 8,
      color: '#ffffffdd',
      marginTop: 2,
      textAlign: isReceipt ? 'center' : 'left'
    },
    receiptLabel: {
      fontSize: 8,
      color: '#ffffffaa',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: isReceipt ? 8 : 14,
      textAlign: isReceipt ? 'center' : 'left'
    },
    receiptTitle: {
      fontSize: isReceipt ? 14 : 22,
      fontFamily: bold,
      color: '#ffffff',
      marginTop: 2,
      textAlign: isReceipt ? 'center' : 'left'
    },
    receiptId: {
      fontSize: isReceipt ? 7.5 : 8,
      color: '#ffffffaa',
      marginTop: 4,
      textAlign: isReceipt ? 'center' : 'left'
    },
    body: {
      paddingHorizontal: isReceipt ? 12 : 32,
      paddingTop: 14,
      paddingBottom: 24
    },
    metaGrid: {
      backgroundColor: isReceipt ? 'transparent' : '#f3f4f6',
      borderRadius: 6,
      padding: isReceipt ? 0 : 10,
      marginBottom: 14,
    },
    metaRow: {
      flexDirection: 'row',
      marginBottom: isReceipt ? 6 : 6,
    },
    metaCell: {
      flex: 1,
      flexDirection: 'column',
    },
    metaLabel: {
      fontSize: 7,
      color: C.mid,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 1,
    },
    metaValue: {
      fontSize: 9,
      color: tc,
      fontFamily: bold,
    },
    tableHead: {
      flexDirection: 'row',
      paddingBottom: 6,
      borderBottomWidth: 1.5,
      borderBottomColor: C.border,
      marginBottom: 4
    },
    thText: { fontSize: 7, fontFamily: bold, color: C.mid, textTransform: 'uppercase' },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 7,
      borderBottomWidth: 0.5,
      borderBottomColor: C.border
    },
    tdText: { fontSize: 9, color: tc },
    totalsWrap: { marginTop: 10, borderTopWidth: 1.5, borderTopColor: C.border, paddingTop: 8 },
    totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
    totalLabel: { width: 100, textAlign: 'right', color: C.mid, fontSize: 8.5 },
    totalVal: { width: 90, textAlign: 'right', fontSize: 9, color: tc },
    grandRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 4,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: C.border
    },
    grandLabel: { width: 100, textAlign: 'right', fontFamily: bold, fontSize: 10, color: tc },
    grandVal: { width: 90, textAlign: 'right', fontFamily: bold, fontSize: 14, color: pc },
    // Receipt-mode item rows
    rctItemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, borderBottomWidth: 0.5, borderBottomColor: C.border, paddingBottom: 4 },
    rctItemAmt: { fontSize: 9, color: tc, fontFamily: bold, textAlign: 'right', width: amtWidth, flexShrink: 0 },
    // Receipt-mode totals
    rctTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    rctTotalLabel: { fontSize: 8.5, color: C.mid },
    rctTotalVal: { fontSize: 9, color: tc },
    rctGrandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border },
    rctGrandLabel: { fontSize: 10, fontFamily: bold, color: tc },
    rctGrandVal: { fontSize: 14, fontFamily: bold, color: pc },
    footer: { marginTop: 16, borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 10, alignItems: 'center' },
    footerMain: { fontSize: 9, fontFamily: bold, color: pc, textAlign: 'center', marginBottom: 3 },
    footerSub: { fontSize: 7.5, color: C.mid, textAlign: 'center', marginBottom: 1 },
    footerBrand: { fontSize: 7, color: C.muted, marginTop: 8, textAlign: 'center' },
  })
  return (
    <Document>
      <Page size={pageSize} orientation={settings.orientation === 'landscape' ? 'landscape' : 'portrait'} style={s.page}>

        {/* ── Header band ── */}
        <View style={s.headerBand}>
          {/* Logo */}
          {settings.show_logo && (settings.logo_url || logoUrl) ? (
            <Image src={settings.logo_url || (logoUrl ?? '')} style={s.logoImage} />
          ) : null}

          {/* Branch name / address */}
          {settings.show_business_name && <Text style={s.brandName}>{branchName ?? 'Business Name'}</Text>}
          {settings.show_address && branchAddress && <Text style={s.brandSub}>{branchAddress}</Text>}
          <View style={{ flexDirection: isReceipt ? 'column' : 'row', alignItems: isReceipt ? 'center' : 'flex-start', marginTop: 2 }}>
            {settings.show_phone && branchPhone && <Text style={s.brandSub}>{branchPhone}</Text>}
            {settings.show_phone && settings.show_email && branchPhone && branchEmail && !isReceipt && <Text style={[s.brandSub, { marginHorizontal: 6 }]}>·</Text>}
            {settings.show_email && branchEmail && <Text style={s.brandSub}>{branchEmail}</Text>}
          </View>

          {/* Receipt type label */}
          <Text style={s.receiptLabel}>{isExchange ? 'Exchange Receipt' : isRefund ? 'Refund Receipt' : 'Sale Receipt'}</Text>
          <Text style={s.receiptTitle}>{isExchange ? 'EXCHANGE' : isRefund ? 'Refund' : 'ORDER RECEIPT'}</Text>
          <Text style={s.receiptId}>
            #{saleId.slice(-8).toUpperCase()}  ·  {date}
          </Text>
        </View>

        {/* ── Body ── */}
        <View style={s.body}>

          {/* Rush Job Banner */}
          {isRushJob && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff7ed', borderRadius: 6, borderWidth: 1, borderColor: '#fed7aa', padding: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 9, color: '#d97706', fontFamily: bold }}>⚡  RUSH JOB — Priority Repair</Text>
            </View>
          )}

          {/* Refund reason */}
          {isRefund && refundReason && (
            <View style={{ backgroundColor: '#fef2f2', borderRadius: 6, borderWidth: 1, borderColor: '#fecaca', padding: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 9, color: '#991b1b' }}>Refund reason: {refundReason}</Text>
            </View>
          )}

          {/* Meta grid: Customer | Cashier on row 1 · Payment | Status on row 2 */}
          <View style={s.metaGrid}>
            {/* Row 1: Customer + Cashier */}
            <View style={s.metaRow}>
              <View style={s.metaCell}>
                <Text style={s.metaLabel}>Customer</Text>
                <Text style={s.metaValue}>{customerName}</Text>
              </View>
              <View style={s.metaCell}>
                <Text style={s.metaLabel}>Cashier</Text>
                <Text style={s.metaValue}>{cashierName}</Text>
              </View>
            </View>
            {/* Row 2: Payment + Status */}
            <View style={[s.metaRow, { marginBottom: 0 }]}>
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
                  {STATUS_LABELS[paymentStatus] ?? paymentStatus}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Items table ── */}
          {isExchange ? (
            /* Exchange: two sections — Returned Items + New Items */
            <>
              {/* Returned Items */}
              {exchangeReturnedItems.length > 0 && (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e0e7ff', marginBottom: 4, paddingBottom: 3, marginTop: 4 }}>
                    <Text style={[s.thText, { color: C.red }]}>Returned Items</Text>
                    <Text style={[s.thText, { textAlign: 'right', color: C.red }]}>Credit</Text>
                  </View>
                  {exchangeReturnedItems.map((item, i) => (
                    isReceipt ? (
                      <View key={i} style={s.rctItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, color: tc }}>{item.name}</Text>
                          <Text style={{ fontSize: 7.5, color: C.mid, marginTop: 2 }}>{item.quantity} × {fmt(Number(item.unit_price))}</Text>
                        </View>
                        <Text style={[s.rctItemAmt, { color: C.red }]}>-{fmt(Number(item.total))}</Text>
                      </View>
                    ) : (
                      <View key={i} style={s.tableRow}>
                        <Text style={[s.tdText, { flex: 4 }]}>{item.name}</Text>
                        <Text style={[s.tdText, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
                        <Text style={[s.tdText, { flex: 1.4, textAlign: 'right' }]}>{fmt(Number(item.unit_price))}</Text>
                        <Text style={[s.tdText, { flex: 1.4, textAlign: 'right', color: C.mid }]}>—</Text>
                        <Text style={[s.tdText, { flex: 1.6, textAlign: 'right', fontFamily: bold, color: C.red }]}>-{fmt(Number(item.total))}</Text>
                      </View>
                    )
                  ))}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 0.5, borderTopColor: C.border, marginTop: 2 }}>
                    <Text style={{ fontSize: 9, color: C.red, fontFamily: bold }}>Return Credit</Text>
                    <Text style={{ fontSize: 9, color: C.red, fontFamily: bold }}>-{fmt(exchangeReturnedTotal)}</Text>
                  </View>
                </>
              )}

              {/* Separator */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#e0e7ff', marginVertical: 6 }} />

              {/* New Items */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e0e7ff', marginBottom: 4, paddingBottom: 3 }}>
                <Text style={[s.thText, { color: '#4f46e5' }]}>New Items</Text>
                <Text style={[s.thText, { textAlign: 'right', color: '#4f46e5' }]}>Total</Text>
              </View>
              {isReceipt ? (
                items.map((item, i) => (
                  <View key={i} style={s.rctItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, color: tc }}>{item.name}</Text>
                      <Text style={{ fontSize: 7.5, color: C.mid, marginTop: 2 }}>{item.quantity} × {fmt(Number(item.unit_price))}</Text>
                    </View>
                    <Text style={s.rctItemAmt}>{fmt(Number(item.total))}</Text>
                  </View>
                ))
              ) : (
                <>
                  <View style={s.tableHead}>
                    <Text style={[s.thText, { flex: 4 }]}>Item</Text>
                    <Text style={[s.thText, { flex: 1, textAlign: 'center' }]}>Qty</Text>
                    <Text style={[s.thText, { flex: 1.4, textAlign: 'right' }]}>Price</Text>
                    <Text style={[s.thText, { flex: 1.4, textAlign: 'right' }]}>Disc.</Text>
                    <Text style={[s.thText, { flex: 1.6, textAlign: 'right' }]}>Total</Text>
                  </View>
                  {items.map((item, i) => (
                    <View key={i} style={s.tableRow}>
                      <Text style={[s.tdText, { flex: 4 }]}>{item.name}</Text>
                      <Text style={[s.tdText, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
                      <Text style={[s.tdText, { flex: 1.4, textAlign: 'right' }]}>{fmt(Number(item.unit_price))}</Text>
                      <Text style={[s.tdText, { flex: 1.4, textAlign: 'right', color: C.mid }]}>—</Text>
                      <Text style={[s.tdText, { flex: 1.6, textAlign: 'right', fontFamily: bold }]}>{fmt(Number(item.total))}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          ) : isReceipt ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1.5, borderBottomColor: C.border, marginBottom: 6, paddingBottom: 4 }}>
                <Text style={s.thText}>Item</Text>
                <Text style={[s.thText, { textAlign: 'right' }]}>Amt</Text>
              </View>
              {items.map((item, i) => (
                <View key={i} style={s.rctItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, color: tc }}>{item.name}</Text>
                    <Text style={{ fontSize: 7.5, color: C.mid, marginTop: 2 }}>
                      {item.quantity} × {fmt(Number(item.unit_price))}
                      {Number(item.discount) > 0 ? `  -${fmt(Number(item.discount))}` : ''}
                    </Text>
                  </View>
                  <Text style={s.rctItemAmt}>{fmt(Number(item.total))}</Text>
                </View>
              ))}
            </>
          ) : (
            <>
              <View style={s.tableHead}>
                <Text style={[s.thText, { flex: 4 }]}>Item</Text>
                <Text style={[s.thText, { flex: 1, textAlign: 'center' }]}>Qty</Text>
                <Text style={[s.thText, { flex: 1.4, textAlign: 'right' }]}>Price</Text>
                <Text style={[s.thText, { flex: 1.4, textAlign: 'right' }]}>Disc.</Text>
                <Text style={[s.thText, { flex: 1.6, textAlign: 'right' }]}>Total</Text>
              </View>
              {items.map((item, i) => (
                <View key={i} style={s.tableRow}>
                  <Text style={[s.tdText, { flex: 4 }]}>{item.name}</Text>
                  <Text style={[s.tdText, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
                  <Text style={[s.tdText, { flex: 1.4, textAlign: 'right' }]}>{fmt(Number(item.unit_price))}</Text>
                  <Text style={[s.tdText, { color: Number(item.discount) > 0 ? '#10b981' : C.mid, flex: 1.4, textAlign: 'right' }]}>
                    {Number(item.discount) > 0 ? `-${fmt(Number(item.discount))}` : '—'}
                  </Text>
                  <Text style={[s.tdText, { flex: 1.6, textAlign: 'right', fontFamily: bold }]}>
                    {fmt(Number(item.total))}
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* ── Totals ── */}
          {isExchange ? (
            /* Exchange totals: return credit · new items · net */
            <View style={s.totalsWrap}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 9, color: C.red }}>Return Credit</Text>
                <Text style={{ fontSize: 9, color: C.red, fontFamily: bold }}>-{fmt(exchangeReturnedTotal)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 9, color: '#4f46e5' }}>New Items</Text>
                <Text style={{ fontSize: 9, color: '#4f46e5', fontFamily: bold }}>+{fmt(items.reduce((s, i) => s + Number(i.total), 0))}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border, marginTop: 2 }}>
                <Text style={{ fontSize: 13, fontFamily: bold, color: tc }}>
                  {total > 0 ? 'Customer Pays' : total < 0 ? 'Customer Receives' : 'No Charge'}
                </Text>
                <Text style={{ fontSize: 13, fontFamily: bold, color: total > 0 ? C.red : total < 0 ? C.green : C.muted }}>
                  {total === 0 ? '—' : fmt(Math.abs(total))}
                </Text>
              </View>
              {total < 0 && (
                <Text style={{ fontSize: 8, color: C.muted, marginTop: 4, textAlign: 'right' }}>
                  Refund the difference to the customer
                </Text>
              )}
            </View>
          ) : isReceipt ? (
            <View style={s.totalsWrap}>
              <View style={s.rctTotalRow}>
                <Text style={s.rctTotalLabel}>Subtotal</Text>
                <Text style={s.rctTotalVal}>{fmt(subtotal)}</Text>
              </View>
              {discount > 0 && (
                <View style={s.rctTotalRow}>
                  <Text style={[s.rctTotalLabel, { color: '#10b981' }]}>Discount</Text>
                  <Text style={[s.rctTotalVal, { color: '#10b981' }]}>-{fmt(discount)}</Text>
                </View>
              )}
              {settings.show_tax_breakdown && tax > 0 && (
                <View style={s.rctTotalRow}>
                  <Text style={s.rctTotalLabel}>Tax{taxRate ? ` (${taxRate}%)` : ''}</Text>
                  <Text style={s.rctTotalVal}>{fmt(tax)}</Text>
                </View>
              )}
              <View style={s.rctGrandRow}>
                <Text style={s.rctGrandLabel}>{isRefund ? 'Refunded' : 'Total'}</Text>
                <Text style={[s.rctGrandVal, isRefund ? { color: C.red } : {}]}>{fmt(total)}</Text>
              </View>
            </View>
          ) : (
            <View style={s.totalsWrap}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Subtotal</Text>
                <Text style={s.totalVal}>{fmt(subtotal)}</Text>
              </View>
              {discount > 0 && (
                <View style={s.totalRow}>
                  <Text style={[s.totalLabel, { color: '#10b981' }]}>Discount</Text>
                  <Text style={[s.totalVal, { color: '#10b981' }]}>-{fmt(discount)}</Text>
                </View>
              )}
              {settings.show_tax_breakdown && tax > 0 && (
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
          )}

          {/* ── Credit (on-account) breakdown ── */}
          {isCreditSale && (
            <View style={{ marginTop: 12, backgroundColor: '#faf5ff', borderRadius: 6, borderWidth: 1, borderColor: '#e9d5ff', padding: 10 }}>
              <Text style={{ fontSize: 7, color: '#7c3aed', textTransform: 'uppercase', marginBottom: 6, fontFamily: bold }}>Credit Payment Details</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 9, color: C.mid }}>Sale Total</Text>
                <Text style={{ fontSize: 9, color: tc, fontFamily: bold }}>{fmt(total)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 9, color: C.mid }}>
                  {depositPaid > 0 ? `Deposit Paid${paymentSplits?.[0]?.method ? ` (${PAYMENT_LABELS[paymentSplits[0].method] ?? paymentSplits[0].method})` : ''}` : 'Deposit Paid'}
                </Text>
                <Text style={{ fontSize: 9, color: depositPaid > 0 ? C.green : C.mid, fontFamily: bold }}>{fmt(depositPaid)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 5, borderTopWidth: 0.5, borderTopColor: '#e9d5ff' }}>
                <Text style={{ fontSize: 10, color: '#7c3aed', fontFamily: bold }}>Outstanding Balance</Text>
                <Text style={{ fontSize: 10, color: outstanding > 0 ? C.orange : C.green, fontFamily: bold }}>{fmt(outstanding)}</Text>
              </View>
              {outstanding > 0 && (
                <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 5, textAlign: 'center' }}>
                  Balance to be settled on next visit
                </Text>
              )}
            </View>
          )}

          {/* ── Payment splits breakdown ── */}
          {settings.show_payment_method && paymentMethod === 'split' && paymentSplits && paymentSplits.length > 0 && (
            <View style={{ marginTop: 12, backgroundColor: '#f0fdfa', borderRadius: 6, padding: 10 }}>
              <Text style={{ fontSize: 7, color: pc, textTransform: 'uppercase', marginBottom: 5, fontFamily: bold }}>Payment Breakdown</Text>
              {paymentSplits.map((sp, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={{ fontSize: 9, color: C.mid }}>{PAYMENT_LABELS[sp.method] ?? sp.method}</Text>
                  <Text style={{ fontSize: 9, color: tc, fontFamily: bold }}>{fmt(sp.amount)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Notes ── */}
          {notes && (
            <View style={{ marginTop: 14, padding: 10, backgroundColor: '#f9fafb', borderRadius: 6 }}>
              <Text style={{ fontSize: 7, color: C.faint, textTransform: 'uppercase', marginBottom: 4 }}>Notes</Text>
              <Text style={{ fontSize: 9, color: C.mid }}>{notes}</Text>
            </View>
          )}

          {/* ── Footer ── */}
          <View style={s.footer}>
            {settings.thank_you_message && (
              <Text style={s.footerMain}>
                {isRefund ? 'Your refund has been processed.' : settings.thank_you_message}
              </Text>
            )}
            {uniqueFooterLines.map((line, i) => (
              <Text key={i} style={s.footerSub}>{line}</Text>
            ))}

            {settings.social_links && Object.entries(settings.social_links).filter(([_, v]) => v).length > 0 && (
              <View style={{ flexDirection: 'column', alignItems: 'center', marginTop: 5, gap: 2 }}>
                {Object.entries(settings.social_links).filter(([_, v]) => v).map(([k, v]) => (
                  <Text key={k} style={{ fontSize: 7, color: C.faint, textAlign: 'center' }}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}: {String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </Text>
                ))}
              </View>
            )}

            {settings.policy_text && (
              <Text style={{ fontSize: 6.5, color: C.faint, textAlign: 'center', marginTop: 10, borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 8 }}>
                {settings.policy_text}
              </Text>
            )}

            {!isReceipt && (
              <Text style={s.footerBrand}>
                Receipt generated by RepairPOS · {date}
              </Text>
            )}
          </View>

        </View>
      </Page>
    </Document>
  )
}

