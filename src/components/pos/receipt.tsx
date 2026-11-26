'use client'
import { formatCurrency, formatDateTime } from '@/lib/utils'

interface ReceiptItem {
  name: string
  quantity: number
  unit_price: number
  total: number
}

interface ReceiptProps {
  saleId?: string
  businessName?: string
  branchName?: string
  branchAddress?: string
  items: ReceiptItem[]
  subtotal: number
  discount?: number
  tax?: number
  total: number
  paymentMethod: string
  cashierName?: string
  customerName?: string
  timestamp?: string
}

/**
 * Printable receipt component. Render inside a `@react-pdf/renderer` Document
 * or display as an inline HTML receipt.
 */
export function Receipt({
  saleId,
  businessName = 'RepairBooking POS',
  branchName,
  branchAddress,
  items,
  subtotal,
  discount = 0,
  tax = 0,
  total,
  paymentMethod,
  cashierName,
  customerName,
  timestamp,
}: ReceiptProps) {
  return (
    <div className="mx-auto w-72 bg-white p-4 font-mono text-xs text-on-surface">
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="text-sm font-bold">{businessName}</p>
        {branchName && <p className="text-on-surface-variant">{branchName}</p>}
        {branchAddress && <p className="text-on-surface-variant">{branchAddress}</p>}
      </div>

      <hr className="my-2 border-dashed border-outline-variant" />

      {/* Meta */}
      <div className="mb-2 space-y-0.5 text-on-surface-variant">
        {timestamp && <p>Date: {formatDateTime(timestamp)}</p>}
        {saleId && <p>Sale: #{saleId.slice(0, 8).toUpperCase()}</p>}
        {cashierName && <p>Cashier: {cashierName}</p>}
        {customerName && <p>Customer: {customerName}</p>}
      </div>

      <hr className="my-2 border-dashed border-outline-variant" />

      {/* Items */}
      <div className="mb-2 space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span className="flex-1 truncate">
              {item.name} x{item.quantity}
            </span>
            <span className="ml-2 shrink-0">{formatCurrency(item.total)}</span>
          </div>
        ))}
      </div>

      <hr className="my-2 border-dashed border-outline-variant" />

      {/* Totals */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-on-surface-variant">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>Discount</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}
        {tax > 0 && (
          <div className="flex justify-between text-on-surface-variant">
            <span>Tax</span>
            <span>{formatCurrency(tax)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed border-outline-variant pt-1 font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <div className="flex justify-between text-on-surface-variant">
          <span>Payment</span>
          <span className="capitalize">{paymentMethod.replace('_', ' ')}</span>
        </div>
      </div>

      <hr className="my-1 border-dashed border-outline-variant" />

      <p className="text-center font-bold text-black mt-2">Thank you for your business!</p>
    </div>
  )
}
