'use client'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InlineFormSheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  side?: 'right' | 'left'
  width?: string
}

export function InlineFormSheet({
  open, onClose, title, description, children, side = 'right', width = 'w-[480px]',
}: InlineFormSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed top-0 z-50 h-full bg-white shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            side === 'right'
              ? 'right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
              : 'left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
            width
          )}
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <Dialog.Title className="text-base font-semibold text-gray-900">{title}</Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-0.5 text-sm text-gray-500">{description}</Dialog.Description>
                )}
              </div>
              <button
                onClick={onClose}
                className="ml-4 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {children}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
