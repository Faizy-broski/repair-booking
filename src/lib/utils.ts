import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Reads the active business currency from the auth store at call time.
// Falls back to 'GBP' if the store hasn't loaded yet.
// Lazily imported to avoid circular dependency.
function getBusinessCurrency(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('@/store/auth.store')
    return useAuthStore.getState().currency ?? 'GBP'
  } catch {
    return 'GBP'
  }
}

// Currencies where Intl outputs an undesirable symbol — map to preferred display symbol
const CURRENCY_SYMBOL_OVERRIDE: Record<string, string> = {
  PKR: 'Rs',
}

export function getCurrencySymbol(currency?: string): string {
  const c = currency ?? getBusinessCurrency()
  if (CURRENCY_SYMBOL_OVERRIDE[c]) return CURRENCY_SYMBOL_OVERRIDE[c]
  return new Intl.NumberFormat('en', { style: 'currency', currency: c, minimumFractionDigits: 0 })
    .formatToParts(0)
    .find(p => p.type === 'currency')?.value ?? c
}

function applySymbolOverride(formatted: string, c: string): string {
  const override = CURRENCY_SYMBOL_OVERRIDE[c]
  if (!override) return formatted
  // Intl may produce "PKR 1,234.00" or "PKR1,234.00" — replace the code
  return formatted.replace(c, override)
}

export function formatCurrency(amount: number, currency?: string): string {
  const c = currency ?? getBusinessCurrency()
  const locale = c === 'USD' ? 'en-US' : 'en-GB'
  return applySymbolOverride(new Intl.NumberFormat(locale, { style: 'currency', currency: c }).format(amount), c)
}

export function formatCurrencyCompact(amount: number, currency?: string): string {
  const c = currency ?? getBusinessCurrency()
  const locale = c === 'USD' ? 'en-US' : 'en-GB'
  return applySymbolOverride(new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: c,
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: Math.abs(amount) < 1000 ? 2 : 1,
  }).format(amount), c)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(date)
  )
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function truncate(str: string, length = 50): string {
  return str.length > length ? str.slice(0, length) + '…' : str
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Extracts the subdomain from a hostname.
 * Returns null for the root domain, www, localhost (no subdomain), or admin.
 * Works in both browser and server-side contexts.
 */
export function getSubdomain(hostname: string): string | null {
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'repairbooking.co.uk').split(':')[0]
  const cleanHost = hostname.split(':')[0]
  if (cleanHost === 'localhost' || cleanHost === rootDomain || cleanHost === `www.${rootDomain}`) return null
  if (cleanHost.endsWith('.localhost')) {
    const sub = cleanHost.replace('.localhost', '')
    return sub === 'admin' ? null : sub
  }
  if (cleanHost.endsWith(`.${rootDomain}`)) {
    const sub = cleanHost.replace(`.${rootDomain}`, '')
    return sub === 'admin' ? null : sub
  }
  return null
}

export function generateGiftCardCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const segments = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  )
  return 'GC-' + segments.join('-')
}

/**
 * Client-side cross-tenant guard.
 * Signs the user out and redirects to /login when the loaded profile
 * belongs to a different business than the current subdomain.
 * Call from any client component that detects a tenant mismatch.
 *
 * Dynamic imports prevent circular dependencies and keep this
 * file safe for server-side (middleware) imports.
 */
export async function signOutWrongTenant(): Promise<void> {
  const { createClient } = await import('@/lib/supabase/client')
  const { useAuthStore } = await import('@/store/auth.store')
  const { useModuleConfigStore } = await import('@/store/module-config.store')

  const supabase = createClient()
  await supabase.auth.signOut({ scope: 'local' })

  // Wipe cached Zustand state so no stale tenant data lingers
  useAuthStore.getState().clear()
  useModuleConfigStore.getState().invalidate()

  window.location.replace('/login?error=wrong_tenant')
}

export function formatStatus(status: string): string {
  if (!status) return '—'
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
