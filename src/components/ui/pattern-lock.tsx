'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { RotateCcw } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PatternLockProps {
  /** Called when user lifts pointer after drawing ≥2 nodes */
  onChange: (pattern: string) => void
  /** Current encoded value, e.g. "0-1-4-8" */
  value?: string
  /** Grid dimension in pixels. Default 220. */
  size?: number
  /** Whether to show the dots-only preview (read-only replay of saved pattern) */
  readOnly?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLS = 3
const ROWS = 3
const NODES = COLS * ROWS // 9

/** Map node index → {cx, cy} relative to canvas size */
function nodeCenter(idx: number, size: number) {
  const col = idx % COLS
  const row = Math.floor(idx / COLS)
  const pad = size / (COLS + 1)
  return { cx: pad * (col + 1), cy: pad * (row + 1) }
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

/** Decode stored string "0-1-4-8" → number[] */
function decode(value: string): number[] {
  if (!value) return []
  return value.split('-').map(Number).filter(n => !isNaN(n) && n >= 0 && n < NODES)
}

/** Encode path → "0-1-4-8" */
function encode(path: number[]): string {
  return path.join('-')
}

// ── Theme constants ───────────────────────────────────────────────────────────

const DOT_R    = 6    // outer dot radius
const HIT_R    = 26   // hit-test radius
const INNER_R  = 3    // filled inner dot
const LINE_CLR = '#0d9488'   // brand-teal
const DOT_CLR  = '#0d9488'
const DOT_IDLE = '#d1d5db'   // gray-300
const ERR_CLR  = '#ef4444'   // red-500

// ── Component ─────────────────────────────────────────────────────────────────

export function PatternLock({ onChange, value = '', size = 220, readOnly = false }: PatternLockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef  = useRef({
    path:      [] as number[],   // selected node indices in order
    dragging:  false,
    curX:      0,
    curY:      0,
    error:     false,            // flash red momentarily on short pattern
    rafId:     0,
  })
  const [patternSet, setPatternSet] = useState(false)

  // ── Draw ─────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const s   = stateRef.current
    const dpr = window.devicePixelRatio || 1

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)

    const isError = s.error
    const lineColor = isError ? ERR_CLR : LINE_CLR

    // Draw connecting lines between selected nodes
    if (s.path.length > 1) {
      ctx.strokeStyle = lineColor
      ctx.lineWidth   = 2.5
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      s.path.forEach((idx, i) => {
        const { cx, cy } = nodeCenter(idx, size)
        i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy)
      })
      ctx.stroke()
    }

    // Draw trailing line to current pointer (while dragging)
    if (s.dragging && s.path.length > 0) {
      const last = nodeCenter(s.path[s.path.length - 1], size)
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = lineColor
      ctx.lineWidth   = 2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(last.cx, last.cy)
      ctx.lineTo(s.curX, s.curY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.globalAlpha = 1

    // Draw dots
    for (let i = 0; i < NODES; i++) {
      const { cx, cy } = nodeCenter(i, size)
      const selected = s.path.includes(i)

      // Outer ring
      ctx.beginPath()
      ctx.arc(cx, cy, DOT_R, 0, Math.PI * 2)
      if (selected) {
        ctx.strokeStyle = isError ? ERR_CLR : DOT_CLR
        ctx.lineWidth   = 2
        ctx.stroke()
        // filled inner
        ctx.beginPath()
        ctx.arc(cx, cy, INNER_R + 1, 0, Math.PI * 2)
        ctx.fillStyle = isError ? ERR_CLR : DOT_CLR
        ctx.fill()
      } else {
        ctx.fillStyle = DOT_IDLE
        ctx.fill()
      }
    }

    ctx.restore()
  }, [size])

  // ── Pointer handlers ─────────────────────────────────────────────────────

  const getPointerPos = (e: PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / (canvas.clientWidth * (window.devicePixelRatio || 1))),
      y: (e.clientY - rect.top)  * (canvas.height / (canvas.clientHeight * (window.devicePixelRatio || 1))),
    }
  }

  const hitTest = useCallback((x: number, y: number): number | null => {
    for (let i = 0; i < NODES; i++) {
      const { cx, cy } = nodeCenter(i, size)
      if (dist(x, y, cx, cy) <= HIT_R) return i
    }
    return null
  }, [size])

  const scheduleFrame = useCallback(() => {
    const s = stateRef.current
    cancelAnimationFrame(s.rafId)
    s.rafId = requestAnimationFrame(draw)
  }, [draw])

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (readOnly) return
    const canvas = canvasRef.current!
    canvas.setPointerCapture(e.pointerId)
    const { x, y } = getPointerPos(e)
    const s = stateRef.current
    s.dragging = true
    s.path     = []
    s.error    = false
    s.curX     = x
    s.curY     = y
    setPatternSet(false)

    const hit = hitTest(x, y)
    if (hit !== null) s.path.push(hit)
    scheduleFrame()
  }, [readOnly, hitTest, scheduleFrame])

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!stateRef.current.dragging) return
    const { x, y } = getPointerPos(e)
    const s = stateRef.current
    s.curX = x
    s.curY = y

    const hit = hitTest(x, y)
    if (hit !== null && !s.path.includes(hit)) {
      s.path.push(hit)
    }
    scheduleFrame()
  }, [hitTest, scheduleFrame])

  const onPointerUp = useCallback(() => {
    const s = stateRef.current
    if (!s.dragging) return
    s.dragging = false

    if (s.path.length >= 2) {
      onChange(encode(s.path))
      setPatternSet(true)
    } else {
      // flash error
      s.error = true
      scheduleFrame()
      setTimeout(() => {
        s.error = false
        s.path  = []
        scheduleFrame()
        setPatternSet(false)
      }, 600)
    }
    scheduleFrame()
  }, [onChange, scheduleFrame])

  // ── Mount / resize ───────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // HiDPI
    const dpr = window.devicePixelRatio || 1
    canvas.width  = size * dpr
    canvas.height = size * dpr
    canvas.style.width  = `${size}px`
    canvas.style.height = `${size}px`

    // Attach pointer listeners
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup',   onPointerUp)
    canvas.addEventListener('pointerleave', onPointerUp)

    // Replay stored value if read-only / initial
    if (value) {
      stateRef.current.path = decode(value)
      setPatternSet(true)
    }

    draw()

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup',   onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerUp)
      cancelAnimationFrame(stateRef.current.rafId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, readOnly])

  // Redraw when external value changes
  useEffect(() => {
    if (value !== encode(stateRef.current.path)) {
      stateRef.current.path = decode(value)
      setPatternSet(!!value)
      draw()
    }
  }, [value, draw])

  function reset() {
    stateRef.current.path  = []
    stateRef.current.error = false
    setPatternSet(false)
    onChange('')
    scheduleFrame()
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Canvas */}
      <div className="relative rounded-2xl border border-gray-200 bg-gray-50 p-2 shadow-inner select-none">
        <canvas
          ref={canvasRef}
          className={`block touch-none ${readOnly ? 'cursor-default' : 'cursor-crosshair'}`}
          aria-label="Pattern lock grid"
        />
      </div>

      {/* Status row */}
      <div className="flex items-center gap-3 w-full">
        {patternSet ? (
          <span className="flex-1 text-xs font-medium text-teal-600 text-center">
            Pattern set · {stateRef.current.path.length} nodes
          </span>
        ) : (
          <span className="flex-1 text-xs text-gray-400 text-center">
            {readOnly ? 'No pattern set' : 'Draw a pattern connecting ≥2 dots'}
          </span>
        )}
        {!readOnly && patternSet && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>
    </div>
  )
}
