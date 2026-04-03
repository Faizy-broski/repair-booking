'use client'
import React, { useState, useEffect } from 'react'
import { Banknote, CreditCard, Gift, Star, Wallet } from 'lucide-react'
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

  // Store credits
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [creditInput, setCreditInput] = useState('')

  // Loyalty points
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null)
  const [loyaltyRate, setLoyaltyRate] = useState(0.01) // redeem_rate: 1 point = £0.01
  const [loyaltyInput, setLoyaltyInput] = useState('')

  // Fetch customer balances when customer is set and modal opens
  useEffect(() => {
    if (!open || !pos.customer) {
      setCreditBalance(null)
      setLoyaltyBalance(null)
      return
    }
    const id = pos.customer.id
    fetch(`/api/customers/${id}/store-credits`)
      .then((r) => r.json())
      .then((j) => setCreditBalance(j.data?.balance ?? 0))
      .catch(() => {})

    fetch(`/api/customers/${id}/loyalty`)
      .then((r) => r.json())
      .then((j) => {
        setLoyaltyBalance(j.data?.balance ?? 0)
        setLoyaltyRate(j.data?.redeem_rate ?? 0.01)
      })
      .catch(() => {})
  }, [open, pos.customer])

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
      store_credit_amount: pos.storeCreditAmount || undefined,
      loyalty_points_used: pos.loyaltyPointsUsed || undefined,
      loyalty_points_amount: pos.loyaltyPointsAmount || undefined,
      items: pos.cart.map((item) => ({
        // Repairs and misc items are services — their IDs are not in the products
        // table so product_id must be null to avoid FK constraint violation.
        product_id: item.product.is_service ? null : item.product.id,
        variant_id: item.variant?.id ?? null,
        name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount,
        total: (item.unitPrice - item.discount) * item.quantity,
        is_service: item.product.is_service ?? false,
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
    const params = new URLSearchParams({ code: giftCardCode, branch_id: activeBranch.id })
    if (pos.customer?.id) params.set('customer_id', pos.customer.id)
    const res = await fetch(`/api/gift-cards?${params}`)
    const json = await res.json()
    if (res.ok && json.data) {
      pos.setGiftCard(json.data.id, Math.min(json.data.balance, pos.total()))
    }
  }

  function applyStoreCredit() {
    const amount = Math.min(parseFloat(creditInput) || 0, creditBalance ?? 0, pos.total())
    pos.setStoreCredit(amount)
    setCreditInput(String(amount))
  }

  function applyLoyaltyPoints() {
    const pts = parseInt(loyaltyInput) || 0
    const capped = Math.min(pts, loyaltyBalance ?? 0)
    const amount = Math.min(capped * loyaltyRate, pos.total())
    pos.setLoyaltyPoints(Math.round(amount / loyaltyRate), amount)
    setLoyaltyInput(String(Math.round(amount / loyaltyRate)))
  }

  type PayMethod = { key: string; label: string; icon: React.ReactNode; requiresCustomer: boolean }
  const methodConfig: PayMethod[] = [
    { key: 'cash',          label: 'Cash',           icon: <Banknote className="h-5 w-5" />,   requiresCustomer: false },
    { key: 'card',          label: 'Card',           icon: <CreditCard className="h-5 w-5" />, requiresCustomer: false },
    { key: 'gift_card',     label: 'Gift Card',      icon: <Gift className="h-5 w-5" />,       requiresCustomer: false },
    { key: 'store_credit',  label: 'Store Credit',   icon: <Wallet className="h-5 w-5" />,     requiresCustomer: true },
    { key: 'loyalty_points',label: 'Loyalty Points', icon: <Star className="h-5 w-5" />,       requiresCustomer: true },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Complete Payment" size="sm">
      {success ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <span className="text-2xl">✓</span>
          </div>
          <p className="font-semibold text-green-700">Payment Successful!</p>
          {successSaleId && <p className="text-xs text-gray-400 mt-1">Sale #{successSaleId.slice(-8)}</p>}
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
            {methodConfig.map(({ key, label, icon, requiresCustomer = false }) => {
              const disabled = requiresCustomer && !pos.customer
              return (
                <button
                  key={key}
                  disabled={disabled}
                  onClick={() => !disabled && pos.setPaymentMethod(key as Parameters<typeof pos.setPaymentMethod>[0])}
                  title={disabled ? 'Select a customer first' : undefined}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors ${
                    pos.paymentMethod === key
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : disabled
                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {icon}
                  {label}
                </button>
              )
            })}
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

          {/* Store credit */}
          {pos.paymentMethod === 'store_credit' && (
            <div className="space-y-2">
              {creditBalance !== null && (
                <p className="text-xs text-gray-500">
                  Available balance: <span className="font-semibold text-gray-800">{formatCurrency(creditBalance)}</span>
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount to use"
                  value={creditInput}
                  onChange={(e) => setCreditInput(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={applyStoreCredit}>Apply</Button>
              </div>
              {pos.storeCreditAmount > 0 && (
                <p className="text-xs text-green-600">
                  Store credit applied: -{formatCurrency(pos.storeCreditAmount)}
                </p>
              )}
            </div>
          )}

          {/* Loyalty points */}
          {pos.paymentMethod === 'loyalty_points' && (
            <div className="space-y-2">
              {loyaltyBalance !== null && (
                <p className="text-xs text-gray-500">
                  Points balance: <span className="font-semibold text-gray-800">{loyaltyBalance} pts</span>
                  {' '}(≈ {formatCurrency(loyaltyBalance * loyaltyRate)})
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Points to redeem"
                  value={loyaltyInput}
                  onChange={(e) => setLoyaltyInput(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={applyLoyaltyPoints}>Apply</Button>
              </div>
              {pos.loyaltyPointsUsed > 0 && (
                <p className="text-xs text-green-600">
                  {pos.loyaltyPointsUsed} pts redeemed: -{formatCurrency(pos.loyaltyPointsAmount)}
                </p>
              )}
            </div>
          )}

          <Button className="w-full" size="lg" loading={processing} onClick={processPayment}>
            Confirm Payment
          </Button>
        </div>
      )}
    </Modal>
  )
}
