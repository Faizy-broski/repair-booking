import { create } from 'zustand'
import type { Product, ProductVariant, Customer } from '@/types/database'
import type { RegisterSession } from '@/app/(tenant)/pos/_types'

export interface CartItem {
  product: Product
  variant: ProductVariant | null
  quantity: number
  unitPrice: number
  discount: number
  maxStock: number | null
  // Set when this line was added via the quantity-scoped discount picker
  // (retail-store template) — keeps a discount-priced line and a normal-
  // priced line of the SAME product from merging into one cart row, since
  // they draw from two separate stock pools server-side.
  isDiscount?: boolean
  imei?: string
  faults?: string
}

export interface PaymentSplit {
  method: 'cash' | 'card' | 'gift_card' | 'ebay' | 'deliveroo' | 'website'
  amount: number
}

interface PosState {
  cart: CartItem[]
  customer: Customer | null
  discount: number
  taxRate: number
  paymentMethod: 'cash' | 'card' | 'gift_card' | 'store_credit' | 'loyalty_points' | 'split'
  paymentSplits: PaymentSplit[]
  giftCardId: string | null
  giftCardAmount: number
  storeCreditAmount: number
  loyaltyPointsAmount: number
  loyaltyPointsUsed: number

  // POS Session Cache
  session: RegisterSession | null
  existingSession: RegisterSession | null
  sessionLoaded: boolean
  setSession: (session: RegisterSession | null) => void
  setExistingSession: (session: RegisterSession | null) => void
  setSessionLoaded: (loaded: boolean) => void

  addToCart: (
    product: Product, variant?: ProductVariant | null, maxStock?: number | null,
    options?: { isDiscount?: boolean; unitPriceOverride?: number }
  ) => void
  removeFromCart: (productId: string, variantId?: string | null, isDiscount?: boolean) => void
  updateQuantity: (productId: string, variantId: string | null, quantity: number, isDiscount?: boolean) => void
  setItemDiscount: (productId: string, variantId: string | null, discount: number, isDiscount?: boolean) => void
  setItemImei: (productId: string, variantId: string | null, imei: string, isDiscount?: boolean) => void
  setItemFaults: (productId: string, variantId: string | null, faults: string, isDiscount?: boolean) => void
  setCustomer: (customer: Customer | null) => void
  setDiscount: (discount: number) => void
  setTaxRate: (rate: number) => void
  setPaymentMethod: (method: PosState['paymentMethod']) => void
  setPaymentSplits: (splits: PaymentSplit[]) => void
  setGiftCard: (id: string, amount: number) => void
  clearGiftCard: () => void
  setStoreCredit: (amount: number) => void
  setLoyaltyPoints: (points: number, amount: number) => void
  clearCart: () => void
  restoreCart: (items: CartItem[]) => void

  // Computed
  subtotal: () => number
  taxAmount: () => number
  total: () => number
  itemCount: () => number
}

export const usePosStore = create<PosState>((set, get) => ({
  cart: [],
  customer: null,
  discount: 0,
  taxRate: 0,
  paymentMethod: 'cash',
  paymentSplits: [],
  giftCardId: null,
  giftCardAmount: 0,
  storeCreditAmount: 0,
  loyaltyPointsAmount: 0,
  loyaltyPointsUsed: 0,

  session: null,
  existingSession: null,
  sessionLoaded: false,
  setSession: (session) => set({ session }),
  setExistingSession: (existingSession) => set({ existingSession }),
  setSessionLoaded: (sessionLoaded) => set({ sessionLoaded }),

  addToCart: (product, variant = null, maxStock = null, options) => {
    const { cart } = get()
    const isDiscount = options?.isDiscount ?? false
    const existingIdx = cart.findIndex(
      (i) => i.product.id === product.id && (i.variant?.id ?? null) === (variant?.id ?? null)
        && (i.isDiscount ?? false) === isDiscount
    )

    if (existingIdx >= 0) {
      const updated = [...cart]
      const existing = updated[existingIdx]
      const cap = existing.maxStock ?? Infinity
      updated[existingIdx] = { ...existing, quantity: Math.min(existing.quantity + 1, cap) }
      set({ cart: updated })
    } else {
      const cap = maxStock ?? Infinity
      if (cap <= 0) return
      const price = options?.unitPriceOverride ?? (variant?.selling_price ?? product.selling_price)
      set({ cart: [...cart, { product, variant: variant ?? null, quantity: 1, unitPrice: price, discount: 0, maxStock, isDiscount }] })
    }
  },

  removeFromCart: (productId, variantId = null, isDiscount = false) => {
    set({
      cart: get().cart.filter((i) =>
        !(i.product.id === productId && (i.variant?.id ?? null) === variantId && (i.isDiscount ?? false) === isDiscount)
      ),
    })
  },

  updateQuantity: (productId, variantId, quantity, isDiscount = false) => {
    if (quantity <= 0) {
      get().removeFromCart(productId, variantId, isDiscount)
      return
    }
    set({
      cart: get().cart.map((i) =>
        i.product.id === productId && (i.variant?.id ?? null) === variantId && (i.isDiscount ?? false) === isDiscount
          ? { ...i, quantity: Math.min(quantity, i.maxStock ?? Infinity) }
          : i
      ),
    })
  },

  setItemDiscount: (productId, variantId, discount, isDiscount = false) => {
    set({
      cart: get().cart.map((i) =>
        i.product.id === productId && (i.variant?.id ?? null) === variantId && (i.isDiscount ?? false) === isDiscount
          ? { ...i, discount }
          : i
      ),
    })
  },

  setItemImei: (productId, variantId, imei, isDiscount = false) => {
    set({
      cart: get().cart.map((i) =>
        i.product.id === productId && (i.variant?.id ?? null) === variantId && (i.isDiscount ?? false) === isDiscount
          ? { ...i, imei }
          : i
      ),
    })
  },

  setItemFaults: (productId, variantId, faults, isDiscount = false) => {
    set({
      cart: get().cart.map((i) =>
        i.product.id === productId && (i.variant?.id ?? null) === variantId && (i.isDiscount ?? false) === isDiscount
          ? { ...i, faults }
          : i
      ),
    })
  },

  setCustomer: (customer) => set({ customer }),
  setDiscount: (discount) => set({ discount }),
  setTaxRate: (taxRate) => set({ taxRate }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setPaymentSplits: (paymentSplits) => set({ paymentSplits }),
  setGiftCard: (id, amount) => set({ giftCardId: id, giftCardAmount: amount }),
  clearGiftCard: () => set({ giftCardId: null, giftCardAmount: 0, paymentMethod: 'cash' }),
  setStoreCredit: (amount) => set({ storeCreditAmount: amount }),
  setLoyaltyPoints: (points, amount) => set({ loyaltyPointsUsed: points, loyaltyPointsAmount: amount }),

  clearCart: () =>
    set({
      cart: [],
      customer: null,
      discount: 0,
      paymentSplits: [],
      giftCardId: null,
      giftCardAmount: 0,
      storeCreditAmount: 0,
      loyaltyPointsAmount: 0,
      loyaltyPointsUsed: 0,
    }),

  restoreCart: (items) => set({ cart: items }),

  subtotal: () =>
    get().cart.reduce((sum, item) => sum + (item.unitPrice - item.discount) * item.quantity, 0),
  taxAmount: () => get().subtotal() * (get().taxRate / 100),
  total: () => {
    const sub = get().subtotal()
    const tax = get().taxAmount()
    const discount = get().discount
    return Math.max(0, sub + tax - discount)
  },
  itemCount: () => get().cart.reduce((sum, item) => sum + item.quantity, 0),
}))
