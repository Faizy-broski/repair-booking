'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { CreatableCombobox } from '@/components/ui/creatable-combobox'
import { toast } from 'sonner'

interface LedgerCategory { id: string; name: string }

export interface BuybackPayload {
  name: string
  selling_price: number
  sku?: string
}

interface Props {
  open: boolean
  onClose: () => void
  cashMovementType: 'cash_in' | 'cash_out'
  setCashMovementType: (v: 'cash_in' | 'cash_out') => void
  cashMovementAmount: string
  setCashMovementAmount: (v: string) => void
  cashMovementNotes: string
  setCashMovementNotes: (v: string) => void
  cashMovementSaving: boolean
  handleCashMovement: (categoryId: string | null, addToLedger: boolean, buyback?: BuybackPayload | null) => void
  businessId: string | null | undefined
}

export function CashMovementModal({
  open, onClose, cashMovementType, setCashMovementType,
  cashMovementAmount, setCashMovementAmount,
  cashMovementNotes, setCashMovementNotes,
  cashMovementSaving, handleCashMovement,
  businessId,
}: Props) {
  const isCashOut = cashMovementType === 'cash_out'

  // Cash Out has three mutually-exclusive purposes: a plain drawer removal,
  // logging it as a real expense (feeds the standalone Expenses module), or
  // a quick buyback (quick-create the product just bought from the customer,
  // the amount paid becomes its cost, one unit is added to stock — no
  // separate ledger, no condition grade/serial).
  // Cash In has no opt-in — it always counts directly as Sales revenue.
  const [purpose, setPurpose] = useState<'none' | 'expense' | 'buyback'>('none')

  const [categories, setCategories] = useState<LedgerCategory[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [catsLoading, setCatsLoading] = useState(false)

  const [buybackName, setBuybackName] = useState('')
  const [buybackSellingPrice, setBuybackSellingPrice] = useState('')
  const [buybackSku, setBuybackSku] = useState('')

  // Fetch expense categories only when user opts in
  useEffect(() => {
    if (purpose !== 'expense' || !businessId || categories.length > 0) return
    setCatsLoading(true)
    fetch(`/api/expenses/categories?business_id=${businessId}`)
      .then(r => r.json())
      .then(j => setCategories(j.data ?? []))
      .catch(() => {})
      .finally(() => setCatsLoading(false))
  }, [purpose, businessId]) // eslint-disable-line

  // Reset purpose-specific fields when switching away from Cash Out
  useEffect(() => {
    if (!isCashOut) resetPurposeFields()
  }, [isCashOut])

  function resetPurposeFields() {
    setPurpose('none')
    setCategoryId('')
    setBuybackName('')
    setBuybackSellingPrice('')
    setBuybackSku('')
  }

  async function createCategory(name: string) {
    if (!businessId) return
    const res = await fetch('/api/expenses/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, business_id: businessId }),
    })
    if (!res.ok) { toast.error('Failed to create category'); return }
    const created: LedgerCategory = (await res.json()).data
    setCategories(p => [...p, created])
    setCategoryId(created.id)
    toast.success(`Category "${created.name}" created`)
  }

  function handleClose() {
    resetPurposeFields()
    onClose()
  }

  function handleTypeChange(t: 'cash_in' | 'cash_out') {
    setCashMovementType(t)
    resetPurposeFields()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Cash In / Out" size="sm">
      <div className="space-y-4">

        {/* Type toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['cash_in', 'cash_out'] as const).map(t => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                cashMovementType === t
                  ? t === 'cash_in' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t === 'cash_in' ? '+ Cash In' : '- Cash Out'}
            </button>
          ))}
        </div>

        <Input
          label="Amount"
          type="number" min="0" step="0.01" placeholder="0.00"
          value={cashMovementAmount}
          onChange={e => setCashMovementAmount(e.target.value)}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {isCashOut ? 'Description' : 'Notes'} <span className="text-xs font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder={isCashOut ? 'e.g. Rent payment, petty cash for supplies…' : 'e.g. Petty cash for change'}
            value={cashMovementNotes}
            onChange={e => setCashMovementNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
          />
        </div>

        {/* Purpose — cash out only: plain removal, expense, or buyback */}
        {isCashOut && (
          <div className="space-y-3">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {([
                ['none', 'Plain'],
                ['expense', 'Expense'],
                ['buyback', 'Buyback'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPurpose(value)}
                  className={`flex-1 py-2 transition-colors ${purpose === value ? 'bg-brand-teal text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {purpose === 'expense' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Expense Category <span className="text-xs font-normal text-gray-400">(select or create)</span>
                </label>
                {catsLoading ? (
                  <div className="h-9 animate-pulse rounded-lg bg-gray-100" />
                ) : (
                  <CreatableCombobox
                    options={categories.map(c => ({ value: c.id, label: c.name }))}
                    value={categoryId}
                    onChange={v => setCategoryId(v)}
                    onCreate={createCategory}
                    placeholder="Select or type to create..."
                    createLabel="Add category"
                  />
                )}
              </div>
            )}

            {purpose === 'buyback' && (
              <div className="space-y-3">
                <Input
                  label="Product Name"
                  placeholder="e.g. iPhone 12 (used, from customer)"
                  value={buybackName}
                  onChange={e => setBuybackName(e.target.value)}
                />
                <Input
                  label="Selling Price"
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={buybackSellingPrice}
                  onChange={e => setBuybackSellingPrice(e.target.value)}
                />
                <Input
                  label="SKU (optional)"
                  placeholder="Leave blank to assign later"
                  value={buybackSku}
                  onChange={e => setBuybackSku(e.target.value)}
                />
                <p className="text-xs text-gray-400">The amount above becomes this product's cost, and one unit is added to stock.</p>
              </div>
            )}
          </div>
        )}

        {!isCashOut && (
          <p className="text-xs text-gray-400">Cash In always counts directly as Sales revenue.</p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
          <Button
            className={`flex-1 ${isCashOut ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
            loading={cashMovementSaving}
            disabled={
              !cashMovementAmount || parseFloat(cashMovementAmount) <= 0 ||
              (isCashOut && purpose === 'buyback' && (!buybackName.trim() || !buybackSellingPrice || parseFloat(buybackSellingPrice) < 0))
            }
            onClick={() => handleCashMovement(
              isCashOut && purpose === 'expense' ? categoryId || null : null,
              isCashOut && purpose === 'expense',
              isCashOut && purpose === 'buyback'
                ? { name: buybackName.trim(), selling_price: parseFloat(buybackSellingPrice), sku: buybackSku.trim() || undefined }
                : null
            )}
          >
            {isCashOut ? 'Record Cash Out' : 'Add Cash'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
