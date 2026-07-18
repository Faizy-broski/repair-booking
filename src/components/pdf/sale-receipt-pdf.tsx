import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Image, Svg, Path, Circle, Rect, Line
} from '@react-pdf/renderer'
import type { InvoiceSettings, SocialLinks } from '@/types/invoice-settings'
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

const PDFSocialIcons: Record<string, React.FC<{ color: string }>> = {
  website: ({ color }) => (
    <Svg viewBox="0 0 24 24" width={10} height={10}>
      <Circle cx={12} cy={12} r={10} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M2 12h20" fill="none" stroke={color} strokeWidth={2} />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  ),
  facebook: ({ color }) => (
    <Svg viewBox="0 0 24 24" width={10} height={10}>
      <Path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  ),
  instagram: ({ color }) => (
    <Svg viewBox="0 0 24 24" width={10} height={10}>
      <Rect x={2} y={2} width={20} height={20} rx={5} ry={5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="none" stroke={color} strokeWidth={2} />
      <Line x1={17.5} y1={6.5} x2={17.51} y2={6.5} stroke={color} strokeWidth={2} />
    </Svg>
  ),
  twitter: ({ color }) => (
    <Svg viewBox="0 0 24 24" width={10} height={10}>
      <Path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  ),
  whatsapp: ({ color }) => (
    <Svg viewBox="0 0 24 24" width={10} height={10}>
      <Path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.36a9.85 9.85 0 0 0 4.62 1.17h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.64-1.03-5.13-2.9-7C17.17 3.03 14.68 2 12.04 2zm5.86 14.11c-.25.7-1.45 1.34-2 1.43-.5.08-1.14.11-1.84-.12-.42-.14-.96-.31-1.65-.61-2.9-1.26-4.8-4.17-4.94-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.77-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.72.81 2.02.96.3.15.5.22.57.35.07.13.07.75-.18 1.45z" fill={color} />
    </Svg>
  ),
  tiktok: ({ color }) => (
    <Svg viewBox="0 0 24 24" width={10} height={10}>
      <Path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" fill={color} />
    </Svg>
  ),
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
  original_unit_price?: number | null
}

// A discount-allocation line freezes its regular selling price onto
// original_unit_price (migration 139) — when present and higher than the
// price actually charged, show that as the UNIT price and the difference as
// the discount, instead of the raw unit_price/discount fields (which for
// these lines hold the already-discounted price and an unrelated manual
// per-line discount amount, usually 0).
function priceParts(item: SaleItem) {
  const disc = item.discount ?? 0
  const hasOriginal = item.original_unit_price != null && item.original_unit_price > item.unit_price
  return {
    unitDisplay: hasOriginal ? item.original_unit_price! : item.unit_price,
    // Additive — a line can have both a frozen sale-price discount AND a
    // manual per-line discount typed on top of it; dropping either one
    // silently understates DISC and (via lineAmt) makes line totals not sum
    // to the receipt's printed Total.
    discDisplay: hasOriginal ? (item.original_unit_price! - item.unit_price + disc) : disc,
  }
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
  depositLabelAmount?: number
  isRefund?: boolean
  refundReason?: string | null
  paymentSplits?: { method: string; amount: number }[] | null
  notes?: string | null
  // Branch info
  businessName?: string | null
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
  ebay: 'eBay', deliveroo: 'Deliveroo', website: 'Website',
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
  items, subtotal, discount, tax, total, amountPaid, depositLabelAmount,
  isRefund, refundReason, paymentSplits, notes,
  businessName, branchName, branchAddress, branchPhone, branchEmail, logoUrl,
  currency = 'GBP', taxRate, isRushJob, isExchange,
  exchangeReturnedItems = [], exchangeReturnedTotal = 0,
  settings = DEFAULT_INVOICE_SETTINGS,
}: SaleReceiptPdfProps) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const fmtNum = (n: number) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n)
  const statusColor = STATUS_COLORS[paymentStatus] ?? C.muted
  const isCreditSale = paymentMethod === 'on_account'
  const depositPaid = amountPaid ?? 0
  const outstanding = Math.max(0, total - depositPaid)
  const displayDepositAmount = depositLabelAmount ?? depositPaid

  const isReceipt = settings.paper_size?.startsWith('Receipt')
  const family = settings.font_family || 'Helvetica'
  const bold = boldFont(family)
  const pc = settings.primary_color || C.brand
  const tc = settings.text_color || C.dark

  const paperSizeKey = settings.paper_size in PAPER_SIZES ? settings.paper_size : 'A4'
  const pageWidth = isReceipt ? (settings.paper_size === 'Receipt58' ? 165 : 227) : null

  const uniqueFooterLines = [settings.footer_line_1, settings.footer_line_2, settings.footer_line_3]
    .filter((l): l is string => !!l && l !== settings.thank_you_message)

  let displayBranchName = branchName
  if (displayBranchName && displayBranchName.includes('-')) {
    displayBranchName = displayBranchName.split('-').pop()?.trim() || displayBranchName
  }
  if (displayBranchName && displayBranchName.toLowerCase() === 'main') {
    displayBranchName = 'Main Branch'
  }

  const bnParts = (businessName || '').split('|')
  const mainBn = bnParts[0]?.trim() || businessName
  const tagline = bnParts.length > 1 ? bnParts[1]?.trim() : null

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

          {/* Business name / branch name / address */}
          {settings.show_business_name && <Text style={s.brandName}>{mainBn ?? displayBranchName ?? 'Business Name'}</Text>}
          {settings.show_business_name && tagline && <Text style={[s.brandSub, { fontFamily: bold, fontSize: isReceipt ? 9.5 : 11, marginTop: 1, marginBottom: 2 }]}>{tagline}</Text>}
          {settings.show_branch_name && displayBranchName && <Text style={[s.brandSub, { fontSize: isReceipt ? 9 : 10 }]}>{displayBranchName}</Text>}
          {settings.show_address && branchAddress && <Text style={s.brandSub}>{branchAddress}</Text>}
          <View style={{ flexDirection: isReceipt ? 'column' : 'row', alignItems: isReceipt ? 'center' : 'flex-start', marginTop: 2 }}>
            {settings.show_phone && branchPhone && <Text style={s.brandSub}>{branchPhone}</Text>}
            {settings.show_phone && settings.show_email && branchPhone && branchEmail && !isReceipt && <Text style={[s.brandSub, { marginHorizontal: 6 }]}>·</Text>}
            {settings.show_email && branchEmail && <Text style={s.brandSub}>{branchEmail}</Text>}
          </View>

          {/* Receipt type label */}
          <Text style={s.receiptLabel}>{isExchange ? 'Exchange Receipt' : isRefund ? 'Refund Receipt' : 'Sale Receipt'}</Text>
          <Text style={s.receiptTitle}>{isExchange ? 'EXCHANGE' : isRefund ? 'Refund' : 'ORDER RECEIPT'}</Text>
          <View style={{ marginTop: 6, alignItems: isReceipt ? 'center' : 'flex-start' }}>
            <Text style={{ fontSize: isReceipt ? 7.5 : 8, color: '#ffffffdd', marginBottom: 2 }}>
              Invoice #: {saleId.slice(-8).toUpperCase()}
            </Text>
            {date.includes(',') ? (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: isReceipt ? 7.5 : 8, color: '#ffffffdd', marginRight: 6 }}>
                  Date: {date.split(',')[0].trim()}
                </Text>
                <Text style={{ fontSize: isReceipt ? 7.5 : 8, color: '#ffffffdd' }}>
                  Time: {date.split(',')[1].trim()}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: isReceipt ? 7.5 : 8, color: '#ffffffdd' }}>
                Date: {date}
              </Text>
            )}
          </View>
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
                    ? paymentSplits.map(sp => PAYMENT_LABELS[sp.method] ?? sp.method).join(' + ')
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
                  {isReceipt ? (
                    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e0e7ff', marginBottom: 4, paddingBottom: 3, marginTop: 4 }}>
                      <Text style={[s.thText, { flex: 2.2, color: C.red }]}>RET ITEM</Text>
                      <Text style={[s.thText, { flex: 0.8, textAlign: 'center', color: C.red }]}>QTY</Text>
                      <Text style={[s.thText, { flex: 1.5, textAlign: 'right', color: C.red }]}>UNIT</Text>
                      <Text style={[s.thText, { flex: 2.2, textAlign: 'right', color: C.red }]}>CREDIT</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e0e7ff', marginBottom: 4, paddingBottom: 3, marginTop: 4 }}>
                      <Text style={[s.thText, { color: C.red }]}>Returned Items</Text>
                      <Text style={[s.thText, { textAlign: 'right', color: C.red }]}>Credit</Text>
                    </View>
                  )}
                  {exchangeReturnedItems.map((item, i) => (
                    isReceipt ? (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
                        <Text style={{ fontSize: 7.5, color: tc, flex: 2.2, paddingRight: 2 }}>{item.name}</Text>
                        <Text style={{ fontSize: 7.5, color: tc, flex: 0.8, textAlign: 'center' }}>{item.quantity}</Text>
                        <Text style={{ fontSize: 7.5, color: tc, flex: 1.5, textAlign: 'right' }}>{fmt(Number(item.unit_price))}</Text>
                        <Text style={{ fontSize: 7.5, color: C.red, flex: 2.2, textAlign: 'right', fontFamily: bold }}>-{fmt(Number(item.total))}</Text>
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
              {isReceipt ? (
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e0e7ff', marginBottom: 4, paddingBottom: 3 }}>
                  <Text style={[s.thText, { flex: 2.0, color: '#4f46e5' }]}>ITEM</Text>
                  <Text style={[s.thText, { flex: 0.8, textAlign: 'center', color: '#4f46e5' }]}>QTY</Text>
                  <Text style={[s.thText, { flex: 2.0, textAlign: 'right', color: '#4f46e5' }]}>UNIT PRICE</Text>
                  <Text style={[s.thText, { flex: 1.2, textAlign: 'right', color: '#4f46e5' }]}>DISC</Text>
                  <Text style={[s.thText, { flex: 1.5, textAlign: 'right', color: '#4f46e5' }]}>AMT</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e0e7ff', marginBottom: 4, paddingBottom: 3 }}>
                  <Text style={[s.thText, { color: '#4f46e5' }]}>New Items</Text>
                  <Text style={[s.thText, { textAlign: 'right', color: '#4f46e5' }]}>Total</Text>
                </View>
              )}
              {isReceipt ? (
                items.map((item, i) => {
                  const { unitDisplay, discDisplay } = priceParts(item)
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
                      <Text style={{ fontSize: 7.5, color: tc, flex: 2.0, paddingRight: 2 }}>{item.name}</Text>
                      <Text style={{ fontSize: 7.5, color: tc, flex: 0.8, textAlign: 'center' }}>{item.quantity}</Text>
                      <Text style={{ fontSize: 7.5, color: tc, flex: 2.0, textAlign: 'right' }}>{fmtNum(unitDisplay)}</Text>
                      <Text style={{ fontSize: 7.5, color: discDisplay > 0 ? C.green : tc, flex: 1.2, textAlign: 'right' }}>{discDisplay > 0 ? `-${fmtNum(discDisplay)}` : '0'}</Text>
                      <Text style={{ fontSize: 7.5, color: tc, flex: 1.5, textAlign: 'right', fontFamily: bold }}>{fmtNum(Number(item.total))}</Text>
                    </View>
                  )
                })
              ) : (
                <>
                  <View style={s.tableHead}>
                    <Text style={[s.thText, { flex: 4 }]}>Item</Text>
                    <Text style={[s.thText, { flex: 1, textAlign: 'center' }]}>Qty</Text>
                    <Text style={[s.thText, { flex: 1.4, textAlign: 'right' }]}>Price</Text>
                    <Text style={[s.thText, { flex: 1.4, textAlign: 'right' }]}>Disc.</Text>
                    <Text style={[s.thText, { flex: 1.6, textAlign: 'right' }]}>Total</Text>
                  </View>
                  {items.map((item, i) => {
                    const { unitDisplay, discDisplay } = priceParts(item)
                    return (
                      <View key={i} style={s.tableRow}>
                        <Text style={[s.tdText, { flex: 4 }]}>{item.name}</Text>
                        <Text style={[s.tdText, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
                        <Text style={[s.tdText, { flex: 1.4, textAlign: 'right' }]}>{fmt(unitDisplay)}</Text>
                        <Text style={[s.tdText, { flex: 1.4, textAlign: 'right', color: discDisplay > 0 ? '#10b981' : C.mid }]}>
                          {discDisplay > 0 ? `-${fmt(discDisplay)}` : '—'}
                        </Text>
                        <Text style={[s.tdText, { flex: 1.6, textAlign: 'right', fontFamily: bold }]}>{fmt(Number(item.total))}</Text>
                      </View>
                    )
                  })}
                </>
              )}
            </>
          ) : isReceipt ? (
            <>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: C.border, marginBottom: 4, paddingBottom: 4 }}>
                <Text style={[s.thText, { flex: 2.0 }]}>ITEM</Text>
                <Text style={[s.thText, { flex: 0.8, textAlign: 'center' }]}>QTY</Text>
                <Text style={[s.thText, { flex: 2.0, textAlign: 'right' }]}>UNIT PRICE</Text>
                <Text style={[s.thText, { flex: 1.2, textAlign: 'right' }]}>DISC</Text>
                <Text style={[s.thText, { flex: 1.5, textAlign: 'right' }]}>AMT</Text>
              </View>
              {items.map((item, i) => {
                const { unitDisplay, discDisplay } = priceParts(item)
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
                    <Text style={{ fontSize: 7.5, color: tc, flex: 2.0, paddingRight: 2 }}>{item.name}</Text>
                    <Text style={{ fontSize: 7.5, color: tc, flex: 0.8, textAlign: 'center' }}>{item.quantity}</Text>
                    <Text style={{ fontSize: 7.5, color: tc, flex: 2.0, textAlign: 'right' }}>{fmtNum(unitDisplay)}</Text>
                    <Text style={{ fontSize: 7.5, color: discDisplay > 0 ? C.green : tc, flex: 1.2, textAlign: 'right' }}>{discDisplay > 0 ? `-${fmtNum(discDisplay)}` : '0'}</Text>
                    <Text style={{ fontSize: 7.5, color: tc, flex: 1.5, textAlign: 'right', fontFamily: bold }}>{fmtNum(Number(item.total))}</Text>
                  </View>
                )
              })}
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
              {items.map((item, i) => {
                const { unitDisplay, discDisplay } = priceParts(item)
                return (
                  <View key={i} style={s.tableRow}>
                    <Text style={[s.tdText, { flex: 4 }]}>{item.name}</Text>
                    <Text style={[s.tdText, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
                    <Text style={[s.tdText, { flex: 1.4, textAlign: 'right' }]}>{fmt(unitDisplay)}</Text>
                    <Text style={[s.tdText, { color: discDisplay > 0 ? '#10b981' : C.mid, flex: 1.4, textAlign: 'right' }]}>
                      {discDisplay > 0 ? `-${fmt(discDisplay)}` : '—'}
                    </Text>
                    <Text style={[s.tdText, { flex: 1.6, textAlign: 'right', fontFamily: bold }]}>
                      {fmt(Number(item.total))}
                    </Text>
                  </View>
                )
              })}
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
                  <Text style={s.rctTotalLabel}>Discount</Text>
                  <Text style={s.rctTotalVal}>-{fmt(discount)}</Text>
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
                  <Text style={s.totalLabel}>Discount</Text>
                  <Text style={s.totalVal}>-{fmt(discount)}</Text>
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
                  {displayDepositAmount > 0 ? `Deposit Paid${paymentSplits?.[0]?.method ? ` (${PAYMENT_LABELS[paymentSplits[0].method] ?? paymentSplits[0].method})` : ''}` : 'Deposit Paid'}
                </Text>
                <Text style={{ fontSize: 9, color: tc, fontFamily: bold }}>{fmt(displayDepositAmount)}</Text>
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
            {settings.footer_address && <Text style={s.footerSub}>{settings.footer_address}</Text>}
            {uniqueFooterLines.map((line, i) => (
              <Text key={i} style={s.footerSub}>{line}</Text>
            ))}

            {settings.social_links && Object.entries(settings.social_links).filter(([_, v]) => v).length > 0 && (
              <>
                <View style={{ width: '100%', height: 1, backgroundColor: C.border, marginVertical: 8 }} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 300 }}>
                  {Object.entries(settings.social_links).filter(([_, v]) => v).map(([k, v]) => {
                    const IconComponent = PDFSocialIcons[k]
                    return (
                      <View key={k} style={{ width: '50%', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1 }}>
                          {IconComponent && <View style={{ marginRight: 4, marginTop: 1 }}><IconComponent color={C.mid} /></View>}
                          <Text style={{ fontSize: 7.5, color: C.mid, fontFamily: bold }}>
                            {k.charAt(0).toUpperCase() + k.slice(1)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 7, color: tc }}>
                          {String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </>
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

