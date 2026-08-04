// Builds a wa.me deep link with a pre-filled message so staff can review and
// send an invoice to a customer's WhatsApp with one click — no WhatsApp
// Business API/Meta approval needed, this just opens WhatsApp with the text
// and PDF link already composed.
export function buildWhatsAppInvoiceLink(params: {
  phone: string
  invoiceNumber: string
  total: number
  currency: string
  pdfUrl: string
  businessName?: string | null
}): string {
  const digits = params.phone.replace(/\D/g, '')
  const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: params.currency }).format(params.total)
  const message =
    `Hi! Here's your invoice ${params.invoiceNumber}${params.businessName ? ` from ${params.businessName}` : ''} for ${amount}.\n` +
    `View/download: ${params.pdfUrl}\n\n` +
    `Thank you for your business.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
