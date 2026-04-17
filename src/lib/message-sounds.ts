/**
 * Lightweight Web Audio API sound effects for the messaging system.
 * A single shared AudioContext is reused across calls.
 * All functions are silent no-ops when the browser blocks audio.
 */

let _ctx: AudioContext | null = null

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!_ctx || _ctx.state === 'closed') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _ctx = new (window.AudioContext ?? (window as any).webkitAudioContext)()
    }
    // Browsers suspend AudioContext until a user gesture — resume silently.
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {})
    return _ctx
  } catch {
    return null
  }
}

function tone(
  frequency: number,
  startOffset: number,
  duration: number,
  peakGain: number,
  endFrequency?: number,
): void {
  const c = ctx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  const t0 = c.currentTime + startOffset
  osc.frequency.setValueAtTime(frequency, t0)
  if (endFrequency) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, t0 + duration)
  }
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.start(t0)
  osc.stop(t0 + duration + 0.01)
}

/**
 * Soft two-note ascending bell — played when an inbound message arrives.
 * C5 (523 Hz) followed by E5 (659 Hz).
 */
export function playMessageReceived(): void {
  tone(523.25, 0,    0.45, 0.22)
  tone(659.25, 0.18, 0.45, 0.18)
}

/**
 * Quick descending whoosh — played when the user sends a message.
 */
export function playMessageSent(): void {
  tone(880, 0, 0.18, 0.12, 440)
}
