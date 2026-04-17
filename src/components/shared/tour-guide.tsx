'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Wrench, Package, Users, Calendar,
  DollarSign, BarChart2, MessageSquare, FileText, Gift, Settings,
  UserCheck, Star, Sparkles, CheckCircle, Receipt, ChevronLeft,
  ChevronRight, X, Check,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { useTour, buildTourSteps, type TourStep } from '@/hooks/use-tour'
import type { ModuleName } from '@/types/module-config'

// ── Icon map ──────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, ShoppingCart, Wrench, Package, Users, Calendar,
  DollarSign, BarChart2, MessageSquare, FileText, Gift, Settings,
  UserCheck, Star, Sparkles, CheckCircle, Receipt,
}

// ── Brand color fetch ─────────────────────────────────────────────────────────
async function fetchBrandColor(): Promise<string> {
  try {
    const res = await fetch('/api/settings/invoice', { cache: 'no-store' })
    if (!res.ok) return '#008080'
    const json = await res.json()
    return json?.data?.primary_color ?? '#008080'
  } catch {
    return '#008080'
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Spotlight geometry ────────────────────────────────────────────────────────
interface SpotRect { top: number; left: number; width: number; height: number }

const SPOT_PAD = 10   // px padding around spotlighted element
const CARD_W   = 380  // max card width
const CARD_EST = 400  // estimated card height for positioning

function computeCardStyle(spot: SpotRect | null): React.CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 12
  const cardW = Math.min(CARD_W, vw - margin * 2)
  const maxH = vh - margin * 2

  // Mobile (< 480px): always bottom-sheet style, centered
  if (vw < 480) {
    return {
      position: 'fixed',
      bottom: margin,
      left: margin,
      right: margin,
      width: 'auto',
      maxHeight: maxH,
      overflowY: 'auto',
    }
  }

  // No target → centre
  if (!spot) {
    return {
      position: 'fixed',
      top:  Math.max(margin, (vh - CARD_EST) / 2),
      left: Math.max(margin, (vw - cardW)   / 2),
      width: cardW,
      maxHeight: maxH,
      overflowY: 'auto',
    }
  }

  // Try placing to the RIGHT of the spotlight
  const rightLeft = spot.left + spot.width + SPOT_PAD + 12
  if (rightLeft + cardW <= vw - margin) {
    return {
      position: 'fixed',
      left: rightLeft,
      top: Math.max(margin, Math.min(spot.top - SPOT_PAD, vh - CARD_EST - margin)),
      width: cardW,
      maxHeight: maxH,
      overflowY: 'auto',
    }
  }

  // Try BELOW
  const belowTop = spot.top + spot.height + SPOT_PAD + 12
  if (belowTop + CARD_EST <= vh - margin) {
    return {
      position: 'fixed',
      top:  belowTop,
      left: Math.max(margin, Math.min(spot.left, vw - cardW - margin)),
      width: cardW,
      maxHeight: maxH,
      overflowY: 'auto',
    }
  }

  // Try ABOVE
  const aboveTop = spot.top - SPOT_PAD - 12 - CARD_EST
  if (aboveTop >= margin) {
    return {
      position: 'fixed',
      top:  aboveTop,
      left: Math.max(margin, Math.min(spot.left, vw - cardW - margin)),
      width: cardW,
      maxHeight: maxH,
      overflowY: 'auto',
    }
  }

  // Centre fallback
  return {
    position: 'fixed',
    top:  Math.max(margin, (vh - CARD_EST) / 2),
    left: Math.max(margin, (vw - cardW)   / 2),
    width: cardW,
    maxHeight: maxH,
    overflowY: 'auto',
  }
}

// ── SVG overlay with cut-out spotlight ───────────────────────────────────────
function SpotlightOverlay({ spot }: { spot: SpotRect | null }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1920
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080

  if (!spot) {
    // Solid dim overlay (no hole) for welcome/finish
    return (
      <div
        className="fixed inset-0 z-[9998]"
        style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(2px)' }}
        aria-hidden="true"
      />
    )
  }

  const rx = spot.left   - SPOT_PAD
  const ry = spot.top    - SPOT_PAD
  const rw = spot.width  + SPOT_PAD * 2
  const rh = spot.height + SPOT_PAD * 2
  const radius = 8

  return (
    <svg
      className="fixed inset-0 z-[9998] pointer-events-none"
      width={vw}
      height={vh}
      viewBox={`0 0 ${vw} ${vh}`}
      aria-hidden="true"
      style={{ position: 'fixed', top: 0, left: 0 }}
    >
      <defs>
        <mask id="tour-spotlight-mask">
          {/* White = show overlay; black = transparent hole */}
          <rect width={vw} height={vh} fill="white" />
          <rect x={rx} y={ry} width={rw} height={rh} rx={radius} fill="black" />
        </mask>
      </defs>
      {/* Dark overlay with the hole */}
      <rect
        width={vw}
        height={vh}
        fill="rgba(0,0,0,0.65)"
        mask="url(#tour-spotlight-mask)"
      />
      {/* Coloured ring around the spotlight — drawn separately so it's always visible */}
      <rect
        x={rx - 2}
        y={ry - 2}
        width={rw + 4}
        height={rh + 4}
        rx={radius + 2}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={2}
      />
    </svg>
  )
}

// ── Animated arrow pointing at the spotlight ─────────────────────────────────
function Arrow({ spot, brandColor }: { spot: SpotRect; brandColor: string }) {
  // Arrow sits to the left of the card (pointing left → toward the sidebar item).
  // Only rendered when spotlight exists.
  const cx = spot.left + spot.width + SPOT_PAD + 4
  const cy = spot.top  + spot.height / 2

  return (
    <div
      className="fixed z-[10000] pointer-events-none animate-bounce"
      style={{ left: cx, top: cy - 8, transform: 'translateY(0)' }}
      aria-hidden="true"
    >
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
        <path d="M0 8 L16 0 L16 5 L24 5 L24 11 L16 11 L16 16 Z" fill={brandColor} opacity={0.9} />
      </svg>
    </div>
  )
}

// ── Step card ─────────────────────────────────────────────────────────────────
interface StepCardProps {
  step: TourStep
  stepIndex: number
  totalSteps: number
  brandColor: string
  cardStyle: React.CSSProperties
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

function StepCard({ step, stepIndex, totalSteps, brandColor, cardStyle, onNext, onBack, onSkip }: StepCardProps) {
  const Icon = ICON_MAP[step.iconName] ?? Sparkles
  const isFirst = stepIndex === 0
  const isLast  = stepIndex === totalSteps - 1

  return (
    <div
      className="fixed z-[10001] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      style={{ ...cardStyle, background: '#ffffff' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Tour step ${stepIndex + 1} of ${totalSteps}: ${step.title}`}
    >
      {/* Top colour bar */}
      <div style={{ height: 4, background: brandColor }} />

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%`, background: brandColor }}
        />
      </div>

      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ background: hexToRgba(step.accentColor, 0.12), color: step.accentColor }}
          >
            <Icon className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-medium text-gray-400">{stepIndex + 1} / {totalSteps}</span>
            <button
              onClick={onSkip}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Skip tour"
            >
              <X className="h-3 w-3" /> Skip tour
            </button>
          </div>
        </div>

        <h2 className="mt-3 text-lg font-bold text-gray-900 leading-tight">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{step.description}</p>

        {step.bullets && step.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {step.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-gray-600">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ background: hexToRgba(brandColor, 0.12) }}
                >
                  <Check className="h-2.5 w-2.5" style={{ color: brandColor }} strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 px-5 pb-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === stepIndex ? 18 : 6,
              height: 6,
              background: i === stepIndex ? brandColor : hexToRgba(brandColor, 0.22),
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-2">
        <button
          onClick={onBack}
          disabled={isFirst}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
          style={{ background: brandColor }}
        >
          {isLast ? <><CheckCircle className="h-4 w-4" /> Get Started</> : <>Next <ChevronRight className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  )
}

// ── Main exported component ───────────────────────────────────────────────────

export function TourGuide() {
  const { profile } = useAuthStore()
  const { configs }  = useModuleConfigStore()
  const router = useRouter()

  const { isActive, stepIndex, next, back, finish } = useTour(profile?.id ?? null)

  const [brandColor, setBrandColor]   = useState('#008080')
  const [spotRect,   setSpotRect]     = useState<SpotRect | null>(null)
  const [mounted,    setMounted]      = useState(false)
  const [dimensions, setDimensions]   = useState({ vw: 1920, vh: 1080 })

  const colorFetched = useRef(false)
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setMounted(true), [])

  // Fetch brand color once
  useEffect(() => {
    if (isActive && !colorFetched.current) {
      colorFetched.current = true
      fetchBrandColor().then(setBrandColor)
    }
  }, [isActive])

  // Track window size for SVG overlay
  useEffect(() => {
    function update() { setDimensions({ vw: window.innerWidth, vh: window.innerHeight }) }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Build filtered step list
  const steps: TourStep[] = (() => {
    if (!configs || !profile) return []
    const enabled = new Set<ModuleName>(
      Object.entries(configs)
        .filter(([, cfg]) => cfg._meta?.is_enabled)
        .map(([key]) => key as ModuleName)
    )
    return buildTourSteps(enabled, profile.role)
  })()

  const totalSteps   = steps.length
  const currentStep  = steps[stepIndex]

  // ── Spotlight: find the target DOM element with retry ─────────────────────
  const resolveSpot = useCallback(() => {
    if (!currentStep?.targetSelector) {
      setSpotRect(null)
      return
    }
    const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null
    if (el) {
      // Scroll the sidebar item into view so it's guaranteed visible
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      const r = el.getBoundingClientRect()
      setSpotRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    } else {
      setSpotRect(null)
    }
  }, [currentStep])

  useEffect(() => {
    if (!isActive || !currentStep) return

    // 1. Navigate to the step's page
    router.push(currentStep.href)

    // 2. Clear stale spotlight immediately
    setSpotRect(null)

    // 3. Retry finding the element to give the sidebar time to render
    if (retryTimer.current) clearTimeout(retryTimer.current)
    let attempt = 0
    function tryFind() {
      if (!currentStep?.targetSelector) { setSpotRect(null); return }
      const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        const r = el.getBoundingClientRect()
        setSpotRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else if (attempt < 10) {
        attempt++
        retryTimer.current = setTimeout(tryFind, 120)
      } else {
        setSpotRect(null)
      }
    }
    retryTimer.current = setTimeout(tryFind, 250)

    return () => { if (retryTimer.current) clearTimeout(retryTimer.current) }
  }, [isActive, stepIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-measure on resize
  useEffect(() => {
    if (!isActive) return
    resolveSpot()
  }, [dimensions, resolveSpot, isActive])

  const handleNext = () => { if (stepIndex >= totalSteps - 1) finish(); else next(totalSteps) }
  const handleBack = () => back()
  const handleSkip = () => finish()

  if (!mounted || !isActive || !currentStep || totalSteps === 0) return null

  const cardStyle = computeCardStyle(spotRect)

  return createPortal(
    <>
      {/* SVG spotlight overlay */}
      <SpotlightOverlay spot={spotRect} />

      {/* Animated arrow pointing toward the spotlighted element */}
      {spotRect && <Arrow spot={spotRect} brandColor={brandColor} />}

      {/* Step card */}
      <StepCard
        step={currentStep}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        brandColor={brandColor}
        cardStyle={cardStyle}
        onNext={handleNext}
        onBack={handleBack}
        onSkip={handleSkip}
      />
    </>,
    document.body
  )
}

export { useTour }
