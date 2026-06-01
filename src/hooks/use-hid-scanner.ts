'use client'
import { useEffect, useRef } from 'react'

const HID_CHAR_INTERVAL_MS = 80 // chars arriving faster than this = scanner (80ms safe: humans type >150ms/char, scanners <20ms/char)
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
  // Keep a stable ref to the callback so the effect never re-runs on re-renders
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    if (!enabled) return

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
        buffer.current = ''
        isScanning.current = false

        if (code.length >= HID_MIN_LENGTH && code !== lastCode.current) {
          lastCode.current = code
          onScanRef.current(code)
          // Allow same barcode to re-trigger after dedup window
          if (dedupTimer.current) clearTimeout(dedupTimer.current)
          dedupTimer.current = setTimeout(() => {
            lastCode.current = null
          }, HID_DEDUP_MS)
        }
        return
      }

      if (e.key?.length === 1) {
        if (gap < HID_CHAR_INTERVAL_MS) {
          // Fast keystroke — definitively a scanner.
          // If a form field is focused, prevent the char from landing in it.
          // Human typing never sustains sub-30ms intervals, so this is safe.
          if (inField) {
            e.preventDefault()
            e.stopPropagation()
          }
          isScanning.current = true
          buffer.current += e.key
        } else {
          // Slow keystroke — could be first character of a new scan or human typing.
          // Always reset buffer so the first character of every scan is captured.
          // (Previously guarded by isScanning check, which caused the very first
          // character to be dropped on each fresh scan since lastCharTime starts at 0.)
          buffer.current = e.key
          isScanning.current = false
        }
      }
    }

    // Capture phase ensures we intercept before React synthetic events and
    // before the browser dispatches into focused input elements.
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      buffer.current = ''
      isScanning.current = false
    }
  }, [enabled])
}
