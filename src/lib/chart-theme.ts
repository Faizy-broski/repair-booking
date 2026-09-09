/**
 * Shared recharts color palette + tooltip/legend styling, all sourced from the
 * app's M3 CSS custom properties so charts follow the active theme instead of
 * hardcoding hex per chart. recharts renders inline SVG/DOM styles that don't
 * inherit the Tailwind cascade, so every color must still be passed explicitly
 * as a prop — this just gives every chart page one place to pull those from.
 */

// A rotating categorical palette for multi-series charts (pies, stacked bars).
// Built from the app's semantic tokens plus a couple of extra hues so charts
// with more series than tokens still get distinct, theme-aware colors.
export const CHART_COLORS = [
  'var(--primary)',
  'var(--tertiary)',
  'var(--secondary)',
  'var(--success)',
  'var(--warning)',
  'var(--error)',
  'var(--primary-dim)',
  'var(--tertiary-dim)',
  'var(--secondary-dim)',
  'var(--on-surface-variant)',
  'var(--outline)',
  'var(--primary-container)',
]

export const chartAxisTick = { fontSize: 12, fill: 'var(--on-surface-variant)' } as const

export const chartGridStroke = 'var(--surface-container)'

export const chartTooltipStyle = {
  contentStyle: {
    background: 'var(--surface-container-lowest)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 8,
  },
  itemStyle: { color: 'var(--on-surface)' },
  labelStyle: { color: 'var(--on-surface-variant)' },
} as const

export const chartLegendStyle = { color: 'var(--on-surface-variant)', fontSize: 13 } as const
