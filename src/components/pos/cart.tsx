'use client'
import { ShoppingCart, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { usePosStore } from '@/store/pos.store'

interface CartProps {
  onCheckout: () => void
}

export function Cart({ onCheckout }: CartProps) {
  const pos = usePosStore()

  return (
    <div className="flex w-80 shrink-0 flex-col rounded-xl border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900">Cart</span>
          {pos.itemCount() > 0 && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
              {pos.itemCount()}
            </span>
          )}
        </div>
        {pos.cart.length > 0 && (
          <button onClick={pos.clearCart} className="text-xs text-gray-400 hover:text-red-500">
            Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {pos.cart.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-400">
            Add products to cart
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {pos.cart.map((item) => (
              <div
                key={`${item.product.id}-${item.variant?.id}`}
                className="flex items-center gap-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">{item.product.name}</p>
                  {item.variant && <p className="text-xs text-gray-400">{item.variant.name}</p>}
                  <p className="text-xs font-medium text-blue-600">{formatCurrency(item.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      pos.updateQuantity(item.product.id, item.variant?.id ?? null, item.quantity - 1)
                    }
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() =>
                      pos.updateQuantity(item.product.id, item.variant?.id ?? null, item.quantity + 1)
                    }
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => pos.removeFromCart(item.product.id, item.variant?.id ?? null)}
                    className="ml-1 text-gray-300 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="space-y-2 border-t border-gray-100 px-4 py-3">
        <div className="flex justify-between text-sm text-gray-500">
          <span>Subtotal</span>
          <span>{formatCurrency(pos.subtotal())}</span>
        </div>
        {pos.discount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount</span>
            <span>-{formatCurrency(pos.discount)}</span>
          </div>
        )}
        {pos.taxRate > 0 && (
          <div className="flex justify-between text-sm text-gray-500">
            <span>Tax ({pos.taxRate}%)</span>
            <span>{formatCurrency(pos.taxAmount())}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
          <span>Total</span>
          <span>{formatCurrency(pos.total())}</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <Button
          className="w-full"
          size="lg"
          disabled={pos.cart.length === 0}
          onClick={onCheckout}
        >
          Charge {formatCurrency(pos.total())}
        </Button>
      </div>
    </div>
  )
}
