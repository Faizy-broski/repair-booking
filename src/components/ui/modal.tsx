'use client'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  printable?: boolean
}

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl',
  full: 'max-w-none',
}

export function Modal({ open, onClose, title, description, children, size = 'md', printable }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            printable && 'print:hidden'
          )}
        />
        <Dialog.Content
          onInteractOutside={(e) => {
            const target = e.target as Element;
            if (target?.closest('[data-combobox-dropdown="true"]')) {
              e.preventDefault();
            }
          }}
          className={cn(
            size === 'full'
              ? 'fixed left-0 top-0 z-50 w-screen h-screen -translate-x-0 -translate-y-0 rounded-none'
              : 'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-xl',
            'bg-white shadow-xl',
            size === 'full' ? 'overflow-auto' : 'max-h-[85vh] overflow-y-auto',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            SIZE_CLASSES[size],
            'p-4 sm:p-6',
            printable && 'print:static print:max-h-none print:overflow-visible print:h-auto print:max-w-none print:w-auto print:shadow-none print:p-0 print:rounded-none print:translate-x-0 print:translate-y-0'
          )}
        >
          <div className={cn('mb-4 flex items-start justify-between', printable && 'print:hidden')}>
            <div>
              <Dialog.Title className="text-lg font-semibold text-gray-900">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-gray-500">{description}</Dialog.Description>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-4 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
