// Shared by the main Repairs module ("New Job"/"Edit Job") and the POS
// "Book Repair" tab — both let a deposit/payment be split across multiple
// tenders (cash, card, store credit, loyalty points) and need to turn that
// selection into the `payment_splits` array the repairs API expects.

export type PaymentSplit = { method: 'cash' | 'card' | 'store_credit' | 'loyalty_points'; amount: number }

export function buildPaymentSplits(
  paymentMethods: string[],
  paymentAmounts: { cash: string; card: string },
  creditApplyInput: string,
  loyaltyApplyInput: string,
  loyaltyRate: number
): PaymentSplit[] {
  const splits: PaymentSplit[] = []
  if (paymentMethods.includes('cash') && (parseFloat(paymentAmounts.cash) || 0) > 0) {
    splits.push({ method: 'cash', amount: parseFloat(paymentAmounts.cash) })
  }
  if (paymentMethods.includes('card') && (parseFloat(paymentAmounts.card) || 0) > 0) {
    splits.push({ method: 'card', amount: parseFloat(paymentAmounts.card) })
  }
  if (paymentMethods.includes('store_credit') && (parseFloat(creditApplyInput) || 0) > 0) {
    splits.push({ method: 'store_credit', amount: parseFloat(creditApplyInput) })
  }
  if (paymentMethods.includes('loyalty_points') && (parseFloat(loyaltyApplyInput) || 0) > 0) {
    splits.push({ method: 'loyalty_points', amount: (parseFloat(loyaltyApplyInput) || 0) * loyaltyRate })
  }
  return splits
}

export function paymentSplitTotal(splits: PaymentSplit[]) {
  return splits.reduce((s, x) => s + x.amount, 0)
}
