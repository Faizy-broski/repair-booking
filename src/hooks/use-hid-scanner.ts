'use client'
import { useEffect, useRef } from 'react'

const HID_CHAR_INTERVAL_MS = 200 // chars arriving faster than this = scanner (200ms safe: humans avg ~200ms/char, scanners <30ms/char)
const HID_MIN_LENGTH = 4        // ignore strings shorter than this
const HID_DEDUP_MS = 2000       // prevent re-firing same code within this window

interface UseHidScannerOptions {
  onScan: (code: string) => void
  enabled?: boolean
}

export function useHidScanner({ onScan, enabled = true }: UseHidScannerOptions) {
  const buffer = useRef('')
  const lastCharTime = useRef(0)
  const isScanning = useRef(false)
  const lastCode = useRef<string | null>(null)
  const dedupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    if (!enabled) {
      console.debug('[HID] Hook disabled')
      return
    }
    console.debug('[HID] Hook enabled, interval threshold:', HID_CHAR_INTERVAL_MS, 'ms')

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const inField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as HTMLElement).isContentEditable

      const now = Date.now()
      const gap = now - lastCharTime.current
      lastCharTime.current = now

      if (e.key === 'Enter') {
        const code = buffer.current.trim()
        const prevBuffer = buffer.current
        buffer.current = ''
        isScanning.current = false

        console.debug('[HID] ── ENTER received ──────────────────────')
        console.debug('[HID]   raw buffer  :', JSON.stringify(prevBuffer))
        console.debug('[HID]   trimmed code:', JSON.stringify(code))
        console.debug('[HID]   length      :', code.length, '(min:', HID_MIN_LENGTH, ')')
        console.debug('[HID]   lastCode    :', JSON.stringify(lastCode.current))
        console.debug('[HID]   will fire?  :', code.length >= HID_MIN_LENGTH && code !== lastCode.current)

        if (code.length >= HID_MIN_LENGTH && code !== lastCode.current) {
          lastCode.current = code
          console.debug('[HID] >>> FIRING onScan with:', JSON.stringify(code))
          onScanRef.current(code)
          if (dedupTimer.current) clearTimeout(dedupTimer.current)
          dedupTimer.current = setTimeout(() => {
            console.debug('[HID] Dedup window expired, same code can fire again')
            lastCode.current = null
          }, HID_DEDUP_MS)
        } else if (code.length < HID_MIN_LENGTH) {
          console.debug('[HID] DROPPED — too short (', code.length, '<', HID_MIN_LENGTH, ')')
        } else {
          console.debug('[HID] DROPPED — duplicate within dedup window')
        }
        return
      }

      if (e.key?.length === 1) {
        const path = gap < HID_CHAR_INTERVAL_MS ? 'FAST' : isScanning.current ? 'SLOW-IN-SCAN' : 'SLOW-RESET'
        console.debug(
          `[HID] key=${JSON.stringify(e.key)} gap=${gap}ms path=${path} isScanning=${isScanning.current} inField=${inField} bufferBefore=${JSON.stringify(buffer.current)}`
        )

        if (gap < HID_CHAR_INTERVAL_MS) {
          if (inField) { e.preventDefault(); e.stopPropagation() }
          isScanning.current = true
          buffer.current += e.key
        } else if (isScanning.current) {
          // Slightly slow char while already in scan mode — scanners sometimes
          // introduce a brief delay before special characters (e.g. hyphen).
          if (inField) { e.preventDefault(); e.stopPropagation() }
          buffer.current += e.key
        } else {
          // Slow keystroke, not scanning — reset to this char.
          buffer.current = e.key
          isScanning.current = false
        }

        console.debug(`[HID]   bufferAfter=${JSON.stringify(buffer.current)}`)
      } else if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
        // Log non-printable keys that might be interfering (but skip common modifiers)
        console.debug(`[HID] NON-PRINTABLE key: ${JSON.stringify(e.key)} gap=${gap}ms code=${e.code} — NOT added to buffer`)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      console.debug('[HID] Hook cleanup (disabled or unmounted)')
      window.removeEventListener('keydown', onKeyDown, true)
      buffer.current = ''
      isScanning.current = false
    }
  }, [enabled])
}
