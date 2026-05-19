'use client'
import { useState, useEffect, useRef } from 'react'
import { confirmToast } from '@/lib/confirm-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { Eye, Pencil, Trash2, Search, FileDown, FileSpreadsheet, Printer, FileText, Columns } from 'lucide-react'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'

interface CustomerRow {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  business_name: string | null
  created_at: string
}

const schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  business_name: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const COLS = ['Sr No#', 'Name', 'Email', 'Business Name', 'Contact No', 'Address']

function exportCSV(rows: CustomerRow[]) {
  const data = [COLS.join(','), ...rows.map((c, i) => [i + 1, `"${[c.first_name, c.last_name].filter(Boolean).join(' ')}"`, `"${c.email ?? 'N/A'}"`, `"${c.business_name ?? 'N/A'}"`, `"${c.phone ?? 'N/A'}"`, `"${c.address ?? 'N/A'}"`].join(','))]
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data.join('\n')], { type: 'text/csv' }))
  a.download = 'repair-customers.csv'; a.click()
}
function exportExcel(rows: CustomerRow[]) {
  const data = [COLS, ...rows.map((c, i) => [i + 1, [c.first_name, c.last_name].filter(Boolean).join(' '), c.email ?? 'N/A', c.business_name ?? 'N/A', c.phone ?? 'N/A', c.address ?? 'N/A'])]
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Repair Customers"><Table>${data.map((r) => `<Row>${r.map((v) => `<Cell><Data ss:Type="String">${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.ms-excel' })); a.download = 'repair-customers.xls'; a.click()
}
function exportPDF(rows: CustomerRow[]) {
  const html = `<html><head><title>Repair Customers</title><style>body{font-family:sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#0d7070;color:#fff}</style></head><body><h2>Repair Customers</h2><table><thead><tr>${COLS.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((c, i) => `<tr><td>${i + 1}</td><td>${[c.first_name, c.last_name].filter(Boolean).join(' ')}</td><td>${c.email ?? 'N/A'}</td><td>${c.business_name ?? 'N/A'}</td><td>${c.phone ?? 'N/A'}</td><td>${c.address ?? 'N/A'}</td></tr>`).join('')}</tbody></table></body></html>`
  const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); w.print()
}

export default function RepairCustomersPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [colVisibility, setColVisibility] = useState<VisibilityState>({})
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  const editForm = useForm<FormData>({ resolver: zodResolver(schema) })

  const { data: customerResponse, isLoading: loading } = useQuery({
    queryKey: ['repair-customers', activeBranch?.id, page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id, page: String(page + 1), limit: '25' })
      if (search) params.set('search', search)
      const res = await fetch(`/api/customers?${params}`)
      return res.json()
    },
    enabled: !!activeBranch,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  const customers: CustomerRow[] = customerResponse?.data ?? []
  const total = customerResponse?.meta?.total ?? 0

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function openEdit(c: CustomerRow) {
    setEditingCustomer(c)
    editForm.reset({ first_name: c.first_name, last_name: c.last_name ?? '', email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', business_name: c.business_name ?? '' })
    setEditError(null)
    setEditSheetOpen(true)
  }

  async function onEdit(data: FormData) {
    if (!editingCustomer) return
    setEditError(null)
    const res = await fetch(`/api/customers/${editingCustomer.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, email: data.email || null }) })
    if (res.ok) { setEditSheetOpen(false); queryClient.invalidateQueries({ queryKey: ['repair-customers', activeBranch?.id] }) }
    else { const j = await res.json(); setEditError(j?.error?.message ?? 'Failed to update.') }
  }

  async function onDelete(c: CustomerRow) {
    if (!await confirmToast(`Delete "${[c.first_name, c.last_name].filter(Boolean).join(' ')}"? This cannot be undone.`, 'Delete')) return
    await fetch(`/api/customers/${c.id}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['repair-customers', activeBranch?.id] })
  }

  const TOGGLEABLE = ['email', 'business', 'phone', 'address']
  const COL_LABELS: Record<string, string> = { email: 'Email', business: 'Business Name', phone: 'Contact No', address: 'Address' }

  const columns: ColumnDef<CustomerRow>[] = [
    {
      id: 'sr', header: 'Sr No#', size: 70,
      cell: ({ row }) => <span className="text-gray-500 text-sm">{page * 25 + row.index + 1}</span>,
    },
    {
      id: 'name', header: 'Name',
      cell: ({ row }) => <span className="font-medium text-gray-900">{row.original.first_name} {row.original.last_name ?? ''}</span>,
    },
    {
      accessorKey: 'email', header: 'Email',
      cell: ({ getValue }) => <span className="text-sm text-gray-600">{(getValue() as string) || 'N/A'}</span>,
    },
    {
      id: 'business', header: 'Business Name',
      cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.business_name || 'N/A'}</span>,
    },
    {
      accessorKey: 'phone', header: 'Contact No',
      cell: ({ getValue }) => <span className="text-sm text-gray-700 font-medium">{(getValue() as string) || 'N/A'}</span>,
    },
    {
      accessorKey: 'address', header: 'Address',
      cell: ({ getValue }) => { const v = getValue() as string | null; return <span className="text-sm text-gray-600 max-w-[160px] truncate block" title={v ?? ''}>{v || 'N/A'}</span> },
    },
    {
      id: 'actions', header: 'Action', size: 160,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button onClick={() => router.push(`/repairs/customers/${row.original.id}`)}
            className="flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-600 hover:bg-cyan-100 transition-colors">
            <Eye className="h-3 w-3" /> Details
          </button>
          <button onClick={() => openEdit(row.original)}
            className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors">
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button onClick={() => onDelete(row.original)}
            className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-100 transition-colors">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      ),
    },
  ]

  const visibleColumns = columns.filter((col) => {
    const key = (col as { accessorKey?: string }).accessorKey ?? col.id
    return key === undefined || colVisibility[key] !== false
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Repairs Customers</h1>
        <p className="text-sm font-semibold text-gray-600 mt-0.5">Manage Repairs Customers</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => exportCSV(customers)} className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          <FileDown className="h-3.5 w-3.5" /> Export CSV
        </button>
        <button onClick={() => exportExcel(customers)} className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
        <div className="relative" ref={colMenuRef}>
          <button onClick={() => setColMenuOpen((v) => !v)} className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
            <Columns className="h-3.5 w-3.5" /> Column visibility
          </button>
          {colMenuOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
              {TOGGLEABLE.map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded" checked={colVisibility[key] !== false} onChange={(e) => setColVisibility((v) => ({ ...v, [key]: e.target.checked }))} />
                  {COL_LABELS[key]}
                </label>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => exportPDF(customers)} className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          <FileText className="h-3.5 w-3.5" /> Export PDF
        </button>

        <div className="ml-auto relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      <DataTable data={customers} columns={visibleColumns} isLoading={loading} totalCount={total} pageIndex={page} pageSize={25} onPageChange={setPage} emptyMessage="No customers with repairs found." />

      {/* Edit Sheet */}
      <InlineFormSheet open={editSheetOpen} onClose={() => { setEditSheetOpen(false); setEditError(null) }} title="Edit Customer">
        <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
          {editError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" required error={editForm.formState.errors.first_name?.message} {...editForm.register('first_name')} />
            <Input label="Last Name" {...editForm.register('last_name')} />
          </div>
          <Input label="Business Name" {...editForm.register('business_name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" {...editForm.register('email')} />
            <Input label="Phone" type="tel" {...editForm.register('phone')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...editForm.register('address')} />
          </div>
          <Button type="submit" className="w-full" loading={editForm.formState.isSubmitting}>Save Changes</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
