'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { CreatableCombobox } from '@/components/ui/creatable-combobox'
import { toast } from 'sonner'

interface ExpenseCategory { id: string; name: string }

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
  handleCashMovement: (expenseCategoryId: string | null, addToExpense: boolean) => void
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

  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [catsLoading, setCatsLoading] = useState(false)
  const [addToExpense, setAddToExpense] = useState(false)

  // Fetch expense categories only when user opts in
  useEffect(() => {
    if (!addToExpense || !businessId || categories.length > 0) return
    setCatsLoading(true)
    fetch(`/api/expenses/categories?business_id=${businessId}`)
      .then(r => r.json())
      .then(j => setCategories(j.data ?? []))
      .catch(() => {})
      .finally(() => setCatsLoading(false))
  }, [addToExpense, businessId]) // eslint-disable-line

  // Reset expense opts when switching type
  useEffect(() => {
    if (!isCashOut) { setAddToExpense(false); setCategoryId('') }
  }, [isCashOut])

  async function createCategory(name: string) {
    if (!businessId) return
    const res = await fetch('/api/expenses/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, business_id: businessId }),
    })
    if (!res.ok) { toast.error('Failed to create category'); return }
    const created: ExpenseCategory = (await res.json()).data
    setCategories(p => [...p, created])
    setCategoryId(created.id)
    toast.success(`Category "${created.name}" created`)
  }

  function handleClose() {
    setCategoryId('')
    setAddToExpense(false)
    onClose()
  }

  function handleTypeChange(t: 'cash_in' | 'cash_out') {
    setCashMovementType(t)
    setCategoryId('')
    setAddToExpense(false)
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

        {/* Optional expense recording — cash out only */}
        {isCashOut && (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={addToExpense}
                onChange={e => { setAddToExpense(e.target.checked); if (!e.target.checked) setCategoryId('') }}
                className="h-4 w-4 rounded border-gray-300 accent-brand-teal"
              />
              <span className="text-sm text-gray-700">Also record as an expense</span>
            </label>

            {addToExpense && (
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
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
          <Button
            className={`flex-1 ${isCashOut ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
            loading={cashMovementSaving}
            disabled={!cashMovementAmount || parseFloat(cashMovementAmount) <= 0}
            onClick={() => handleCashMovement(addToExpense ? categoryId || null : null, addToExpense)}
          >
            {isCashOut ? 'Record Cash Out' : 'Add Cash'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
