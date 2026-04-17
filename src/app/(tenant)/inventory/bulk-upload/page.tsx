'use client'
import { useState, useRef, useCallback, DragEvent } from 'react'
import { UploadCloud, Download, CheckCircle2, AlertCircle, FileSpreadsheet, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type ItemType = 'product' | 'part'

interface ParsedRow {
  [key: string]: string
}

interface ChunkResult {
  imported: number
  updated: number
  errors: Array<{ row: number; message: string }>
}

// ── CSV Templates ─────────────────────────────────────────────────────────────

const PRODUCT_COLUMNS = [
  { key: 'name',           label: 'Name',            required: true,  note: 'Product name' },
  { key: 'sku',            label: 'SKU',             required: false, note: 'Used to update if product already exists' },
  { key: 'barcode',        label: 'Barcode',         required: false, note: '' },
  { key: 'selling_price',  label: 'Selling Price',   required: true,  note: 'Must be ≥ 0' },
  { key: 'cost_price',     label: 'Cost Price',      required: false, note: 'Defaults to 0' },
  { key: 'description',    label: 'Description',     required: false, note: '' },
  { key: 'image_url',      label: 'Image URL',       required: false, note: 'Public http/https URL to product image (JPG, PNG, WebP)' },
  { key: 'category',       label: 'Category',        required: false, note: 'Device type — e.g. iPhone, Laptops. Auto-created if missing.' },
  { key: 'brand',          label: 'Brand',           required: false, note: 'e.g. Apple, Samsung. Auto-created if missing.' },
  { key: 'model',          label: 'Model',           required: false, note: 'e.g. iPhone 15 Pro. Auto-created if missing. Leave blank for generic products.' },
  { key: 'supplier',       label: 'Supplier',        required: false, note: 'Must match existing supplier name' },
  { key: 'quantity',       label: 'Quantity',        required: false, note: 'Starting stock (default: 0)' },
  { key: 'low_stock_alert',label: 'Low Stock Alert', required: false, note: 'Alert threshold (default: 5)' },
]

const PART_COLUMNS = [
  { key: 'name',           label: 'Name',            required: true,  note: 'Part name' },
  { key: 'sku',            label: 'SKU',             required: false, note: 'Used to update if part already exists' },
  { key: 'barcode',        label: 'Barcode',         required: false, note: '' },
  { key: 'selling_price',  label: 'Selling Price',   required: true,  note: 'Must be ≥ 0' },
  { key: 'cost_price',     label: 'Cost Price',      required: false, note: 'Defaults to 0' },
  { key: 'description',    label: 'Description',     required: false, note: '' },
  { key: 'image_url',      label: 'Image URL',       required: false, note: 'Public http/https URL to part image (JPG, PNG, WebP)' },
  { key: 'device_type',    label: 'Device Type',     required: false, note: 'e.g. iPhone, Samsung — must match existing device type' },
  { key: 'brand',          label: 'Brand',           required: false, note: 'e.g. Apple, Samsung — must match existing brand' },
  { key: 'model',          label: 'Model',           required: false, note: 'e.g. iPhone 15 Pro — must match existing model' },
  { key: 'part_type',      label: 'Part Type',       required: false, note: 'e.g. Screen, Battery, IC' },
  { key: 'supplier',       label: 'Supplier',        required: false, note: 'Must match existing supplier name' },
  { key: 'quantity',       label: 'Quantity',        required: false, note: 'Starting stock (default: 0)' },
  { key: 'low_stock_alert',label: 'Low Stock Alert', required: false, note: 'Alert threshold (default: 5)' },
]

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const result: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' && !inQuotes) {
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim())) result.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    if (row.some((c) => c.trim())) result.push(row)
  }

  if (result.length === 0) return { headers: [], rows: [] }

  const headers = result[0].map((h) => h.trim().toLowerCase())
  const rows = result.slice(1).map((r) => {
    const obj: ParsedRow = {}
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim() })
    return obj
  })

  return { headers, rows }
}

// ── Template Download ─────────────────────────────────────────────────────────

const PRODUCT_SAMPLE_ROWS = [
  // name, sku, barcode, selling_price, cost_price, description, image_url, category, brand, model, supplier, quantity, low_stock_alert
  [
    'iPhone 15 Pro Screen Assembly', 'SKU-PRD-001', '8901234567890', '89.99', '42.00',
    'Original OLED screen assembly with frame for iPhone 15 Pro',
    'https://images.pexels.com/photos/788946/pexels-photo-788946.jpeg',
    'Phones', 'Apple', 'iPhone 15 Pro', 'TechParts Ltd', '15', '3',
  ],
  [
    'Samsung Galaxy S24 Screen', 'SKU-PRD-002', '8901234567891', '79.99', '35.00',
    'Genuine AMOLED display replacement for Samsung S24',
    'https://images.pexels.com/photos/404280/pexels-photo-404280.jpeg',
    'Phones', 'Samsung', 'Galaxy S24', 'TechParts Ltd', '10', '2',
  ],
  [
    'Universal USB-C Charging Cable 2m', 'SKU-PRD-003', '8901234567892', '14.99', '4.50',
    '2m braided USB-C to USB-C fast charging cable 65W',
    'https://images.pexels.com/photos/4195342/pexels-photo-4195342.jpeg',
    'Accessories', 'Generic', '', 'Accessories Hub', '50', '10',
  ],
  [
    '9H Tempered Glass Screen Protector', 'SKU-PRD-004', '8901234567893', '9.99', '2.00',
    'Anti-scratch 9H hardness tempered glass screen protector universal fit',
    'https://images.pexels.com/photos/1092671/pexels-photo-1092671.jpeg',
    'Accessories', 'Generic', '', 'Accessories Hub', '100', '20',
  ],
  [
    'iPhone 14 Silicone Case', 'SKU-PRD-005', '8901234567894', '19.99', '6.00',
    'Official Apple silicone case for iPhone 14 — Midnight colour',
    'https://images.pexels.com/photos/3825586/pexels-photo-3825586.jpeg',
    'Cases', 'Apple', 'iPhone 14', 'Cases & More', '30', '5',
  ],
]

const PART_SAMPLE_ROWS = [
  // name, sku, barcode, selling_price, cost_price, description, image_url, device_type, brand, model, part_type, supplier, quantity, low_stock_alert
  [
    'iPhone 15 Pro OLED Screen', 'SKU-PRT-001', '', '45.00', '20.00',
    'OEM OLED LCD panel with digitizer for iPhone 15 Pro',
    'https://images.pexels.com/photos/699122/pexels-photo-699122.jpeg',
    'iPhone', 'Apple', 'iPhone 15 Pro', 'Screen', 'Parts Supplier', '8', '2',
  ],
  [
    'Samsung S24 Battery 4000mAh', 'SKU-PRT-002', '', '22.00', '9.00',
    'Original capacity 4000mAh Li-ion replacement battery for Galaxy S24',
    'https://images.pexels.com/photos/163124/pexels-photo-163124.jpeg',
    'Samsung', 'Samsung', 'Galaxy S24', 'Battery', 'Parts Supplier', '12', '3',
  ],
  [
    'MacBook Pro 14 Keyboard UK', 'SKU-PRT-003', '', '89.00', '38.00',
    'UK layout backlit replacement keyboard for MacBook Pro 14-inch M3',
    'https://images.pexels.com/photos/2399840/pexels-photo-2399840.jpeg',
    'Laptops', 'Apple', 'MacBook Pro 14', 'Keyboard', 'Laptop Parts Co', '5', '1',
  ],
  [
    'iPad Pro 12.9 Touch Digitizer', 'SKU-PRT-004', '', '65.00', '28.00',
    'Front glass touch digitizer panel for iPad Pro 12.9 inch 6th Gen',
    'https://images.pexels.com/photos/1334597/pexels-photo-1334597.jpeg',
    'Tablets', 'Apple', 'iPad Pro 12.9', 'Digitizer', 'Parts Supplier', '6', '2',
  ],
  [
    'iPhone 15 USB-C Charging Port', 'SKU-PRT-005', '', '18.00', '7.50',
    'USB-C charging port flex cable assembly for iPhone 15 and 15 Plus',
    'https://images.pexels.com/photos/4526408/pexels-photo-4526408.jpeg',
    'iPhone', 'Apple', 'iPhone 15', 'Charging Port', 'Parts Supplier', '20', '5',
  ],
]

function csvRow(cells: string[]): string {
  return cells.map((c) => (c.includes(',') || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(',')
}

function downloadTemplate(itemType: ItemType) {
  const cols    = itemType === 'product' ? PRODUCT_COLUMNS : PART_COLUMNS
  const samples = itemType === 'product' ? PRODUCT_SAMPLE_ROWS : PART_SAMPLE_ROWS

  const lines = [
    cols.map((c) => c.key).join(','),
    ...samples.map(csvRow),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `bulk-${itemType}-template.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Chunk size ────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 100

// ── Main Component ────────────────────────────────────────────────────────────

export default function BulkUploadPage() {
  const { activeBranch } = useAuthStore()

  const [itemType, setItemType]       = useState<ItemType>('product')
  const [rows, setRows]               = useState<ParsedRow[]>([])
  const [headers, setHeaders]         = useState<string[]>([])
  const [fileName, setFileName]       = useState('')
  const [dragging, setDragging]       = useState(false)
  const [parseError, setParseError]   = useState('')
  const [showColumns, setShowColumns] = useState(false)
  const [showErrors, setShowErrors]   = useState(false)

  // Upload state
  const [uploading, setUploading]         = useState(false)
  const [chunksDone, setChunksDone]       = useState(0)
  const [totalChunks, setTotalChunks]     = useState(0)
  const [result, setResult]               = useState<{ imported: number; updated: number; errors: Array<{ row: number; message: string }> } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const columns = itemType === 'product' ? PRODUCT_COLUMNS : PART_COLUMNS

  // ── File processing ─────────────────────────────────────────────────────────
  function processFile(file: File) {
    setParseError('')
    setResult(null)
    setRows([])
    setHeaders([])
    setFileName(file.name)

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setParseError('Only CSV files are supported.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      if (h.length === 0) {
        setParseError('CSV appears to be empty or has no headers.')
        return
      }
      if (!h.includes('name')) {
        setParseError('CSV must have a "name" column.')
        return
      }
      setHeaders(h)
      setRows(r)
    }
    reader.readAsText(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }, [])

  function clearFile() {
    setRows([])
    setHeaders([])
    setFileName('')
    setParseError('')
    setResult(null)
    setChunksDone(0)
    setTotalChunks(0)
  }

  function clearFileKeepResult() {
    setRows([])
    setHeaders([])
    setFileName('')
    setParseError('')
    setChunksDone(0)
    setTotalChunks(0)
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (rows.length === 0 || !activeBranch) return

    setUploading(true)
    setResult(null)
    setChunksDone(0)

    const chunks: ParsedRow[][] = []
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      chunks.push(rows.slice(i, i + CHUNK_SIZE))
    }
    setTotalChunks(chunks.length)

    const totals = { imported: 0, updated: 0, errors: [] as Array<{ row: number; message: string }> }

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci]
      // Adjust row numbers for this chunk
      const rowOffset = ci * CHUNK_SIZE
      const adjustedRows = chunk.map((r, idx) => ({ ...r, _row_offset: rowOffset + idx }))

      const res = await fetch('/api/products/bulk-import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          rows:      chunk,
          item_type: itemType,
          branch_id: activeBranch.id,
        }),
      })

      const data: ChunkResult = await res.json()

      if (!res.ok) {
        totals.errors.push({ row: rowOffset + 2, message: (data as any).error ?? 'Unknown server error' })
      } else {
        totals.imported += data.imported ?? 0
        totals.updated  += data.updated  ?? 0
        // Adjust row numbers from server by chunk offset
        if (data.errors?.length) {
          totals.errors.push(
            ...data.errors.map((e) => ({ ...e, row: e.row + rowOffset }))
          )
        }
      }

      setChunksDone(ci + 1)
    }

    setResult(totals)
    setUploading(false)
    // Keep result visible; clear only the file/rows so the banner stays shown
    clearFileKeepResult()
  }

  const previewRows  = rows.slice(0, 5)
  const progressPct  = totalChunks > 0 ? Math.round((chunksDone / totalChunks) * 100) : 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Bulk Upload</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Import products or parts in bulk from a CSV file</p>
        </div>
        <Link href="/inventory">
          <Button size="sm">Back to Inventory</Button>
        </Link>
      </div>

      {/* Tab: Product / Part */}
      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-fit">
        {(['product', 'part'] as ItemType[]).map((t) => (
          <button
            key={t}
            onClick={() => { setItemType(t); clearFile() }}
            className={cn(
              'px-5 py-1.5 rounded-lg text-sm font-medium transition-all',
              itemType === t
                ? 'bg-brand-teal text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            )}
          >
            {t === 'product' ? 'Products' : 'Parts'}
          </button>
        ))}
      </div>

      {/* Column guide + template */}
      <div className="border border-outline-variant rounded-xl overflow-hidden">
        <button
          onClick={() => setShowColumns((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-surface-container-low hover:bg-surface-container transition-colors text-sm font-medium text-on-surface-variant"
        >
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-on-surface-variant" />
            CSV Column Reference
          </span>
          {showColumns ? <ChevronUp className="h-4 w-4 text-on-surface-variant" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant" />}
        </button>

        {showColumns && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-t border-b border-outline-variant bg-surface-container-low">
                  <th className="px-4 py-2 text-left font-semibold text-on-surface-variant">Column</th>
                  <th className="px-4 py-2 text-left font-semibold text-on-surface-variant">Required</th>
                  <th className="px-4 py-2 text-left font-semibold text-on-surface-variant">Notes</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((c) => (
                  <tr key={c.key} className="border-b border-surface-container-high last:border-0">
                    <td className="px-4 py-2 font-mono text-on-surface">{c.key}</td>
                    <td className="px-4 py-2">
                      {c.required
                        ? <Badge className="bg-error-container text-on-error-container text-[10px]">Required</Badge>
                        : <span className="text-on-surface-variant">Optional</span>}
                    </td>
                    <td className="px-4 py-2 text-on-surface-variant">{c.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-3 border-t border-outline-variant flex justify-end">
          <Button
            size="sm"
            onClick={() => downloadTemplate(itemType)}
          >
            <Download className="h-4 w-4" />
            Download Template
          </Button>
        </div>
      </div>

      {/* Drop zone */}
      {rows.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none',
            dragging
              ? 'border-brand-teal bg-brand-teal/5'
              : 'border-outline-variant hover:border-outline bg-surface-container-low'
          )}
        >
          <UploadCloud className={cn('h-10 w-10', dragging ? 'text-brand-teal' : 'text-on-surface-variant')} />
          <div className="text-center">
            <p className="text-sm font-medium text-on-surface">Drop your CSV here or click to browse</p>
            <p className="text-xs text-on-surface-variant mt-1">Only .csv files are supported · Up to 50 000 rows</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="flex items-center gap-2 rounded-lg bg-error-container border border-error-container/70 px-4 py-3 text-sm text-on-error-container">
          <AlertCircle className="h-4 w-4 shrink-0 text-on-error-container" />
          {parseError}
        </div>
      )}

      {/* File loaded: preview */}
      {rows.length > 0 && (
        <div className="border border-outline-variant rounded-xl overflow-hidden">
          {/* File info bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low border-b border-outline-variant">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-on-surface-variant" />
              <span className="font-medium text-on-surface">{fileName}</span>
              <Badge className="bg-surface-container text-on-surface-variant text-[10px]">{rows.length.toLocaleString()} rows</Badge>
            </div>
            <button onClick={clearFile} className="text-on-surface-variant hover:text-on-surface transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-3 py-2 text-left text-on-surface-variant font-medium">#</th>
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-on-surface font-mono whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-surface-container-high last:border-0 hover:bg-surface-container-low">
                    <td className="px-3 py-2 text-on-surface-variant">{i + 2}</td>
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-2 text-on-surface max-w-[160px] truncate whitespace-nowrap">
                        {r[h] || <span className="text-on-surface-variant">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 5 && (
            <div className="px-4 py-2 border-t border-surface-container-high text-xs text-on-surface-variant">
              Showing 5 of {rows.length.toLocaleString()} rows
            </div>
          )}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="rounded-xl border border-primary-container bg-primary-container/20 px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Uploading… chunk {chunksDone} of {totalChunks}
          </div>
          <div className="h-2 w-full rounded-full bg-primary-container">
            <div
              className="h-2 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-primary">{progressPct}% complete</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className={cn(
          'rounded-xl border px-5 py-4 space-y-3',
          result.errors.length === 0
            ? 'border-primary-container bg-primary-container/20'
            : result.imported + result.updated > 0
              ? 'border-secondary-container bg-secondary-container/20'
              : 'border-error-container bg-error-container/20'
        )}>
          <div className="flex items-center gap-2">
            {result.errors.length === 0
              ? <CheckCircle2 className="h-5 w-5 text-primary" />
              : <AlertCircle className="h-5 w-5 text-secondary" />}
            <span className="font-semibold text-on-surface">Import complete</span>
          </div>

          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-on-surface"><strong>{result.imported}</strong> created</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-secondary" />
              <span className="text-on-surface"><strong>{result.updated}</strong> updated</span>
            </div>
            {result.errors.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-error" />
                <span className="text-on-surface"><strong>{result.errors.length}</strong> errors</span>
              </div>
            )}
          </div>

          {result.errors.length > 0 && (
            <div>
              <button
                onClick={() => setShowErrors((v) => !v)}
                className="text-xs font-medium text-on-surface-variant flex items-center gap-1 hover:text-on-surface"
              >
                {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showErrors ? 'Hide' : 'Show'} error details
              </button>

              {showErrors && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-error-container bg-surface-container-low divide-y divide-surface-container-high">
                  {result.errors.map((e, i) => (
                    <div key={i} className="px-3 py-2 text-xs flex gap-3">
                      <span className="shrink-0 font-mono text-on-surface-variant">Row {e.row}</span>
                      <span className="text-error">{e.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-1">
            <button
              onClick={clearFile}
              className="text-xs font-medium text-on-surface-variant hover:text-on-surface underline underline-offset-2"
            >
              Upload another file
            </button>
          </div>
        </div>
      )}

      {/* Upload button */}
      {rows.length > 0 && !uploading && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-on-surface-variant">
            Ready to import <strong>{rows.length.toLocaleString()}</strong> {itemType}(s) into{' '}
            <strong>{activeBranch?.name ?? '—'}</strong>
          </p>
          <Button onClick={handleUpload} disabled={!activeBranch}>
            <UploadCloud className="h-4 w-4" />
            Upload {rows.length.toLocaleString()} {itemType === 'product' ? 'Products' : 'Parts'}
          </Button>
        </div>
      )}
    </div>
  )
}
