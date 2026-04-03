import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { NextResponse, NextRequest } from 'next/server'
import type { RequestContext } from '@/backend/middleware'

async function importProducts(req: NextRequest, ctx: RequestContext) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const lines = text.split('\n').filter(Boolean)
  if (lines.length < 2) return NextResponse.json({ error: 'File is empty' }, { status: 400 })

  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase())
  const nameIdx         = headers.indexOf('name')
  const skuIdx          = headers.indexOf('sku')
  const barcodeIdx      = headers.indexOf('barcode')
  const priceIdx        = headers.indexOf('selling_price')
  const costIdx         = headers.indexOf('cost_price')
  const descIdx         = headers.indexOf('description')
  const isServiceIdx    = headers.indexOf('is_service')
  const isSerializedIdx = headers.indexOf('is_serialized')
  const valuationIdx    = headers.indexOf('valuation_method')

  if (nameIdx === -1) return NextResponse.json({ error: 'Missing required column: name' }, { status: 400 })

  function parseCell(row: string[], i: number) {
    if (i === -1 || i >= row.length) return ''
    return row[i].replace(/^"|"$/g, '').trim()
  }

  const products: any[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',')
    const name = parseCell(row, nameIdx)
    if (!name) continue

    const valuation = parseCell(row, valuationIdx) || 'weighted_average'
    if (!['weighted_average', 'fifo', 'lifo'].includes(valuation)) {
      errors.push(`Row ${i + 1}: invalid valuation_method "${valuation}"`)
      continue
    }

    products.push({
      business_id:      ctx.businessId,
      name,
      sku:              parseCell(row, skuIdx) || null,
      barcode:          parseCell(row, barcodeIdx) || null,
      selling_price:    parseFloat(parseCell(row, priceIdx)) || 0,
      cost_price:       parseFloat(parseCell(row, costIdx)) || 0,
      description:      parseCell(row, descIdx) || null,
      is_service:       parseCell(row, isServiceIdx).toLowerCase() === 'true',
      is_serialized:    parseCell(row, isSerializedIdx).toLowerCase() === 'true',
      valuation_method: valuation,
      is_active:        true,
    })
  }

  if (products.length === 0) {
    return NextResponse.json({ error: 'No valid rows found', errors }, { status: 400 })
  }

  const withSku    = products.filter((p) => p.sku)
  const withoutSku = products.filter((p) => !p.sku)
  let inserted = 0
  let updated  = 0

  if (withSku.length > 0) {
    const { data, error } = await adminSupabase
      .from('products')
      .upsert(withSku, { onConflict: 'business_id,sku' })
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    updated = data?.length ?? 0
  }

  if (withoutSku.length > 0) {
    const { data, error } = await adminSupabase
      .from('products')
      .insert(withoutSku)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = data?.length ?? 0
  }

  return NextResponse.json({ success: true, imported: inserted, updated, errors })
}

export const POST = withMiddleware(importProducts, { requiredRole: 'branch_manager' })
