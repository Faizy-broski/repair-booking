'use client'
import * as RadixSelect from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  options: SelectOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  label?: string
  error?: string
  disabled?: boolean
  className?: string
  required?: boolean
}

export function Select({
  options, value, onValueChange, placeholder = 'Select...', label, error, disabled, className, required,
}: SelectProps) {
  const id = label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <RadixSelect.Trigger
          id={id}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
            'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
            error && 'border-red-500',
            className
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content className="z-50 min-w-[8rem] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <RadixSelect.Viewport className="p-1">
              {options.filter((o) => o.value !== '').map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="relative flex cursor-pointer select-none items-center rounded-md px-8 py-1.5 text-sm text-gray-700 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none data-[disabled]:opacity-50"
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="absolute left-2">
                    <Check className="h-3 w-3 text-blue-600" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
