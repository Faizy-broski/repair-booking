'use client'
import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, X, Pencil, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
}

interface Props {
  options: ComboboxOption[]
  value: string
  onChange: (value: string, label: string) => void
  onCreate?: (text: string) => Promise<void> | void
  onEdit?: (value: string, newLabel: string) => Promise<void> | void
  onDelete?: (value: string, label: string) => Promise<void> | void
  placeholder?: string
  createLabel?: string
  disabled?: boolean
  className?: string
}

export function CreatableCombobox({
  options,
  value,
  onChange,
  onCreate,
  onEdit,
  onDelete,
  placeholder = 'Select or type...',
  createLabel = 'Add',
  disabled,
  className,
}: Props) {
  const [open, setOpen]             = useState(false)
  const [query, setQuery]           = useState('')
  const [creating, setCreating]     = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [editLabel, setEditLabel]   = useState('')
  const [editBusy, setEditBusy]     = useState(false)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const wrapRef      = useRef<HTMLDivElement>(null)
  const triggerRef   = useRef<HTMLButtonElement>(null)
  const searchRef    = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const selectedLabel = options.find(o => o.value === value)?.label ?? ''
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options
  const queryTrimmed = query.trim()
  const exactMatch   = options.some(o => o.label.toLowerCase() === queryTrimmed.toLowerCase())
  const showCreate   = !!queryTrimmed && !exactMatch && !!onCreate
  const hasManage    = !!(onEdit || onDelete)

  const dropdownRef  = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      const target = e.target as Node
      const insideTrigger = wrapRef.current?.contains(target)
      const insideDropdown = dropdownRef.current?.contains(target)
      if (!insideTrigger && !insideDropdown) close()
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  useEffect(() => {
    if (editId) setTimeout(() => editInputRef.current?.focus(), 0)
  }, [editId])

  function close() {
    setOpen(false)
    setQuery('')
    setEditId(null)
    setDeleteId(null)
  }

  function openDropdown() {
    if (disabled) return
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    setOpen(true)
    setQuery('')
    setEditId(null)
    setDeleteId(null)
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  function select(opt: ComboboxOption) {
    onChange(opt.value, opt.label)
    close()
  }

  function clearValue(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('', '')
    close()
  }

  async function handleCreate() {
    if (!queryTrimmed || !onCreate) return
    setCreating(true)
    await onCreate(queryTrimmed)
    setCreating(false)
    close()
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length === 1) { select(filtered[0]); return }
      if (showCreate) handleCreate()
    }
  }

  function beginEdit(e: React.MouseEvent, opt: ComboboxOption) {
    e.stopPropagation()
    setDeleteId(null)
    setEditId(opt.value)
    setEditLabel(opt.label)
  }

  async function saveEdit(e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!editId || !onEdit || !editLabel.trim()) return
    setEditBusy(true)
    await onEdit(editId, editLabel.trim())
    setEditBusy(false)
    setEditId(null)
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditId(null)
  }

  function beginDelete(e: React.MouseEvent, opt: ComboboxOption) {
    e.stopPropagation()
    setEditId(null)
    setDeleteId(opt.value)
  }

  async function confirmDelete(e: React.MouseEvent, opt: ComboboxOption) {
    e.stopPropagation()
    if (!onDelete) return
    setDeleteBusy(true)
    await onDelete(opt.value, opt.label)
    setDeleteBusy(false)
    setDeleteId(null)
    if (value === opt.value) onChange('', '')
  }

  function cancelDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleteId(null)
  }



  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors',
          'focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
          open && 'border-brand-teal ring-2 ring-brand-teal/20',
          !value && 'text-gray-400',
        )}
      >
        <span className="truncate">{value ? selectedLabel : placeholder}</span>
        <span className="ml-2 flex shrink-0 items-center gap-1">
          {value && (
            <span
              role="button"
              onClick={clearValue}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors hover:bg-red-500 hover:text-white"
            >
              <X className="h-2.5 w-2.5" />
            </span>
          )}
          <span className={cn(
            'flex h-5 w-5 items-center justify-center rounded transition-colors',
            open
              ? 'bg-brand-teal text-white'
              : 'bg-brand-teal/10 text-brand-teal hover:bg-brand-teal hover:text-white',
          )}>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </span>
        </span>
      </button>

      {/* Dropdown panel — rendered via portal so it escapes modal overflow/clipping */}
      {open && dropdownRect && createPortal(
        <div
          ref={dropdownRef}
          data-combobox-dropdown="true"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, zIndex: 9999, pointerEvents: 'auto' }}
          className="rounded-lg border border-gray-200 bg-white shadow-xl"
        >

          {/* Search input */}
          <div className="border-b border-gray-100 p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search or type to create..."
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
            />
          </div>

          {/* List */}
          <ul className="max-h-52 overflow-y-auto p-1" role="listbox">

            {filtered.length === 0 && !showCreate && (
              <li className="py-3 text-center text-xs text-gray-400">No options found</li>
            )}

            {filtered.map(opt => {
              /* Edit row */
              if (editId === opt.value) return (
                <li key={opt.value} className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1.5">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
                      if (e.key === 'Escape') { e.stopPropagation(); setEditId(null) }
                    }}
                    className="min-w-0 flex-1 rounded border border-blue-300 px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={editBusy || !editLabel.trim()}
                    className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {editBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )

              /* Delete confirm row */
              if (deleteId === opt.value) return (
                <li key={opt.value} className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-red-700">Delete "{opt.label}"?</span>
                  <button
                    type="button"
                    onClick={e => confirmDelete(e, opt)}
                    disabled={deleteBusy}
                    className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )

              /* Normal row */
              return (
                <li key={opt.value} className="group flex items-center rounded-md hover:bg-gray-50">
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    onClick={() => select(opt)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm text-gray-700"
                  >
                    <Check className={cn('h-3.5 w-3.5 shrink-0 text-brand-teal', opt.value !== value && 'invisible')} />
                    <span className="truncate">{opt.label}</span>
                  </button>

                  {hasManage && (
                    <span className="flex shrink-0 items-center gap-1 pr-1.5">
                      {onEdit && (
                        <button
                          type="button"
                          title="Rename"
                          onClick={e => beginEdit(e, opt)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          title="Delete"
                          onClick={e => beginDelete(e, opt)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  )}
                </li>
              )
            })}

            {/* Create option */}
            {showCreate && (
              <li className="mt-1 border-t border-gray-100 pt-1">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/5 disabled:opacity-60"
                >
                  {creating
                    ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    : <Plus className="h-3.5 w-3.5 shrink-0" />
                  }
                  {creating ? 'Creating…' : `${createLabel} "${queryTrimmed}"`}
                </button>
              </li>
            )}

          </ul>
        </div>,
        document.body
      )}
    </div>
  )
}
