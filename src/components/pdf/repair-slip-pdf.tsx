import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

// Small device-tag slip: barcode + ticket number.
// Fixed page size (~100mm x 60mm) so the print dialog never has to guess —
// mirrors the thermal-label sizing used by receipt printers.

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barcode: {
    width: 200,
    height: 60,
    objectFit: 'contain',
  },
  ticket: {
    marginTop: 10,
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
  },
})

export interface RepairSlipPdfProps {
  jobNumber: string
  barcodeDataUrl: string
}

export function RepairSlipPdf({ jobNumber, barcodeDataUrl }: RepairSlipPdfProps) {
  return (
    <Document>
      <Page size={[283.5, 170]} style={styles.page}>
        <View style={{ alignItems: 'center' }}>
          <Image src={barcodeDataUrl} style={styles.barcode} />
          <Text style={styles.ticket}>Ticket ID: {jobNumber}</Text>
        </View>
      </Page>
    </Document>
  )
}
