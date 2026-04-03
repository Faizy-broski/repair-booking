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
            'flex h-9 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900',
            'data-[placeholder]:text-gray-400',
            'focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className
          )}
        >
          <span className="truncate">
            <RadixSelect.Value placeholder={placeholder} />
          </span>
          <RadixSelect.Icon asChild>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-60 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            <RadixSelect.Viewport className="p-1">
              {options.filter((o) => o.value !== '').map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm text-gray-700 outline-none hover:bg-gray-50 focus:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <RadixSelect.ItemIndicator className="absolute left-2">
                    <Check className="h-3.5 w-3.5 text-brand-teal" />
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
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
