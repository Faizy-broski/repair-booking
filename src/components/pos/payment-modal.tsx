'use client'
import { useState } from 'react'
import { Banknote, CreditCard, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { usePosStore } from '@/store/pos.store'
import { useAuthStore } from '@/store/auth.store'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: (saleId: string) => void
}

export function PaymentModal({ open, onClose, onSuccess }: PaymentModalProps) {
  const pos = usePosStore()
  const { activeBranch, profile } = useAuthStore()
  const [processing, setProcessing] = useState(false)
  const [success, setSucess] = useState(false)
  const [successSaleId, setSuccessSaleId] = useState<string | null>(null)
  const [giftCardCode, setGiftCardCode] = useState('')

  async function processPayment() {
    if (!activeBranch || !profile) return
    setProcessing(true)

    const payload = {
      branch_id: activeBranch.id,
      cashier_id: profile.id,
      customer_id: pos.customer?.id ?? null,
      subtotal: pos.subtotal(),
      discount: pos.discount,
      tax: pos.taxAmount(),
      total: pos.total(),
      payment_method: pos.paymentMethod,
      gift_card_id: pos.giftCardId,
      gift_card_amount: pos.giftCardAmount || undefined,
      items: pos.cart.map((item) => ({
        product_id: item.product.id,
        variant_id: item.variant?.id ?? null,
        name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount,
        total: (item.unitPrice - item.discount) * item.quantity,
        is_service: item.product.is_service,
      })),
    }

    const res = await fetch('/api/pos/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const json = await res.json()
      setSuccessSaleId(json.data?.sale_id ?? null)
      setSucess(true)
      pos.clearCart()
      setTimeout(() => {
        setSucess(false)
        setSuccessSaleId(null)
        onSuccess?.(json.data?.sale_id)
        onClose()
      }, 2000)
    }
    setProcessing(false)
  }

  async function lookupGiftCard() {
    if (!giftCardCode || !activeBranch) return
    const res = await fetch(`/api/gift-cards?code=${giftCardCode}&branch_id=${activeBranch.id}`)
    const json = await res.json()
    if (json.data) {
      pos.setGiftCardId(json.data.id)
      pos.setGiftCardAmount(Math.min(json.data.balance, pos.total()))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Complete Payment" size="sm">
      {success ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <span className="text-2xl">✓</span>
          </div>
          <p className="font-semibold text-green-700">Payment Successful!</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex justify-between text-lg font-bold">
              <span>Total Due</span>
              <span className="text-blue-600">{formatCurrency(pos.total())}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'card', 'gift_card'] as const).map((method) => (
              <button
                key={method}
                onClick={() => pos.setPaymentMethod(method)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors ${
                  pos.paymentMethod === method
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {method === 'cash' && <Banknote className="h-5 w-5" />}
                {method === 'card' && <CreditCard className="h-5 w-5" />}
                {method === 'gift_card' && <Gift className="h-5 w-5" />}
                {method.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Gift card lookup */}
          {pos.paymentMethod === 'gift_card' && (
            <div className="flex gap-2">
              <Input
                placeholder="Gift card code"
                value={giftCardCode}
                onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={lookupGiftCard}>
                Apply
              </Button>
            </div>
          )}
          {pos.giftCardId && (
            <p className="text-xs text-green-600">
              Gift card applied: -{formatCurrency(pos.giftCardAmount ?? 0)}
            </p>
          )}

          <Button className="w-full" size="lg" loading={processing} onClick={processPayment}>
            Confirm Payment
          </Button>
        </div>
      )}
    </Modal>
  )
}
