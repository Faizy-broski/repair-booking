/**
 * Normalises a user-typed website into a full URL. Accepts bare domains
 * ("premiermobiletyre.co.uk", "www.shop.com/contact") as well as full URLs,
 * adding https:// when no scheme is given.
 *
 * Returns '' for empty input and null when the value isn't a plausible
 * website (no dot-separated domain, spaces, non-http scheme, etc).
 */
export function normalizeWebsiteUrl(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return ''
  if (/\s/.test(raw)) return null

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  // Require a real-looking domain: labels of letters/digits/hyphens and a TLD of 2+ letters
  // (covers .com, .co.uk, .store, internationalised punycode xn-- TLDs, etc).
  const host = url.hostname
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(host)) return null

  // Drop the lone trailing slash new URL() adds for bare domains
  const out = url.toString()
  return url.pathname === '/' && !url.search && !url.hash ? out.slice(0, -1) : out
}
