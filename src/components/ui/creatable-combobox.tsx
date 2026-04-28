'use client'
import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
}

interface CreatableComboboxProps {
  options: ComboboxOption[]
  value: string          // selected option value (id or '')
  onChange: (value: string, label: string) => void
  onCreate?: (inputText: string) => Promise<void> | void  // called when user confirms a new entry
  placeholder?: string
  createLabel?: string   // text before the typed value e.g. 'Add'
  disabled?: boolean
  className?: string
}

/**
 * A combobox that:
 *  1. Shows a searchable dropdown of existing options.
 *  2. If the typed text doesn't match any option, shows a "+ Create …" item at the bottom.
 *  3. Selecting "Create" calls `onCreate(inputText)` — the parent is responsible for
 *     actually inserting the record and then passing the new option back via `options`.
 */
export function CreatableCombobox({
  options,
  value,
  onChange,
  onCreate,
  placeholder = 'Select or type...',
  createLabel = 'Add',
  disabled,
  className,
}: CreatableComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  // The label for the currently selected value
  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  // What we show in the trigger when closed
  const displayText = value ? (selectedLabel || value) : ''

  // Filter options by query
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  // Show create option when query doesn't exactly match any existing label
  const queryTrimmed = query.trim()
  const exactMatch   = options.some((o) => o.label.toLowerCase() === queryTrimmed.toLowerCase())
  const showCreate   = !!queryTrimmed && !exactMatch && !!onCreate

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function openDropdown() {
    if (disabled) return
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function selectOption(opt: ComboboxOption) {
    onChange(opt.value, opt.label)
    setOpen(false)
    setQuery('')
  }

  function clearValue(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('', '')
    setOpen(false)
    setQuery('')
  }

  async function handleCreate() {
    if (!queryTrimmed || !onCreate) return
    setCreating(true)
    await onCreate(queryTrimmed)
    setCreating(false)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length === 1) { selectOption(filtered[0]); return }
      if (showCreate) handleCreate()
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
          'focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
          open && 'border-brand-teal ring-2 ring-brand-teal/20',
          !displayText && 'text-gray-400',
        )}
      >
        <span className="truncate">{displayText || placeholder}</span>
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {value && (
            <span
              role="button"
              onClick={clearValue}
              className="text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search or type to create..."
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
            />
          </div>

          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 && !showCreate && (
              <p className="py-3 text-center text-xs text-gray-400">No options found</p>
            )}

            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectOption(opt)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
              >
                <Check className={cn('h-3.5 w-3.5 text-brand-teal shrink-0', opt.value !== value && 'invisible')} />
                {opt.label}
              </button>
            ))}

            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-brand-teal hover:bg-brand-teal/5 text-left border-t border-gray-100 mt-1 pt-2"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                {creating ? 'Creating…' : `${createLabel} "${queryTrimmed}"`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
