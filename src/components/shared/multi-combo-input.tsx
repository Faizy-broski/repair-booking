'use client'
import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

export function MultiComboInput({ values, onAdd, onRemove, options, placeholder }: {
  values: string[]
  onAdd: (v: string) => void
  onRemove: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = options.filter((o) => o.toLowerCase().includes(value.toLowerCase()) && !values.includes(o))

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-brand-teal/10 px-2 py-0.5 text-xs font-semibold text-brand-teal">
            {v}
            <button type="button" onClick={() => onRemove(v)} className="hover:text-brand-teal-dark transition-colors">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault()
              if (!values.includes(value.trim())) onAdd(value.trim())
              setValue('')
            }
          }}
          placeholder={placeholder}
          className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
        />
        {open && (value || filtered.length > 0) && (
          <ul className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {filtered.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                  onMouseDown={(e) => { e.preventDefault(); onAdd(o); setValue(''); setOpen(false) }}
                >
                  <span className="text-gray-700">{o}</span>
                </button>
              </li>
            ))}
            {value.trim() && !options.some(o => o.toLowerCase() === value.trim().toLowerCase()) && (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 border-t border-gray-100 transition-colors"
                  onMouseDown={(e) => { e.preventDefault(); onAdd(value.trim()); setValue(''); setOpen(false) }}
                >
                  <span className="text-gray-500 italic">Add &quot;{value.trim()}&quot;...</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
