'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

import validations from '@/components/layout/number-validations.json'

// ── Country data ───────────────────────────────────────────────────────────────

export interface Country {
  name: string
  iso2: string
  dialCode: string
  phoneLength?: number | number[]
  min?: number
  max?: number
}

export const COUNTRIES: Country[] = (validations as any[]).map(v => ({
  name: v.label,
  iso2: v.code,
  dialCode: v.phone.replace('-', ''),
  phoneLength: v.phoneLength,
  min: v.min,
  max: v.max,
}))

function flagEmoji(iso2: string): string {
  return iso2.toUpperCase().split('').map(c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  ).join('')
}

// ── Component ──────────────────────────────────────────────────────────────────

interface PhoneInputProps {
  value?: string
  onChange?: (value: string) => void
  error?: string
  label?: string
  placeholder?: string
  defaultCountry?: string
}

export function PhoneInput({
  value = '',
  onChange,
  error,
  label = 'Phone number',
  placeholder = '7700 900000',
  defaultCountry = 'GB',
}: PhoneInputProps) {
  const defaultC = COUNTRIES.find(c => c.iso2 === defaultCountry) ?? COUNTRIES[0]
  const [selected, setSelected] = useState<Country>(defaultC)
  const [number, setNumber] = useState('')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Parse incoming value if it starts with +
  useEffect(() => {
    if (!value) return
    const match = COUNTRIES.find(c => value.startsWith(`+${c.dialCode}`))
    if (match) {
      setSelected(match)
      setNumber(value.slice(match.dialCode.length + 1))
    } else {
      setNumber(value)
    }
  }, []) // only on mount

  const emit = useCallback((country: Country, num: string) => {
    const full = num ? `+${country.dialCode}${num.replace(/\s/g, '')}` : ''
    onChange?.(full)
  }, [onChange])

  function selectCountry(c: Country) {
    setSelected(c)
    setOpen(false)
    setSearch('')
    emit(c, number)
  }

  function handleNumber(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value.replace(/[^\d\s\-()]/g, '')
    
    // Enforce max length if defined for this country
    const digitsOnly = val.replace(/\D/g, '')
    let maxLength = 15 // Default fallback

    if (selected.phoneLength) {
      if (Array.isArray(selected.phoneLength)) {
        maxLength = Math.max(...selected.phoneLength)
      } else {
        maxLength = selected.phoneLength
      }
    } else if (selected.max) {
      maxLength = selected.max
    }

    if (digitsOnly.length > maxLength) {
      // Find the position of the character that exceeds the limit and truncate
      let count = 0
      let truncated = ''
      for (const char of val) {
        if (/\d/.test(char)) {
          count++
          if (count > maxLength) break
        }
        truncated += char
      }
      val = truncated
    }

    setNumber(val)
    emit(selected, val)
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  const filtered = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dialCode.includes(search.replace('+', ''))
      )
    : COUNTRIES

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-on-surface">{label}</label>
      )}

      <div className="flex gap-0">
        {/* Country selector */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className={`flex items-center gap-1.5 rounded-l-xl border-y border-l px-3 py-2.5 text-sm font-medium bg-surface-container hover:bg-surface-container-high transition-colors h-[42px] ${
              error ? 'border-error' : 'border-outline-variant'
            }`}
          >
            <span className="text-base leading-none">{flagEmoji(selected.iso2)}</span>
            <span className="text-on-surface">+{selected.dialCode}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute left-0 bottom-full z-50 mb-1 w-72 rounded-xl border border-outline-variant bg-surface shadow-xl overflow-hidden">
              {/* Search */}
              <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-on-surface-variant" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search country or code…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')}>
                    <X className="h-3.5 w-3.5 text-on-surface-variant" />
                  </button>
                )}
              </div>

              {/* List */}
              <ul className="max-h-56 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-on-surface-variant">No results</li>
                ) : (
                  filtered.map(c => (
                    <li key={`${c.iso2}-${c.dialCode}`}>
                      <button
                        type="button"
                        onClick={() => selectCountry(c)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-container transition-colors ${
                          selected.iso2 === c.iso2 && selected.dialCode === c.dialCode
                            ? 'bg-primary-container/40 text-primary font-medium'
                            : 'text-on-surface'
                        }`}
                      >
                        <span className="text-base w-6 text-center leading-none">{flagEmoji(c.iso2)}</span>
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 text-on-surface-variant text-xs">+{c.dialCode}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Number input */}
        <input
          type="tel"
          value={number}
          onChange={handleNumber}
          placeholder={placeholder}
          className={`flex-1 rounded-r-xl border-y border-r px-3 py-2.5 text-sm text-on-surface bg-surface outline-none placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary/30 transition h-[42px] ${
            error ? 'border-error focus:ring-error/20' : 'border-outline-variant focus:border-primary'
          }`}
        />
      </div>

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
