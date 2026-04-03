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
    <div className="mx-auto w-72 bg-white p-4 font-mono text-xs text-gray-800">
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="text-sm font-bold">{businessName}</p>
        {branchName && <p className="text-gray-500">{branchName}</p>}
        {branchAddress && <p className="text-gray-500">{branchAddress}</p>}
      </div>

      <hr className="my-2 border-dashed border-gray-300" />

      {/* Meta */}
      <div className="mb-2 space-y-0.5 text-gray-500">
        {timestamp && <p>Date: {formatDateTime(timestamp)}</p>}
        {saleId && <p>Sale: #{saleId.slice(0, 8).toUpperCase()}</p>}
        {cashierName && <p>Cashier: {cashierName}</p>}
        {customerName && <p>Customer: {customerName}</p>}
      </div>

      <hr className="my-2 border-dashed border-gray-300" />

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

      <hr className="my-2 border-dashed border-gray-300" />

      {/* Totals */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-gray-500">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}
        {tax > 0 && (
          <div className="flex justify-between text-gray-500">
            <span>Tax</span>
            <span>{formatCurrency(tax)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed border-gray-300 pt-1 font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Payment</span>
          <span className="capitalize">{paymentMethod.replace('_', ' ')}</span>
        </div>
      </div>

      <hr className="my-2 border-dashed border-gray-300" />

      <p className="text-center text-gray-400">Thank you for your business!</p>
    </div>
  )
}
