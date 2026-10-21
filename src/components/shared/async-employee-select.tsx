'use client'
import { useState, useEffect, useRef, useImperativeHandle } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Plus, Loader2 } from 'lucide-react'

/** Imperative controls — e.g. a "+ New" button next to the label. */
export interface EmployeeSelectHandle {
  /** Clear any selection, open the picker and focus the search box ready to type a new name. */
  startCreate: () => void
}

export interface EmployeeOption {
  id: string
  first_name: string
  last_name: string | null
  role: string | null
}

interface AsyncEmployeeSelectProps {
  branchId: string
  /** Controlled selected employee ID */
  value: string
  onChange: (id: string) => void
  /** Optional: also receive the full employee object on selection */
  onEmployeeChange?: (emp: EmployeeOption | null) => void
  error?: string
  label?: string
  placeholder?: string
  /** Open the dropdown upward instead of downward */
  openUpward?: boolean
  /** Extra class names on the outer wrapper */
  className?: string
  /**
   * When provided, shows a "+ New" quick-create row in the dropdown so an
   * employee who isn't in the system yet can be added on the spot instead of
   * blocking the flow on a trip to the Employees page. Opt-in — existing call
   * sites are unaffected unless they pass this.
   */
  onCreateNew?: (name: string) => Promise<EmployeeOption | null>
  createLabel?: string
  /**
   * Set this after selecting/creating an employee from OUTSIDE this component
   * (e.g. a standalone "+ New Fitter" button elsewhere on the page) so the
   * "selected" pill below reflects it. The component reads it once and does
   * not otherwise use it — `value`/`onChange` stay the source of truth.
   */
  externalSelection?: EmployeeOption | null
  /** Exposes startCreate() so an outside "+ New" button can jump straight into typing a name. */
  controlRef?: React.Ref<EmployeeSelectHandle>
}

/** Optimistic, not-yet-saved employees carry a "pending:" temp id. */
const isPendingId = (id: string) => id.startsWith('pending:')

/**
 * Async autocomplete for selecting an employee.
 *
 * - Starts empty; fires no requests until the user types.
 * - 300 ms debounce, max 10 results per request.
 * - Never fetches the entire employees table.
 */
export function AsyncEmployeeSelect({
  branchId,
  value,
  onChange,
  onEmployeeChange,
  error,
  label = 'Employee',
  placeholder = 'Type to search employees…',
  openUpward = false,
  className,
  onCreateNew,
  createLabel = 'New',
  externalSelection,
  controlRef,
}: AsyncEmployeeSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<EmployeeOption | null>(null)
  const [debouncedQ, setDebouncedQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)

  useImperativeHandle(controlRef, () => ({
    startCreate() {
      if (selected) clear()
      setOpen(true)
      // The input only mounts once nothing is selected — focus on the next frame
      requestAnimationFrame(() => inputRef.current?.focus())
    },
  }))

  // Debounce input → debouncedQ (300 ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQ(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // When external value is cleared, reset internal state
  useEffect(() => {
    if (!value) { setSelected(null); setQuery('') }
  }, [value])

  // Reflect a selection made outside this component (e.g. a standalone
  // "+ New Fitter" button elsewhere on the page).
  useEffect(() => {
    if (externalSelection && externalSelection.id === value) {
      setSelected(externalSelection)
      setOpen(false)
    }
  }, [externalSelection, value])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['employee-search', branchId, debouncedQ],
    queryFn: async () => {
      const res = await fetch(
        `/api/employees/search?branch_id=${branchId}&q=${encodeURIComponent(debouncedQ)}`
      )
      const json = await res.json()
      return (json.data ?? []) as EmployeeOption[]
    },
    enabled: open && !selected,
    staleTime: 30_000,
  })

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectEmployee(emp: EmployeeOption) {
    setSelected(emp)
    setQuery('')
    setOpen(false)
    onChange(emp.id)
    onEmployeeChange?.(emp)
  }

  function clear() {
    setSelected(null)
    setQuery('')
    onChange('')
    onEmployeeChange?.(null)
  }

  // Enter: pick the exact name match if there is one, otherwise create it (when allowed)
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const name = query.trim()
    if (!name) return
    e.preventDefault()
    const lower = name.toLowerCase()
    const exact = results.find((r) => `${r.first_name} ${r.last_name ?? ''}`.trim().toLowerCase() === lower)
    if (exact) selectEmployee(exact)
    else if (onCreateNew) createNew()
    else if (results.length === 1) selectEmployee(results[0])
  }

  async function createNew() {
    const name = query.trim()
    if (!name || !onCreateNew || creating) return
    setCreating(true)
    try {
      const emp = await onCreateNew(name)
      if (emp) selectEmployee(emp)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className ?? ''}`}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-on-surface">
          {label}
        </label>
      )}

      {selected ? (
        <div className="flex h-9 items-center justify-between overflow-hidden rounded-lg border border-outline-variant bg-surface px-3 text-sm text-on-surface">
          <span className="min-w-0 truncate whitespace-nowrap">
            {selected.first_name} {selected.last_name ?? ''}
            {isPendingId(selected.id)
              ? <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-on-surface-variant"><Loader2 className="h-3 w-3 animate-spin" /> saving…</span>
              : selected.role ? <span className="ml-1.5 text-xs text-on-surface-variant">· {selected.role}</span> : null}
          </span>
          <button type="button" onClick={clear} className="ml-2 shrink-0 text-on-surface-variant hover:text-on-surface transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className={[
              'h-9 w-full rounded-lg border bg-surface pl-9 pr-8 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-brand-teal/20 transition-colors',
              error
                ? 'border-error focus:border-error'
                : 'border-outline-variant focus:border-brand-teal',
            ].join(' ')}
          />
          {isFetching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
            </span>
          )}
        </div>
      )}

      {open && !selected && (
        <div className={`absolute z-50 w-full rounded-lg border border-outline-variant bg-surface shadow-lg max-h-52 overflow-y-auto ${openUpward ? 'bottom-full mb-1' : 'mt-1'}`}>
          {results.length === 0 && !isFetching ? (
            <p className="px-3 py-2.5 text-sm text-on-surface-variant">
              {query.length === 0 ? 'Type to search employees' : 'No employees found'}
            </p>
          ) : (
            results.map(emp => (
              <button
                key={emp.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectEmployee(emp)}
                className="flex w-full items-center gap-1.5 overflow-hidden px-3 py-2.5 text-left text-sm hover:bg-surface-container-low transition-colors"
              >
                <span className="min-w-0 truncate whitespace-nowrap font-medium text-on-surface">
                  {emp.first_name} {emp.last_name ?? ''}
                </span>
                {emp.role && <span className="shrink-0 text-xs text-on-surface-variant capitalize">· {emp.role.replace(/_/g, ' ')}</span>}
              </button>
            ))
          )}
          {onCreateNew && query.trim().length > 0 && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={createNew}
              disabled={creating}
              className="flex w-full items-center gap-2 border-t border-outline-variant px-3 py-2.5 text-left text-sm font-medium text-brand-teal hover:bg-teal-50 transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {createLabel} &quot;{query.trim()}&quot;
              <kbd className="ml-auto rounded border border-outline-variant px-1 text-[10px] font-normal text-on-surface-variant">Enter</kbd>
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}
