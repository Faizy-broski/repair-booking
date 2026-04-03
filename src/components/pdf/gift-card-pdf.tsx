import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const colors = {
  teal: '#14b8a6',
  tealDark: '#0d9488',
  dark: '#111827',
  mid: '#6b7280',
  light: '#f3f4f6',
  white: '#ffffff',
}

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    backgroundColor: colors.white,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 380,
    borderRadius: 12,
    overflow: 'hidden',
    border: `1 solid ${colors.light}`,
  },
  header: {
    backgroundColor: colors.teal,
    paddingVertical: 20,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.white,
    letterSpacing: 1,
  },
  body: {
    padding: 22,
    backgroundColor: colors.white,
  },
  codeBox: {
    backgroundColor: colors.light,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  codeLabel: {
    fontSize: 7,
    color: colors.mid,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  codeText: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Courier-Bold',
    color: colors.dark,
    letterSpacing: 1.5,
  },
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: `1 solid ${colors.light}`,
  },
  valueLabel: {
    fontSize: 9,
    color: colors.mid,
  },
  valueAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.tealDark,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  detailLabel: {
    fontSize: 8,
    color: colors.mid,
  },
  detailValue: {
    fontSize: 8,
    color: colors.dark,
  },
  footer: {
    borderTop: `1 solid ${colors.light}`,
    paddingTop: 10,
    marginTop: 6,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7,
    color: colors.mid,
    textAlign: 'center',
  },
})

interface GiftCardPdfProps {
  code: string
  balance: number
  initialValue: number
  customerName?: string
  expiresAt?: string | null
  issuedAt: string
  storeName?: string
}

export function GiftCardPdf({
  code,
  balance,
  initialValue,
  customerName,
  expiresAt,
  issuedAt,
  storeName = 'RepairBooking',
}: GiftCardPdfProps) {
  return (
    <Document>
      <Page size={[440, 320]} style={styles.page}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerLabel}>Gift Card</Text>
            <Text style={styles.headerTitle}>{storeName}</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Gift Card Code</Text>
              <Text style={styles.codeText}>{code}</Text>
            </View>

            <View style={styles.valueRow}>
              <Text style={styles.valueLabel}>Card Value</Text>
              <Text style={styles.valueAmount}>£{initialValue.toFixed(2)}</Text>
            </View>

            {balance !== initialValue && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Remaining Balance</Text>
                <Text style={styles.detailValue}>£{balance.toFixed(2)}</Text>
              </View>
            )}

            {customerName && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Issued To</Text>
                <Text style={styles.detailValue}>{customerName}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Issued On</Text>
              <Text style={styles.detailValue}>{issuedAt}</Text>
            </View>

            {expiresAt && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Valid Until</Text>
                <Text style={styles.detailValue}>{expiresAt}</Text>
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Present this card at checkout to redeem your balance.
              </Text>
              <Text style={styles.footerText}>
                This card is non-refundable and cannot be exchanged for cash.
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
