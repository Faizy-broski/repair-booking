'use client'

const DOTS = 8
const SIZE_MAP = {
  sm: { container: 20, dot: 3,   radius: 7  },
  md: { container: 28, dot: 4,   radius: 10 },
  lg: { container: 36, dot: 5.5, radius: 13 },
}

interface BrandSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
}

export function BrandSpinner({ size = 'md' }: BrandSpinnerProps) {
  const { container, dot, radius } = SIZE_MAP[size]

  return (
    <div style={{ width: container, height: container, position: 'relative', flexShrink: 0 }}>
      {Array.from({ length: DOTS }).map((_, i) => {
        const rad = (i / DOTS) * 2 * Math.PI
        const x = radius * Math.sin(rad) + container / 2 - dot / 2
        const y = -radius * Math.cos(rad) + container / 2 - dot / 2
        return (
          <span
            key={i}
            className="brand-dot"
            style={{
              position: 'absolute',
              width: dot,
              height: dot,
              borderRadius: '50%',
              backgroundColor: 'var(--brand-teal, #008080)',
              top: y,
              left: x,
              animationDelay: `${-(i / DOTS)}s`,
            }}
          />
        )
      })}
    </div>
  )
}
