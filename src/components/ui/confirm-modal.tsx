'use client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
  loading?: boolean
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="" size="sm">
      <div className="flex flex-col items-center text-center">
        <div className={
          `mb-4 flex h-12 w-12 items-center justify-center rounded-full
          ${variant === 'danger' ? 'bg-error-container text-on-error-container' :
            variant === 'warning' ? 'bg-warning/15 text-warning' : 'bg-primary-container text-on-primary-container'}
          `
        }>
          <AlertTriangle className="h-6 w-6" />
        </div>

        <h3 className="mb-1 text-lg font-bold text-on-surface">{title}</h3>
        {description && (
          <p className="mb-6 text-sm text-on-surface-variant">{description}</p>
        )}

        <div className="flex w-full gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
            Cancel
          </Button>
          <Button 
            variant={variant === 'danger' ? 'destructive' : 'default'} 
            onClick={onConfirm} 
            className="flex-1"
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
