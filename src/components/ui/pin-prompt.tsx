'use client'
/**
 * PinPrompt — reusable PIN verification modal.
 *
 * Usage:
 *   const { requestPin, PinModal } = usePinPrompt()
 *
 *   // In event handler:
 *   const ok = await requestPin('Applying discount requires manager PIN')
 *   if (ok) { // proceed with gated action }
 *
 *   // In JSX:
 *   <PinModal />
 */

import { useState, useCallback, useRef } from 'react'
import { ShieldCheck, X, Delete, Loader2 } from 'lucide-react'

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const

interface PinPromptOptions {
  /** Custom message shown above the keypad */
  message?: string
}

export function usePinPrompt() {
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('Enter your PIN to continue')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const requestPin = useCallback(
    (opts?: string | PinPromptOptions): Promise<boolean> => {
      const msg = typeof opts === 'string' ? opts : opts?.message
      setMessage(msg ?? 'Enter your PIN to continue')
      setPin('')
      setError('')
      setOpen(true)
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve
      })
    },
    []
  )

  function handleDigit(d: string) {
    if (d === '⌫') { setPin((p) => p.slice(0, -1)); return }
    if (!d) return
    if (pin.length >= 6) return
    setPin((p) => p + d)
  }

  async function handleSubmit() {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return }
    setLoading(true)
    setError('')

    const res = await fetch('/api/users/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })

    setLoading(false)

    if (res.ok) {
      setOpen(false)
      setPin('')
      resolveRef.current?.(true)
    } else {
      const json = await res.json()
      setError(json.error ?? 'Incorrect PIN')
      setPin('')
    }
  }

  function handleCancel() {
    setOpen(false)
    setPin('')
    setError('')
    resolveRef.current?.(false)
  }

  function PinModal() {
    if (!open) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="w-full max-w-xs rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-gray-900">PIN Required</span>
            </div>
            <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600 text-center">{message}</p>

            {/* PIN dots */}
            <div className="flex justify-center gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-3 w-3 rounded-full transition-colors ${
                    i < pin.length ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-center text-xs text-red-600">{error}</p>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {DIGITS.map((d, i) => (
                d === '' ? (
                  <div key={i} />
                ) : (
                  <button
                    key={i}
                    onClick={() => handleDigit(d)}
                    className={`h-12 rounded-xl text-lg font-semibold transition-colors ${
                      d === '⌫'
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-900 hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    {d === '⌫' ? <Delete className="mx-auto h-5 w-5" /> : d}
                  </button>
                )
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={pin.length < 4 || loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return { requestPin, PinModal }
}
