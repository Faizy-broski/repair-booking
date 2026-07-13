import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { InvoiceSettings } from '@/types/invoice-settings'
import { DEFAULT_INVOICE_SETTINGS } from '@/types/invoice-settings'
import { formatCurrency } from '@/lib/utils'

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
}

interface Payment {
  amount: number
  method: string
  created_at: string
}

interface PayablePO {
  id: string
  po_number: string
  total: number
  amount_paid: number
  created_at: string
  payments: Payment[]
}

interface Props {
  supplierName: string
  from: string | null
  to: string | null
  purchaseOrders: PayablePO[]
  businessName: string
  businessPhone: string | null
  businessEmail: string | null
  logoUrl: string | null
  currency?: string
  settings?: InvoiceSettings
  documentTitle?: string
  footerNote?: string
}

export function SupplierStatementPdf({
  supplierName, from, to, purchaseOrders,
  businessName, businessPhone, businessEmail, logoUrl,
  currency,
  settings = DEFAULT_INVOICE_SETTINGS,
  documentTitle = 'Supplier Statement',
  footerNote = 'Statement covers received purchase orders for the selected period only.',
}: Props) {
  const totalOutstanding = purchaseOrders.reduce((sum, p) => sum + (Number(p.total) - Number(p.amount_paid)), 0)

  const s = StyleSheet.create({
    page: { padding: 32, fontFamily: 'Helvetica', fontSize: 9, color: C.dark },
    headerBand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, borderBottom: `1pt solid ${C.border}`, paddingBottom: 14 },
    logoImage: { width: 44, height: 44, objectFit: 'contain', marginBottom: 4 },
    businessName: { fontSize: 14, fontWeight: 700, color: C.dark },
    businessSub: { fontSize: 8, color: C.muted, marginTop: 2 },
    title: { fontSize: 16, fontWeight: 700, color: C.brand },
    titleSub: { fontSize: 8, color: C.muted, marginTop: 3 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    metaLabel: { fontSize: 7, color: C.faint, textTransform: 'uppercase' },
    metaValue: { fontSize: 10, fontWeight: 700, marginTop: 2 },
    poCard: { marginBottom: 12, borderRadius: 4, border: `1pt solid ${C.border}` },
    poHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.bg, paddingVertical: 6, paddingHorizontal: 8 },
    poHeaderText: { fontSize: 9, fontWeight: 700 },
    paymentsWrap: { paddingHorizontal: 8, paddingVertical: 4 },
    paymentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: `0.5pt solid ${C.border}` },
    paymentDate: { fontSize: 8, color: C.muted, width: '35%' },
    paymentMethod: { fontSize: 8, color: C.muted, width: '30%', textTransform: 'capitalize' },
    paymentAmount: { fontSize: 8, fontWeight: 700, color: C.green, width: '35%', textAlign: 'right' },
    noPayments: { fontSize: 8, color: C.faint, fontStyle: 'italic', paddingVertical: 4 },
    summaryBox: { marginTop: 8, padding: 10, backgroundColor: C.bg, borderRadius: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { fontSize: 10, fontWeight: 700 },
    summaryValue: { fontSize: 14, fontWeight: 700, color: totalOutstanding > 0 ? C.red : C.green },
    footer: { position: 'absolute', bottom: 24, left: 32, right: 32, fontSize: 7, color: C.faint, textAlign: 'center' },
  })

  const rangeLabel = from || to
    ? `${from ? new Date(from).toLocaleDateString('en-GB') : 'Start'} – ${to ? new Date(to).toLocaleDateString('en-GB') : 'Now'}`
    : 'All time'

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerBand}>
          <View>
            {settings.show_logo && logoUrl ? <Image src={logoUrl} style={s.logoImage} /> : null}
            {settings.show_business_name && <Text style={s.businessName}>{businessName}</Text>}
            {settings.show_phone && businessPhone && <Text style={s.businessSub}>{businessPhone}</Text>}
            {settings.show_email && businessEmail && <Text style={s.businessSub}>{businessEmail}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.title}>{documentTitle}</Text>
            <Text style={s.titleSub}>Generated {new Date().toLocaleDateString('en-GB')}</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          <View>
            <Text style={s.metaLabel}>Supplier</Text>
            <Text style={s.metaValue}>{supplierName}</Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Period</Text>
            <Text style={s.metaValue}>{rangeLabel}</Text>
          </View>
        </View>

        {purchaseOrders.map((po) => {
          const outstanding = Number(po.total) - Number(po.amount_paid)
          return (
            <View key={po.id} style={s.poCard} wrap={false}>
              <View style={s.poHeader}>
                <Text style={s.poHeaderText}>
                  {po.po_number} · {new Date(po.created_at).toLocaleDateString('en-GB')}
                </Text>
                <Text style={s.poHeaderText}>
                  {formatCurrency(Number(po.total), currency)} total · {formatCurrency(outstanding, currency)} outstanding
                </Text>
              </View>
              <View style={s.paymentsWrap}>
                {po.payments.length === 0 ? (
                  <Text style={s.noPayments}>No payments recorded yet</Text>
                ) : (
                  po.payments.map((p, i) => (
                    <View key={i} style={s.paymentRow}>
                      <Text style={s.paymentDate}>{new Date(p.created_at).toLocaleDateString('en-GB')}</Text>
                      <Text style={s.paymentMethod}>{p.method}</Text>
                      <Text style={s.paymentAmount}>+{formatCurrency(Number(p.amount), currency)}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          )
        })}

        {purchaseOrders.length === 0 && (
          <Text style={s.noPayments}>No received purchase orders found for this period.</Text>
        )}

        <View style={s.summaryBox}>
          <Text style={s.summaryLabel}>Total Outstanding</Text>
          <Text style={s.summaryValue}>{formatCurrency(totalOutstanding, currency)}</Text>
        </View>

        <Text style={s.footer} fixed>
          {businessName} · {footerNote}
        </Text>
      </Page>
    </Document>
  )
}
