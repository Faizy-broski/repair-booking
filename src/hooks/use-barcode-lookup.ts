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
  matchedVariant?: { id: string; name: string; barcode?: string | null; sku?: string | null; selling_price?: number; cost_price?: number }
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
  console.debug('[LOOKUP] parseScannedCode — raw:', JSON.stringify(raw), '→ trimmed:', JSON.stringify(trimmed))

  // ── JSON QR code ─────────────────────────────────────────────────────────
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    console.debug('[LOOKUP] Detected JSON QR code, attempting parse…')
    try {
      const obj = JSON.parse(trimmed)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const name   = obj.name ?? obj.product_name ?? obj.title ?? undefined
        const sku    = obj.sku ?? obj.SKU ?? obj.product_id ?? undefined
        const price  = obj.price ?? obj.selling_price ?? obj.retail_price ?? undefined
        const barcode = obj.barcode ?? obj.upc ?? obj.ean ?? obj.gtin ?? undefined
        const brand  = obj.brand ?? obj.manufacturer ?? undefined
        const image  = obj.image ?? obj.image_url ?? obj.photo ?? undefined

        const lookupKey    = sku ?? barcode ?? trimmed
        const displayLabel = sku ?? barcode ?? `[QR: ${(name as string | undefined)?.slice(0, 30) ?? 'JSON'}]`

        const parsedPrice = typeof price === 'number'
          ? price
          : typeof price === 'string' ? parseFloat(price) || undefined : undefined

        console.debug('[LOOKUP] JSON parse OK — extracted:', { name, sku, price: parsedPrice, barcode, brand })
        console.debug('[LOOKUP] lookupKey:', JSON.stringify(lookupKey), 'displayLabel:', JSON.stringify(displayLabel))

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
      console.debug('[LOOKUP] JSON parsed but not a plain object — falling through')
    } catch (e) {
      console.debug('[LOOKUP] JSON parse failed:', e, '— treating as plain barcode')
    }
  }

  // ── URL QR code ───────────────────────────────────────────────────────────
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    console.debug('[LOOKUP] Detected URL QR code — skipping DB lookup:', trimmed)
    return {
      lookupKey: '',
      displayBarcode: trimmed,
      type: 'url',
    }
  }

  // ── Plain barcode / SKU string ────────────────────────────────────────────
  console.debug('[LOOKUP] Plain barcode/SKU — lookupKey:', JSON.stringify(trimmed))
  return {
    lookupKey: trimmed,
    displayBarcode: trimmed,
    type: 'barcode',
  }
}



const CACHE_TTL_MS = 60_000 // 1 minute — enough to avoid duplicate round-trips, short enough that price changes take effect quickly

// ── Main hook ─────────────────────────────────────────────────────────────
export function useBarcodeLookup(branchId: string | null) {
  const [isLooking, setIsLooking] = useState(false)
  // Only cache FOUND results with a TTL so stale prices/names are refreshed.
  // not_found results are never cached — the product might be added to inventory moments later.
  const cache = useRef<Map<string, { result: ScanLookupResult; ts: number }>>(new Map())

  // EAN/UPC formats always have their own checksum — misreads produce wrong digits.
  // QR codes have built-in error correction and must never be checksum-filtered.
  // HID (physical scanner) has its own error correction — skip checksum for those too.
  const EAN_UPC_FORMATS = new Set(['ean_13', 'ean_8', 'upc_a', 'upc_e'])

  function isValidEanChecksum(code: string): boolean {
    const digits = code.split('').map(Number)
    const check = digits.pop()!
    const sum = digits.reduce((acc, d, i) => {
      const weight = code.length === 8 ? (i % 2 === 0 ? 3 : 1) : (i % 2 === 0 ? 1 : 3)
      return acc + d * weight
    }, 0)
    const expected = (10 - (sum % 10)) % 10
    console.debug('[LOOKUP] EAN checksum: sum=', sum, 'expected=', expected, 'actual=', check, 'valid=', expected === check)
    return expected === check
  }

  async function lookup(rawCode: string, format = 'hid'): Promise<ScanLookupResult> {
    console.debug('[LOOKUP] ════════════════════════════════════════')
    console.debug('[LOOKUP] lookup() called — raw:', JSON.stringify(rawCode), 'format:', format)

    if (!branchId) {
      console.warn('[LOOKUP] No branchId — aborting')
      return { status: 'error', barcode: rawCode, lookupKey: '', error: 'No branch selected' }
    }

    setIsLooking(true)
    try {
      const parsed = parseScannedCode(rawCode)
      const { lookupKey, displayBarcode, type, prefill } = parsed
      console.debug('[LOOKUP] parsed →', { lookupKey, displayBarcode, type, prefill })

      if (!lookupKey || type === 'url') {
        console.debug('[LOOKUP] Skipping DB lookup — URL or empty key → not_found')
        return { status: 'not_found', barcode: displayBarcode, lookupKey: '', prefill }
      }

      // EAN/UPC checksum: only reject when ZXing explicitly tagged the result as
      // ean_13/ean_8/upc_a/upc_e AND the digit count matches AND checksum fails.
      // This catches ZXing misreads (e.g. CODE-128 mis-identified as EAN) while
      // letting through custom numeric barcodes, QR codes, and HID scans.
      // We do NOT reject on checksum failure alone — we log it and let it through,
      // because a CODE-128 barcode that encodes 13 custom digits will look like an
      // EAN-13 to ZXing but won't have a valid EAN check digit.
      if (EAN_UPC_FORMATS.has(format) && /^\d+$/.test(lookupKey) &&
          (lookupKey.length === 8 || lookupKey.length === 12 || lookupKey.length === 13)) {
        const valid = isValidEanChecksum(lookupKey)
        console.debug('[LOOKUP] EAN/UPC format — checksum', valid ? '✅ PASS' : '⚠ FAIL (still passing through — may be CODE-128 with custom digits)')
      } else {
        console.debug('[LOOKUP] Skipping EAN checksum — format:', format)
      }

      const cacheKey = `${branchId}:${lookupKey}`
      const cached = cache.current.get(cacheKey)
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        console.debug('[LOOKUP] Cache HIT for', JSON.stringify(cacheKey), '→', cached.result.status)
        return cached.result
      }
      console.debug('[LOOKUP] Cache MISS for', JSON.stringify(cacheKey))

      // Use barcode= (exact eq match on barcode/sku) instead of search= (fuzzy ilike)
      // so the API returns only the product with that exact barcode/sku.
      const params = new URLSearchParams({
        barcode:   lookupKey,
        branch_id: branchId,
        limit:     '5',
      })
      const url = `/api/products?${params}`
      console.debug('[LOOKUP] Fetching:', url)
      const res = await fetch(url)
      console.debug('[LOOKUP] Response status:', res.status, res.statusText)

      if (!res.ok) {
        console.warn('[LOOKUP] API error', res.status, '— returning not_found')
        return { status: 'not_found', barcode: displayBarcode, lookupKey, prefill }
      }

      const json = await res.json()
      const products: ProductWithStock[] = json.data ?? []
      console.debug('[LOOKUP] Products returned from API:', products.length)
      products.forEach((p, i) => {
        console.debug(`[LOOKUP]   [${i}] id=${p.id} barcode=${JSON.stringify(p.barcode)} sku=${JSON.stringify(p.sku)} name=${JSON.stringify(p.name)}`)
      })

      // Case-insensitive comparison — barcodes stored inconsistently in some DBs
      const lk = lookupKey.toLowerCase()
      const db = displayBarcode.toLowerCase()
      const exact = products.find(
        (p) =>
          (p.barcode?.toLowerCase() === lk) ||
          (p.sku?.toLowerCase()     === lk) ||
          (p.barcode?.toLowerCase() === db) ||
          (p.sku?.toLowerCase()     === db)
      )
      console.debug('[LOOKUP] Exact match found?', !!exact, exact ? `id=${exact.id}` : '')
      console.debug('[LOOKUP] Matching against lookupKey=', JSON.stringify(lookupKey), 'displayBarcode=', JSON.stringify(displayBarcode))

      if (exact) {
        const hit: ScanLookupResult = { status: 'found', product: exact, barcode: displayBarcode, lookupKey }
        // Only cache found results, with a TTL so price/name changes are picked up
        cache.current.set(cacheKey, { result: hit, ts: Date.now() })
        console.debug('[LOOKUP] ✅ FOUND product:', exact.name)
        return hit
      }

      // Fallback: search variant barcodes — variant barcodes live in product_variants, not products
      console.debug('[LOOKUP] No product match — trying variant barcode fallback')
      const vParams = new URLSearchParams({ barcode: lookupKey, branch_id: branchId })
      const vRes = await fetch(`/api/products/variant-barcode?${vParams}`)
      if (vRes.ok) {
        const vJson = await vRes.json()
        if (vJson.data?.product && vJson.data?.variant) {
          const { product: vProduct, variant: vVariant } = vJson.data
          console.debug('[LOOKUP] ✅ FOUND via variant barcode — variant:', vVariant.name, 'parent:', vProduct.name)
          const hit: ScanLookupResult = { status: 'found', product: vProduct, matchedVariant: vVariant, barcode: displayBarcode, lookupKey }
          cache.current.set(cacheKey, { result: hit, ts: Date.now() })
          return hit
        }
      }

      // Never cache not_found — the product may be added to inventory right after
      console.debug('[LOOKUP] ❌ NOT FOUND')
      return { status: 'not_found', barcode: displayBarcode, lookupKey, prefill }
    } catch (err) {
      console.error('[LOOKUP] Network/unexpected error:', err)
      return { status: 'error', barcode: rawCode, lookupKey: '', error: 'Network error' }
    } finally {
      setIsLooking(false)
      console.debug('[LOOKUP] ════════════════════════════════════════')
    }
  }

  return { lookup, isLooking }
}
