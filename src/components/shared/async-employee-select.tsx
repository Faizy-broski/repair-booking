'use client'
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'

interface EmployeeOption {
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
  error?: string
  label?: string
  placeholder?: string
  /** Extra class names on the outer wrapper */
  className?: string
}

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
  error,
  label = 'Employee',
  placeholder = 'Type to search employees…',
  className,
}: AsyncEmployeeSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<EmployeeOption | null>(null)
  const [debouncedQ, setDebouncedQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
  }

  function clear() {
    setSelected(null)
    setQuery('')
    onChange('')
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className ?? ''}`}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-on-surface">
          {label}
        </label>
      )}

      {selected ? (
        <div className="flex h-9 items-center justify-between rounded-lg border border-outline-variant bg-surface px-3 text-sm text-on-surface">
          <span>
            {selected.first_name} {selected.last_name ?? ''}
            {selected.role ? <span className="ml-1.5 text-xs text-on-surface-variant">· {selected.role}</span> : null}
          </span>
          <button type="button" onClick={clear} className="ml-2 text-on-surface-variant hover:text-on-surface transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
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
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-outline-variant bg-surface shadow-lg max-h-52 overflow-y-auto">
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
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-container-low transition-colors"
              >
                <span className="font-medium text-on-surface">
                  {emp.first_name} {emp.last_name ?? ''}
                </span>
                {emp.role && <span className="text-xs text-on-surface-variant capitalize">· {emp.role.replace(/_/g, ' ')}</span>}
              </button>
            ))
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}
