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
  red: '#ef4444',
  green: '#16a34a',
  orange: '#f97316',
}

const PAPER_SIZES: Record<string, any> = {
  A4: 'A4',
  A5: 'A5',
  Letter: 'LETTER',
  // Heights for thermal receipts are computed dynamically — see calcSupplierReceiptPageHeight()
  Receipt80: [227, 841],
  Receipt58: [165, 841],
}

function calcSupplierReceiptPageHeight(opts: {
  showLogo: boolean
  showBusinessName: boolean
  showAddress: boolean
  showPhone: boolean
  showEmail: boolean
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

  // Meta grid: supplier + PO date row, payment date row
  h += 3 * 22

  // Payment details box
  h += 120

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

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SupplierReceiptPdfProps {
  poNumber: string
  poDate: string
  supplierName: string
  paymentDate: string
  paymentMethod: string
  paymentAmount: number
  poTotal: number
  cumulativePaid: number
  // Branch/business info
  branchName?: string | null
  branchAddress?: string | null
  branchPhone?: string | null
  branchEmail?: string | null
  logoUrl?: string | null
  currency?: string
  settings?: InvoiceSettings
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', bank_transfer: 'Bank Transfer', cheque: 'Cheque', other: 'Other',
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SupplierReceiptPdf({
  poNumber, poDate, supplierName, paymentDate, paymentMethod, paymentAmount,
  poTotal, cumulativePaid,
  branchName, branchAddress, branchPhone, branchEmail, logoUrl,
  currency = 'GBP',
  settings = DEFAULT_INVOICE_SETTINGS,
}: SupplierReceiptPdfProps) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const outstanding = Math.max(0, poTotal - cumulativePaid)

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
      calcSupplierReceiptPageHeight({
        showLogo: !!(settings.show_logo && (settings.logo_url || logoUrl)),
        showBusinessName: settings.show_business_name !== false,
        showAddress: !!(settings.show_address && branchAddress),
        showPhone: !!(settings.show_phone && branchPhone),
        showEmail: !!(settings.show_email && branchEmail),
        hasThankYou: !!settings.thank_you_message,
        footerLines: uniqueFooterLines,
        socialLinkCount: settings.social_links ? Object.values(settings.social_links).filter(Boolean).length : 0,
        policyText: settings.policy_text,
        pageWidth,
      }),
    ]
    : PAPER_SIZES[paperSizeKey]

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
      marginBottom: 6,
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
          <Text style={s.receiptLabel}>Supplier Payment Receipt</Text>
          <Text style={s.receiptTitle}>PAYMENT RECEIPT</Text>
          <Text style={s.receiptId}>
            {poNumber}  ·  {paymentDate}
          </Text>
        </View>

        {/* ── Body ── */}
        <View style={s.body}>

          {/* Meta grid: Supplier | PO Date, then Payment Date */}
          <View style={s.metaGrid}>
            <View style={s.metaRow}>
              <View style={s.metaCell}>
                <Text style={s.metaLabel}>Supplier</Text>
                <Text style={s.metaValue}>{supplierName}</Text>
              </View>
              <View style={s.metaCell}>
                <Text style={s.metaLabel}>PO Date</Text>
                <Text style={s.metaValue}>{poDate}</Text>
              </View>
            </View>
            <View style={[s.metaRow, { marginBottom: 0 }]}>
              <View style={s.metaCell}>
                <Text style={s.metaLabel}>Payment Date</Text>
                <Text style={s.metaValue}>{paymentDate}</Text>
              </View>
            </View>
          </View>

          {/* ── Payment details ── */}
          <View style={{ backgroundColor: '#faf5ff', borderRadius: 6, borderWidth: 1, borderColor: '#e9d5ff', padding: 10 }}>
            <Text style={{ fontSize: 7, color: '#7c3aed', textTransform: 'uppercase', marginBottom: 6, fontFamily: bold }}>Payment Details</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: C.mid }}>PO Total</Text>
              <Text style={{ fontSize: 9, color: tc, fontFamily: bold }}>{fmt(poTotal)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: C.mid }}>
                Payment ({PAYMENT_LABELS[paymentMethod] ?? paymentMethod})
              </Text>
              <Text style={{ fontSize: 9, color: C.green, fontFamily: bold }}>{fmt(paymentAmount)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 5, borderTopWidth: 0.5, borderTopColor: '#e9d5ff' }}>
              <Text style={{ fontSize: 10, color: '#7c3aed', fontFamily: bold }}>Outstanding Balance</Text>
              <Text style={{ fontSize: 10, color: outstanding > 0 ? C.orange : C.green, fontFamily: bold }}>{fmt(outstanding)}</Text>
            </View>
          </View>

          {/* ── Footer ── */}
          <View style={s.footer}>
            {settings.thank_you_message && (
              <Text style={s.footerMain}>{settings.thank_you_message}</Text>
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
                Receipt generated by RepairPOS · {paymentDate}
              </Text>
            )}
          </View>

        </View>
      </Page>
    </Document>
  )
}
