import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: 'Helvetica', fontSize: 10 },
  header: { marginBottom: 16, borderBottom: '1 solid #e5e7eb', paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: 'bold' },
  subtitle: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  section: { marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  label: { color: '#6b7280', fontSize: 9 },
  value: { fontSize: 10 },
  tableHeader: { flexDirection: 'row', borderBottom: '1 solid #e5e7eb', paddingBottom: 4, marginBottom: 4 },
  tableHeaderText: { fontSize: 8, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottom: '0.5 solid #f3f4f6' },
  col1: { flex: 3 },
  col2: { flex: 1, textAlign: 'center' },
  col3: { flex: 1, textAlign: 'right' },
  col4: { flex: 1, textAlign: 'right' },
  col5: { flex: 1, textAlign: 'right' },
  totalsBox: { marginTop: 8, borderTop: '1 solid #e5e7eb', paddingTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3 },
  totalLabel: { width: 80, textAlign: 'right', color: '#6b7280', fontSize: 9 },
  totalValue: { width: 80, textAlign: 'right', fontSize: 10 },
  grandTotal: { fontWeight: 'bold', fontSize: 12 },
  badge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  footer: { marginTop: 20, borderTop: '0.5 solid #e5e7eb', paddingTop: 8 },
  footerText: { fontSize: 8, color: '#9ca3af', textAlign: 'center' },
})

interface SaleItem {
  name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
}

interface SaleReceiptPdfProps {
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
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', gift_card: 'Gift Card', split: 'Split', voucher: 'Voucher',
}

export function SaleReceiptPdf({
  saleId, date, customerName, cashierName, paymentMethod, paymentStatus,
  items, subtotal, discount, tax, total, isRefund, refundReason, paymentSplits, notes,
}: SaleReceiptPdfProps) {
  const fmt = (n: number) => `£${n.toFixed(2)}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{isRefund ? 'Refund Receipt' : 'Sale Receipt'}</Text>
          <Text style={styles.subtitle}>Sale #{saleId.slice(-8).toUpperCase()} — {date}</Text>
        </View>

        {/* Info */}
        <View style={{ flexDirection: 'row', marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{customerName}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Cashier</Text>
            <Text style={styles.value}>{cashierName}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Payment</Text>
            <Text style={styles.value}>
              {paymentMethod === 'split' && paymentSplits?.length
                ? paymentSplits.map(s => `${PAYMENT_LABELS[s.method] ?? s.method}: ${fmt(s.amount)}`).join(', ')
                : PAYMENT_LABELS[paymentMethod] ?? paymentMethod
              }
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{paymentStatus}</Text>
          </View>
        </View>

        {isRefund && refundReason ? (
          <View style={{ marginBottom: 10, padding: 6, backgroundColor: '#fef2f2', borderRadius: 4 }}>
            <Text style={{ fontSize: 9, color: '#991b1b' }}>Refund reason: {refundReason}</Text>
          </View>
        ) : null}

        {/* Items table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.col1]}>Item</Text>
          <Text style={[styles.tableHeaderText, styles.col2]}>Qty</Text>
          <Text style={[styles.tableHeaderText, styles.col3]}>Price</Text>
          <Text style={[styles.tableHeaderText, styles.col4]}>Disc.</Text>
          <Text style={[styles.tableHeaderText, styles.col5]}>Total</Text>
        </View>
        {items.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.value, styles.col1]}>{item.name}</Text>
            <Text style={[styles.value, styles.col2]}>{item.quantity}</Text>
            <Text style={[styles.value, styles.col3]}>{fmt(Number(item.unit_price))}</Text>
            <Text style={[styles.value, styles.col4]}>{Number(item.discount) > 0 ? fmt(Number(item.discount)) : '—'}</Text>
            <Text style={[styles.value, styles.col5]}>{fmt(Number(item.total))}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmt(subtotal)}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#16a34a' }]}>Discount</Text>
              <Text style={[styles.totalValue, { color: '#16a34a' }]}>-{fmt(discount)}</Text>
            </View>
          )}
          {tax > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>{fmt(tax)}</Text>
            </View>
          )}
          <View style={[styles.totalRow, { marginTop: 4 }]}>
            <Text style={[styles.totalLabel, styles.grandTotal]}>Total</Text>
            <Text style={[styles.totalValue, styles.grandTotal]}>{fmt(total)}</Text>
          </View>
        </View>

        {notes ? (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Thank you for your purchase!</Text>
        </View>
      </Page>
    </Document>
  )
}
