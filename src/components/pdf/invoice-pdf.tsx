import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  section: { marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 10, color: '#666' },
  value: { fontSize: 10 },
  total: { fontSize: 14, fontWeight: 'bold' },
})

interface InvoicePdfProps {
  invoiceNumber: string
  customerName: string
  items: Array<{ description: string; quantity: number; unit_price: number }>
  subtotal: number
  tax: number
  total: number
}

export function InvoicePdf({ invoiceNumber, customerName, items, subtotal, tax, total }: InvoicePdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Invoice {invoiceNumber}</Text>
        <View style={styles.section}>
          <Text style={styles.label}>Bill To</Text>
          <Text style={styles.value}>{customerName}</Text>
        </View>
        <View style={styles.section}>
          {items.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.value}>{item.description} × {item.quantity}</Text>
              <Text style={styles.value}>£{(item.quantity * item.unit_price).toFixed(2)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Subtotal</Text>
          <Text style={styles.value}>£{subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Tax</Text>
          <Text style={styles.value}>£{tax.toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.total}>Total</Text>
          <Text style={styles.total}>£{total.toFixed(2)}</Text>
        </View>
      </Page>
    </Document>
  )
}
