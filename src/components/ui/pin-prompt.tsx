'use client'
import { useState, useCallback, useRef } from 'react'
import { ShieldCheck, X, Delete, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const

interface PinPromptOptions {
  /** Custom message shown above the keypad */
  message?: string
}

export function usePinPrompt(options?: { verifyUrl?: string }) {
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

    const res = await fetch(options?.verifyUrl ?? '/api/users/verify-pin', {
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
    const { brandColor } = useAuthStore()
    if (!open) return null

    // Derive a slightly darker shade for hover states
    const hex = !brandColor || brandColor.toLowerCase() === '#008080' ? '#009C9C' : brandColor

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="w-full max-w-xs rounded-2xl bg-surface-container-lowest shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" style={{ color: hex }} />
              <span className="font-semibold text-on-surface">PIN Required</span>
            </div>
            <button onClick={handleCancel} className="text-outline hover:text-on-surface">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-on-surface-variant text-center">{message}</p>

            {/* PIN dots */}
            <div className="flex justify-center gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 w-3 rounded-full transition-colors"
                  style={{ backgroundColor: i < pin.length ? hex : '#e5e7eb' }}
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
                        ? 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                        : 'bg-surface-container-low text-on-surface'
                    }`}
                    style={d !== '⌫' ? { ['--hover-bg' as string]: hex + '18' } : undefined}
                    onMouseEnter={e => { if (d !== '⌫') (e.currentTarget as HTMLButtonElement).style.backgroundColor = hex + '18' }}
                    onMouseLeave={e => { if (d !== '⌫') (e.currentTarget as HTMLButtonElement).style.backgroundColor = '' }}
                  >
                    {d === '⌫' ? <Delete className="mx-auto h-5 w-5" /> : d}
                  </button>
                )
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={pin.length < 4 || loading}
              className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{ backgroundColor: hex }}
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
