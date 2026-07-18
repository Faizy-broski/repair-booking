/** Derives a free, key-less Google Maps embed src from a pasted Maps share link. */
export function parseGoogleMapsLink(url: string): { embedSrc: string | null } {
  const trimmed = url.trim()
  if (!trimmed) return { embedSrc: null }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { embedSrc: null }
  }

  if (!/maps/i.test(parsed.hostname) && !/maps/i.test(parsed.pathname)) {
    return { embedSrc: null }
  }

  // Shortened links (maps.app.goo.gl, goo.gl/maps/...) redirect server-side and
  // can't be resolved into an embeddable src client-side.
  if (parsed.hostname === 'maps.app.goo.gl' || parsed.hostname === 'goo.gl') {
    return { embedSrc: null }
  }

  // The `!3d<lat>!4d<lng>` pair in the `data=` blob is the exact pinned location —
  // more precise than the `@lat,lng` viewport center, which just reflects wherever
  // the map happened to be scrolled/zoomed when the link was generated.
  const pinMatch = parsed.pathname.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (pinMatch) {
    const [, lat, lng] = pinMatch
    return { embedSrc: `https://www.google.com/maps?q=${lat},${lng}&output=embed` }
  }

  const placeMatch = parsed.pathname.match(/\/maps\/place\/([^/@]+)/)
  if (placeMatch) {
    const place = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
    return { embedSrc: `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed` }
  }

  const q = parsed.searchParams.get('q')
  if (q) {
    return { embedSrc: `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed` }
  }

  const coordMatch = parsed.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (coordMatch) {
    const [, lat, lng] = coordMatch
    return { embedSrc: `https://www.google.com/maps?q=${lat},${lng}&output=embed` }
  }

  return { embedSrc: null }
}
