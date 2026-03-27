'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Plus, X, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Customer {
  id: string
  first_name: string
  last_name: string | null
  phone: string | null
  email: string | null
}

interface CustomerSearchProps {
  value: Customer | null
  onChange: (customer: Customer | null) => void
}

export function CustomerSearch({ value, onChange }: CustomerSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickAdd, setQuickAdd] = useState({ first_name: '', last_name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=8`)
      const json = await res.json()
      setResults(json.data ?? [])
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function selectCustomer(c: Customer) {
    onChange(c)
    setQuery('')
    setResults([])
    setShowDropdown(false)
    setShowQuickAdd(false)
  }

  function clear() {
    onChange(null)
    setQuery('')
  }

  async function handleQuickAdd() {
    if (!quickAdd.first_name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: quickAdd.first_name,
          last_name: quickAdd.last_name || null,
          phone: quickAdd.phone || null,
          email: quickAdd.email || null,
        }),
      })
      const json = await res.json()
      if (json.data) {
        selectCustomer(json.data)
        setQuickAdd({ first_name: '', last_name: '', phone: '', email: '' })
      }
    } finally {
      setSaving(false)
    }
  }

  // Customer already selected — show pill
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
          {value.first_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {value.first_name} {value.last_name ?? ''}
          </p>
          <p className="text-xs text-gray-500 truncate">{value.phone ?? value.email ?? 'No contact info'}</p>
        </div>
        <button onClick={clear} className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 focus-within:border-blue-500">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, phone, or email..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); setShowQuickAdd(false) }}
          onFocus={() => setShowDropdown(true)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
        {isSearching && (
          <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.length > 0 ? (
            <ul className="max-h-52 overflow-y-auto py-1">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                      {c.first_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.first_name} {c.last_name ?? ''}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{c.phone ?? c.email ?? ''}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !isSearching && (
              <div className="px-3 py-2 text-sm text-gray-500">No customers found</div>
            )
          )}

          {/* Quick-add trigger */}
          <div className="border-t border-gray-100 p-2">
            <button
              type="button"
              onClick={() => { setShowQuickAdd(true); setShowDropdown(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              Add new customer
            </button>
          </div>
        </div>
      )}

      {/* Quick-add form */}
      {showQuickAdd && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">New Customer</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="First Name *"
              placeholder="John"
              value={quickAdd.first_name}
              onChange={(e) => setQuickAdd((q) => ({ ...q, first_name: e.target.value }))}
            />
            <Input
              label="Last Name"
              placeholder="Smith"
              value={quickAdd.last_name}
              onChange={(e) => setQuickAdd((q) => ({ ...q, last_name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Phone"
              placeholder="+44..."
              value={quickAdd.phone}
              onChange={(e) => setQuickAdd((q) => ({ ...q, phone: e.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              placeholder="john@example.com"
              value={quickAdd.email}
              onChange={(e) => setQuickAdd((q) => ({ ...q, email: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" loading={saving} onClick={handleQuickAdd} disabled={!quickAdd.first_name.trim()}>
              <User className="h-3.5 w-3.5" />
              Save & Attach
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowQuickAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
