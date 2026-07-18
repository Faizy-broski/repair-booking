import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { InvoiceSettings } from '@/types/invoice-settings'
import { DEFAULT_INVOICE_SETTINGS } from '@/types/invoice-settings'
import { formatCurrency } from '@/lib/utils'

const C = {
  brand:  '#0d9488',
  dark:   '#111827',
  mid:    '#374151',
  muted:  '#6b7280',
  faint:  '#9ca3af',
  border: '#e5e7eb',
  bg:     '#f9fafb',
  alt:    '#f3f4f6',
  head:   '#1f2937',
  red:    '#ef4444',
  green:  '#16a34a',
  white:  '#ffffff',
}

interface Payment {
  amount: number
  method: string
  created_at: string
  is_backfilled: boolean
}

interface CreditSale {
  id: string
  sale_number: string | null
  total: number
  amount_paid: number
  created_at: string
  payments: Payment[]
}

interface Props {
  customerName: string
  from: string | null
  to: string | null
  sales: CreditSale[]
  businessName: string
  businessPhone: string | null
  businessEmail: string | null
  logoUrl: string | null
  currency?: string
  settings?: InvoiceSettings
}

export function CustomerStatementPdf({
  customerName, from, to, sales,
  businessName, businessPhone, businessEmail, logoUrl,
  currency,
  settings = DEFAULT_INVOICE_SETTINGS,
}: Props) {
  const totalOutstanding = sales.reduce(
    (sum, s) => sum + (Number(s.total) - Number(s.amount_paid)), 0
  )
  const totalPaid = sales.reduce((sum, s) => sum + Number(s.amount_paid), 0)
  const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0)

  const st = StyleSheet.create({
    page:         { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: C.dark, backgroundColor: C.white },

    // Header
    headerBand:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingBottom: 14, borderBottom: `1.5pt solid ${C.brand}` },
    logo:         { width: 48, height: 48, objectFit: 'contain', marginBottom: 4 },
    bizName:      { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.dark },
    bizSub:       { fontSize: 8, color: C.muted, marginTop: 2 },
    title:        { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.brand },
    titleSub:     { fontSize: 8, color: C.muted, marginTop: 3, textAlign: 'right' },

    // Meta bar
    metaBar:      { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 4, padding: 10, marginBottom: 18, justifyContent: 'space-between' },
    metaCell:     { flex: 1 },
    metaLabel:    { fontSize: 7, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5 },
    metaValue:    { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 3 },

    // Sale block
    saleBlock:    { marginBottom: 14 },
    saleTitle:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.head, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 3 },
    saleTitleL:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white },
    saleTitleR:   { fontSize: 8, color: '#d1d5db' },

    // Table
    tableHead:    { flexDirection: 'row', backgroundColor: C.bg, paddingVertical: 4, paddingHorizontal: 8, borderBottom: `0.5pt solid ${C.border}` },
    tableRow:     { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottom: `0.5pt solid ${C.border}` },
    tableRowAlt:  { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottom: `0.5pt solid ${C.border}`, backgroundColor: C.alt },
    colDate:      { width: '22%', fontSize: 8 },
    colMethod:    { width: '18%', fontSize: 8, textTransform: 'capitalize' },
    colPaid:      { width: '20%', fontSize: 8, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: C.green },
    colBalance:   { width: '20%', fontSize: 8, textAlign: 'right' },
    colHead:      { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
    noPayments:   { fontSize: 8, color: C.faint, fontStyle: 'italic', padding: 8, paddingLeft: 10 },

    // Sale footer row (totals per sale)
    saleFooter:   { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: C.bg },
    saleFooterT:  { fontSize: 8, color: C.muted },
    saleFooterV:  { fontSize: 8, fontFamily: 'Helvetica-Bold', marginLeft: 6 },
    outstanding:  { color: C.red },
    cleared:      { color: C.green },

    // Grand total
    grandBox:     { marginTop: 12, flexDirection: 'row', backgroundColor: C.head, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 12 },
    grandCell:    { flex: 1, alignItems: 'center' },
    grandLabel:   { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
    grandValue:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.white, marginTop: 3 },
    grandOutVal:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#fca5a5', marginTop: 3 },

    footer:       { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 7, color: C.faint, textAlign: 'center', borderTop: `0.5pt solid ${C.border}`, paddingTop: 6 },
  })

  const fmt = (n: number) => formatCurrency(n, currency)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB')
  const rangeLabel = from || to
    ? `${from ? fmtDate(from) : 'Start'} – ${to ? fmtDate(to) : 'Now'}`
    : 'All time'

  return (
    <Document>
      <Page size="A4" style={st.page}>

        {/* Header */}
        <View style={st.headerBand}>
          <View>
            {settings.show_logo && logoUrl ? <Image src={logoUrl} style={st.logo} /> : null}
            {settings.show_business_name && <Text style={st.bizName}>{businessName}</Text>}
            {settings.show_phone && businessPhone && <Text style={st.bizSub}>{businessPhone}</Text>}
            {settings.show_email && businessEmail && <Text style={st.bizSub}>{businessEmail}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={st.title}>Customer Statement</Text>
            <Text style={st.titleSub}>Generated {fmtDate(new Date().toISOString())}</Text>
          </View>
        </View>

        {/* Meta bar */}
        <View style={st.metaBar}>
          <View style={st.metaCell}>
            <Text style={st.metaLabel}>Customer</Text>
            <Text style={st.metaValue}>{customerName}</Text>
          </View>
          <View style={st.metaCell}>
            <Text style={st.metaLabel}>Period</Text>
            <Text style={st.metaValue}>{rangeLabel}</Text>
          </View>
          <View style={st.metaCell}>
            <Text style={st.metaLabel}>Total Sales</Text>
            <Text style={st.metaValue}>{sales.length}</Text>
          </View>
          <View style={[st.metaCell, { alignItems: 'flex-end' }]}>
            <Text style={st.metaLabel}>Outstanding</Text>
            <Text style={[st.metaValue, { color: totalOutstanding > 0 ? C.red : C.green }]}>{fmt(totalOutstanding)}</Text>
          </View>
        </View>

        {/* Sales table */}
        {sales.length === 0 ? (
          <Text style={st.noPayments}>No on-account sales found for this period.</Text>
        ) : (
          sales.map((sale) => {
            const outstanding = Number(sale.total) - Number(sale.amount_paid)
            const isPaid = outstanding <= 0.01
            let runningBalance = Number(sale.total)

            return (
              <View key={sale.id} style={st.saleBlock} wrap={false}>
                {/* Sale title row */}
                <View style={st.saleTitle}>
                  <Text style={st.saleTitleL}>
                    #{sale.sale_number ?? sale.id.slice(-8).toUpperCase()}
                    {'  ·  '}
                    {fmtDate(sale.created_at)}
                  </Text>
                  <Text style={st.saleTitleR}>
                    Total: {fmt(Number(sale.total))}{'  |  '}Paid: {fmt(Number(sale.amount_paid))}{'  |  '}
                    Outstanding: {fmt(outstanding)}
                  </Text>
                </View>

                {/* Column headers */}
                <View style={st.tableHead}>
                  <Text style={[st.colDate,    st.colHead]}>Date</Text>
                  <Text style={[st.colMethod,  st.colHead]}>Method</Text>
                  <Text style={[st.colPaid,    st.colHead, { color: C.muted }]}>Amount Paid</Text>
                  <Text style={[st.colBalance, st.colHead]}>Balance After</Text>
                </View>

                {/* Payment rows */}
                {sale.payments.length === 0 ? (
                  <Text style={st.noPayments}>No payments recorded yet</Text>
                ) : (
                  sale.payments.map((p, i) => {
                    runningBalance -= Number(p.amount)
                    const rowStyle = i % 2 === 0 ? st.tableRow : st.tableRowAlt
                    const balColor = runningBalance <= 0.01 ? C.green : C.red
                    return (
                      <View key={i} style={rowStyle}>
                        <Text style={st.colDate}>{fmtDate(p.created_at)}</Text>
                        <Text style={st.colMethod}>{p.method.replace(/_/g, ' ')}</Text>
                        <Text style={st.colPaid}>+{fmt(Number(p.amount))}</Text>
                        <Text style={[st.colBalance, { color: balColor, fontFamily: 'Helvetica-Bold' }]}>
                          {runningBalance <= 0.01 ? '✓ Cleared' : fmt(Math.max(0, runningBalance))}
                        </Text>
                      </View>
                    )
                  })
                )}

                {/* Sale status chip */}
                <View style={st.saleFooter}>
                  <Text style={st.saleFooterT}>Status:</Text>
                  <Text style={[st.saleFooterV, isPaid ? st.cleared : st.outstanding]}>
                    {isPaid ? 'Fully Cleared' : `${fmt(outstanding)} remaining`}
                  </Text>
                </View>
              </View>
            )
          })
        )}

        {/* Grand total band */}
        {sales.length > 0 && (
          <View style={st.grandBox}>
            <View style={st.grandCell}>
              <Text style={st.grandLabel}>Total Invoiced</Text>
              <Text style={st.grandValue}>{fmt(totalSales)}</Text>
            </View>
            <View style={st.grandCell}>
              <Text style={st.grandLabel}>Total Paid</Text>
              <Text style={st.grandValue}>{fmt(totalPaid)}</Text>
            </View>
            <View style={st.grandCell}>
              <Text style={st.grandLabel}>Total Outstanding</Text>
              <Text style={st.grandOutVal}>{fmt(totalOutstanding)}</Text>
            </View>
          </View>
        )}

        <Text style={st.footer} fixed>
          {businessName} · Statement covers on-account sales for the selected period only · Generated {new Date().toLocaleDateString('en-GB')}
        </Text>
      </Page>
    </Document>
  )
}
