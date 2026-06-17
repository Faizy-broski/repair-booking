import type { CSSProperties } from 'react'

const DEFAULT_BRAND = '#008080'
const HEX_RE = /^#([0-9a-fA-F]{6})$/

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  if (s === 0) {
    const v = Math.round(l * 255)
    return rgbToHex(v, v, v)
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hNorm = h / 360
  return rgbToHex(
    Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hNorm) * 255),
    Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  )
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return [r, g, b].reduce((acc, c, i) => {
    const s = c / 255
    const lin = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    return acc + lin * [0.2126, 0.7152, 0.0722][i]
  }, 0)
}

/**
 * Given a tenant brand hex, returns a fully self-contained map of CSS custom
 * property overrides covering the entire primary-family token set. Every value
 * is explicitly computed here so the override works via inline style without
 * relying on any CSS var() chain resolution in the stylesheet.
 */
export function getBrandStyle(brandColor: string | null | undefined): CSSProperties {
  const hex = brandColor && HEX_RE.test(brandColor) ? brandColor : DEFAULT_BRAND
  const [h, s, l] = hexToHsl(hex)

  const dim       = hslToHex(h, s, Math.max(0, l - 0.2))
  const container = hslToHex(h, Math.max(0, s - 0.1), Math.min(0.95, l + 0.55))
  const fixedDim  = hslToHex(h, Math.max(0, s - 0.05), Math.min(0.92, l + 0.45))

  const isLight = relativeLuminance(hexToRgb(hex)) > 0.45
  const onPrimary = isLight ? '#1a1a1a' : '#ffffff'
  const onContainer = hslToHex(h, s, Math.max(0.05, l - 0.35))

  // Dark sidebar background: same hue, moderate saturation, very low lightness
  const sidebarBg = hslToHex(h, Math.min(0.6, s * 0.9), 0.13)

  return {
    '--brand-primary':            hex,
    '--primary':                  hex,
    '--primary-dim':              dim,
    '--primary-fixed':            container,
    '--primary-fixed-dim':        fixedDim,
    '--primary-container':        container,
    '--inverse-primary':          container,
    '--surface-tint':             hex,
    '--brand-teal':               hex,
    '--brand-teal-dark':          dim,
    '--brand-teal-light':         container,
    '--on-primary':               onPrimary,
    '--on-primary-container':     onContainer,
    '--on-primary-fixed':         onContainer,
    '--on-primary-fixed-variant': onContainer,
    '--sidebar-bg':               sidebarBg,
  } as CSSProperties
}
