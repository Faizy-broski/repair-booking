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

export function formatCurrency(amount: number, currency?: string): string {
  const c = currency ?? getBusinessCurrency()
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: c }).format(amount)
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

export function generateGiftCardCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const segments = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  )
  return 'GC-' + segments.join('-')
}
