'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { ArrowLeft, FileDown, FileSpreadsheet, Printer, FileText } from 'lucide-react'
import { DataTable } from '@/components/shared/data-table'
import { formatDate } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

interface CustomerDetail {
  id: string
  first_name: string
  last_name: string | null
  phone: string | null
  email: string | null
  business_name: string | null
}

interface RepairRow {
  id: string
  job_number: string
  status: string | null
  device_type: string | null
  device_brand: string | null
  device_model: string | null
  issue: string | null
  estimated_cost: number | null
  deposit_paid: number | null
  created_at: string
  custom_fields?: { due_date?: string | null } | null
  customers?: { first_name: string; last_name: string | null; phone: string | null } | null
  employees?: { first_name: string; last_name: string | null } | null
  businesses?: { name: string } | null
}

const EXPORT_COLS = ['Booking ID', 'Status', 'Customer Name', 'Phone Number', 'Item Details', 'Faults', 'Booking Date', 'Due Date', 'Estimated Cost', 'Business Name', 'Repaired By']

function row2arr(r: RepairRow, businessName: string) {
  const device = [r.device_type, r.device_brand, r.device_model].filter(Boolean).join(' ') || 'N/A'
  const employee = r.employees ? `${r.employees.first_name} ${r.employees.last_name ?? ''}`.trim() : 'N/A'
  const due = (r.custom_fields as any)?.due_date ?? 'N/A'
  return [r.job_number, r.status ?? 'N/A', r.customers ? `${r.customers.first_name} ${r.customers.last_name ?? ''}`.trim() : 'N/A', r.customers?.phone ?? 'N/A', device, r.issue ?? 'N/A', formatDate(r.created_at), due, r.estimated_cost ? `£${r.estimated_cost.toFixed(2)}` : 'N/A', businessName, employee]
}

export default function RepairCustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { activeBranch } = useAuthStore()
  const router = useRouter()

  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [repairs, setRepairs] = useState<RepairRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [businessName, setBusinessName] = useState('')
  const [customStatuses, setCustomStatuses] = useState<{ name: string; color: string }[]>([])

  useEffect(() => {
    fetch('/api/repairs/custom-statuses').then(r => r.json()).then(j => { if (j.data) setCustomStatuses(j.data) })
  }, [])

  useEffect(() => {
    fetch('/api/customers/' + id).then(r => r.json()).then(j => { if (j.data) setCustomer(j.data) })
  }, [id])

  useEffect(() => {
    if (!activeBranch) return
    fetch(`/api/branches/${activeBranch.id}`).then(r => r.json()).then(j => {
      if (j.data?.businesses?.name) setBusinessName(j.data.businesses.name)
    }).catch(() => {})
  }, [activeBranch])

  const fetchRepairs = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const params = new URLSearchParams({ branch_id: activeBranch.id, customer_id: id, page: String(page + 1), limit: String(pageSize) })
    const res = await fetch(`/api/repairs?${params}`)
    const json = await res.json()
    setRepairs(json.data ?? [])
    setTotal(json.meta?.total ?? 0)
    setLoading(false)
  }, [activeBranch, id, page, pageSize])

  useEffect(() => { fetchRepairs() }, [fetchRepairs])

  const statusColorMap = Object.fromEntries(customStatuses.map(cs => [cs.name, cs.color]))

  function exportCSV() {
    const data = [EXPORT_COLS.join(','), ...repairs.map(r => row2arr(r, businessName).map(v => `"${v}"`).join(','))]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data.join('\n')], { type: 'text/csv' })); a.download = `repairs-${customer?.first_name ?? 'customer'}.csv`; a.click()
  }
  function exportExcel() {
    const data = [EXPORT_COLS, ...repairs.map(r => row2arr(r, businessName))]
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Repairs"><Table>${data.map(r => `<Row>${r.map(v => `<Cell><Data ss:Type="String">${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.ms-excel' })); a.download = `repairs-${customer?.first_name ?? 'customer'}.xls`; a.click()
  }
  function exportPDF() {
    const custName = customer ? `${customer.first_name} ${customer.last_name ?? ''}`.trim() : ''
    const html = `<!DOCTYPE html><html><head><title>Repair Job Sheet – ${custName}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #0d7070}
      .title{font-size:18px;font-weight:700;color:#0d7070}
      .subtitle{font-size:12px;color:#555;margin-top:4px}
      .meta{text-align:right;font-size:10px;color:#777}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th{background:#0d7070;color:#fff;padding:6px 8px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
      td{border:1px solid #e5e7eb;padding:5px 8px;vertical-align:top}
      tr:nth-child(even) td{background:#f9fafb}
      .footer{margin-top:20px;font-size:9px;color:#aaa;text-align:center}
      @media print{body{padding:0}@page{margin:15mm}}
    </style></head><body>
    <div class="header">
      <div>
        <div class="title">Repair Job Sheet</div>
        <div class="subtitle">${custName}${customer?.phone ? ' &nbsp;·&nbsp; ' + customer.phone : ''}${customer?.email ? ' &nbsp;·&nbsp; ' + customer.email : ''}</div>
      </div>
      <div class="meta">
        <div>${businessName || ''}</div>
        <div>Printed: ${new Date().toLocaleString('en-GB')}</div>
        <div>${repairs.length} repair(s)</div>
      </div>
    </div>
    <table><thead><tr>${EXPORT_COLS.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${repairs.map(r => `<tr>${row2arr(r, businessName).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="footer">Generated by TSN POS &mdash; ${new Date().toLocaleDateString('en-GB')}</div>
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const columns: ColumnDef<RepairRow>[] = [
    {
      id: 'booking_id', header: 'Booking ID',
      cell: ({ row }) => <span className="font-mono text-sm font-semibold text-blue-600">{row.original.job_number}</span>,
    },
    {
      accessorKey: 'status', header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string
        const color = statusColorMap[s] ?? '#9ca3af'
        return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: color }}>{s}</span>
      },
    },
    {
      id: 'customer_name', header: 'Customer Name',
      cell: ({ row }) => {
        const c = row.original.customers
        return c ? `${c.first_name} ${c.last_name ?? ''}`.trim() : '—'
      },
    },
    {
      id: 'phone', header: 'Phone Number',
      cell: ({ row }) => row.original.customers?.phone ?? '—',
    },
    {
      id: 'device', header: 'Item Details',
      cell: ({ row }) => [row.original.device_type, row.original.device_brand, row.original.device_model].filter(Boolean).join(' ') || '—',
    },
    {
      id: 'fault', header: 'Faults',
      cell: ({ row }) => {
        const issue = row.original.issue
        return issue
          ? <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">{issue}</span>
          : <span className="text-gray-400">—</span>
      },
    },
    {
      id: 'booking_date', header: 'Booking Date',
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: 'due_date', header: 'Due Date',
      cell: ({ row }) => {
        const dd = (row.original.custom_fields as any)?.due_date
        return dd ? formatDate(dd) : 'N/A'
      },
    },
    {
      id: 'cost', header: 'Estimated Cost',
      cell: ({ row }) => row.original.estimated_cost ? `£${row.original.estimated_cost.toFixed(2)}` : '—',
    },
    {
      id: 'business', header: 'Business Name',
      cell: () => businessName || '—',
    },
    {
      id: 'repaired_by', header: 'Repaired By',
      cell: ({ row }) => {
        const e = row.original.employees as any
        return e ? `${e.first_name} ${e.last_name ?? ''}`.trim() : '—'
      },
    },
  ]

  const customerLabel = customer
    ? `${customer.first_name} ${customer.last_name ?? ''}`.trim() + (customer.phone ? ` -- ${customer.phone}` : '')
    : '...'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <button onClick={() => router.push('/repairs/customers')} className="mb-2 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Repair Customers
        </button>
        <h1 className="text-xl font-bold text-gray-900">Repair Job Sheet</h1>
        <p className="mt-0.5 text-sm font-semibold text-gray-700">{customerLabel}</p>
      </div>

      {/* Export Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100 transition-colors">
          <FileDown className="h-3.5 w-3.5" /> Export CSV
        </button>
        <button onClick={exportExcel} className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700 hover:bg-green-100 transition-colors">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
        </button>
        <button onClick={exportPDF} className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-700 hover:bg-sky-100 transition-colors">
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
        <button onClick={exportPDF} className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-700 hover:bg-orange-100 transition-colors">
          <FileText className="h-3.5 w-3.5" /> Export PDF
        </button>
      </div>

      <DataTable
        data={repairs}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No repairs found for this customer."
      />
    </div>
  )
}
