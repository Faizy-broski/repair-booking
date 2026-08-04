// Normalizes a phone number for comparison/storage. PhoneInput (src/components/ui/phone-input.tsx)
// already emits values as `+{dialCode}{digits}` with no spaces, so this mostly just
// guards against manually-typed variants (spaces, dashes, parentheses) landing in the
// same column and failing to match on lookup.
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

// wa.me requires digits only — no leading +, no spaces/dashes.
export function toWhatsAppDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}
