'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

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
  handleCashMovement: () => void
}

export function CashMovementModal({
  open, onClose, cashMovementType, setCashMovementType,
  cashMovementAmount, setCashMovementAmount,
  cashMovementNotes, setCashMovementNotes,
  cashMovementSaving, handleCashMovement,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Cash In / Out" size="sm">
      <div className="space-y-4">
        {/* Type toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['cash_in', 'cash_out'] as const).map(t => (
            <button
              key={t}
              onClick={() => setCashMovementType(t)}
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
          <textarea
            rows={2}
            placeholder={cashMovementType === 'cash_in' ? 'e.g. Petty cash for change' : 'e.g. Cash removed for bank deposit'}
            value={cashMovementNotes}
            onChange={e => setCashMovementNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className={`flex-1 ${cashMovementType === 'cash_in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
            loading={cashMovementSaving}
            disabled={!cashMovementAmount || parseFloat(cashMovementAmount) <= 0}
            onClick={handleCashMovement}
          >
            {cashMovementType === 'cash_in' ? 'Add Cash' : 'Remove Cash'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
