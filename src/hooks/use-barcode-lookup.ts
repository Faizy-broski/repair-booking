'use client'
import { useState, useRef } from 'react'
import type { Product } from '@/types/database'

export type ProductWithStock = Product & {
  on_hand?: number
  has_variants?: boolean
  variant_count?: number
  categories?: { name: string } | null
  brands?: { name: string } | null
}

export interface QuickCreatePrefill {
  name?: string
  sku?: string
  selling_price?: number
  cost_price?: number
  barcode?: string        // override barcode shown/stored (e.g. from JSON field)
  image_url?: string
  brand?: string
}

export type ScanLookupStatus = 'found' | 'not_found' | 'error'

export interface ScanLookupResult {
  status: ScanLookupStatus
  product?: ProductWithStock
  barcode: string          // display value (what was scanned)
  lookupKey: string        // what was actually searched in the DB
  prefill?: QuickCreatePrefill
  error?: string
}

// ── Detect and parse the raw scan value ────────────────────────────────────
// Barcodes from USB scanners or webcams can be:
//   1. Plain barcode string  e.g. "5901234123457"
//   2. URL QR code           e.g. "https://example.com/product/123"
//   3. JSON QR code          e.g. '{"sku":"X1","name":"Foo","price":999}'
//
// Sending raw URLs or JSON to Supabase's ilike filter crashes with PGRST100.
// We parse first, extract a clean lookup key, and return any pre-fill data.
interface ParsedScan {
  lookupKey: string
  displayBarcode: string
  type: 'barcode' | 'json' | 'url'
  prefill?: QuickCreatePrefill
}

function parseScannedCode(raw: string): ParsedScan {
  const trimmed = raw.trim()

  // ── JSON QR code ─────────────────────────────────────────────────────────
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const name   = obj.name ?? obj.product_name ?? obj.title ?? undefined
        const sku    = obj.sku ?? obj.SKU ?? obj.product_id ?? undefined
        const price  = obj.price ?? obj.selling_price ?? obj.retail_price ?? undefined
        const barcode = obj.barcode ?? obj.upc ?? obj.ean ?? obj.gtin ?? undefined
        const brand  = obj.brand ?? obj.manufacturer ?? undefined
        const image  = obj.image ?? obj.image_url ?? obj.photo ?? undefined

        // Use sku or embedded barcode as the lookup key; fall back to raw
        const lookupKey    = sku ?? barcode ?? trimmed
        const displayLabel = sku ?? barcode ?? `[QR: ${(name as string | undefined)?.slice(0, 30) ?? 'JSON'}]`

        // Price may be in subunits (pence, paisa) or major units — pass as-is
        // and let the user verify. Don't auto-convert across currencies.
        const parsedPrice = typeof price === 'number'
          ? price
          : typeof price === 'string' ? parseFloat(price) || undefined : undefined

        return {
          lookupKey,
          displayBarcode: displayLabel,
          type: 'json',
          prefill: {
            name:          typeof name  === 'string' ? name  : undefined,
            sku:           typeof sku   === 'string' ? sku   : undefined,
            selling_price: parsedPrice,
            barcode:       typeof barcode === 'string' ? barcode : undefined,
            brand:         typeof brand === 'string' ? brand : undefined,
            image_url:     typeof image === 'string' ? image : undefined,
          },
        }
      }
    } catch {
      // Not valid JSON — fall through to plain barcode
    }
  }

  // ── URL QR code ───────────────────────────────────────────────────────────
  // Sending a URL to Supabase ilike crashes with PGRST100 (newlines in
  // encoded chars break the PostgREST filter parser). Treat as not-found
  // immediately without querying the DB.
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return {
      lookupKey: '',           // empty = skip DB lookup
      displayBarcode: trimmed,
      type: 'url',
    }
  }

  // ── Plain barcode / SKU string ────────────────────────────────────────────
  return {
    lookupKey: trimmed,
    displayBarcode: trimmed,
    type: 'barcode',
  }
}


// Validate EAN-8 / EAN-13 / UPC-A checksum so scanner misreads are dropped.
// Non-numeric or unknown-length codes pass through unchanged.
function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code)) return true
  if (code.length !== 8 && code.length !== 12 && code.length !== 13) return true
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reduce((acc, d, i) => {
    const weight = code.length === 8 ? (i % 2 === 0 ? 3 : 1) : (i % 2 === 0 ? 1 : 3)
    return acc + d * weight
  }, 0)
  return (10 - (sum % 10)) % 10 === check
}

// ── Main hook ─────────────────────────────────────────────────────────────
export function useBarcodeLookup(branchId: string | null) {
  const [isLooking, setIsLooking] = useState(false)
  // Cache successful lookups so repeat scans skip the API round-trip entirely.
  const cache = useRef<Map<string, ScanLookupResult>>(new Map())

  async function lookup(rawCode: string): Promise<ScanLookupResult> {
    if (!branchId) {
      return { status: 'error', barcode: rawCode, lookupKey: '', error: 'No branch selected' }
    }

    setIsLooking(true)
    try {
      const parsed = parseScannedCode(rawCode)
      const { lookupKey, displayBarcode, type, prefill } = parsed

      // URLs and empty keys: skip DB lookup, go straight to not_found + prefill
      if (!lookupKey || type === 'url') {
        return { status: 'not_found', barcode: displayBarcode, lookupKey: '', prefill }
      }

      // Reject numeric barcodes that fail their EAN/UPC checksum — scanner misread
      if (!isValidBarcode(lookupKey)) {
        return { status: 'error', barcode: displayBarcode, lookupKey, error: 'Invalid barcode (scanner misread)' }
      }

      // Return cached result instantly if we've seen this barcode before
      const cacheKey = `${branchId}:${lookupKey}`
      if (cache.current.has(cacheKey)) {
        return cache.current.get(cacheKey)!
      }

      // ── DB lookup ──────────────────────────────────────────────────────
      const params = new URLSearchParams({
        search:    lookupKey,
        branch_id: branchId,
        limit:     '10',
      })
      const res = await fetch(`/api/products?${params}`)

      if (!res.ok) {
        // API error (e.g. if somehow an unsafe string gets through)
        return { status: 'not_found', barcode: displayBarcode, lookupKey, prefill }
      }

      const json = await res.json()
      const products: ProductWithStock[] = json.data ?? []

      // Exact match: barcode field first, then sku
      const exact = products.find(
        (p) =>
          p.barcode === lookupKey ||
          p.sku     === lookupKey ||
          p.barcode === displayBarcode ||
          p.sku     === displayBarcode
      )

      if (exact) {
        const hit: ScanLookupResult = { status: 'found', product: exact, barcode: displayBarcode, lookupKey }
        cache.current.set(cacheKey, hit)
        return hit
      }

      const miss: ScanLookupResult = {
        status: 'not_found',
        barcode: displayBarcode,
        lookupKey,
        prefill,
      }
      cache.current.set(cacheKey, miss)
      return miss
    } catch {
      return { status: 'error', barcode: rawCode, lookupKey: '', error: 'Network error' }
    } finally {
      setIsLooking(false)
    }
  }

  return { lookup, isLooking }
}
