'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Eye, Pencil, Trash2, FileDown, FileSpreadsheet, Printer, Columns, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { CustomFieldRenderer, useCustomFieldDefs } from '@/components/shared/custom-field-renderer'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { PhoneInput } from '@/components/ui/phone-input'
import validations from '@/components/layout/number-validations.json'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmModal } from '@/components/ui/confirm-modal'

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
}).refine((data) => {
  if (!data.phone || !data.phone.startsWith('+')) return true
  const sortedValidations = [...validations].sort((a, b) => b.phone.length - a.phone.length)
  const rule = sortedValidations.find(v => data.phone!.startsWith('+' + v.phone.replace('-', '')))
  if (!rule) return true
  const dialCode = rule.phone.replace('-', '')
  const digitsOnly = data.phone.slice(dialCode.length + 1)
  const length = digitsOnly.length
  if (Array.isArray(rule.phoneLength)) return rule.phoneLength.includes(length)
  if (rule.phoneLength) return length === rule.phoneLength
  if (rule.min && length < rule.min) return false
  if (rule.max && length > rule.max) return false
  return true
}, {
  message: 'Invalid phone number length for the selected country',
  path: ['phone'],
})

type FormData = z.infer<typeof schema>

const EXPORTABLE_COLUMNS = ['Sr#', 'Name', 'Email', 'Business Name', 'Contact No', 'Address']

function exportCSV(customers: CustomerRow[]) {
  const rows = [
    EXPORTABLE_COLUMNS.join(','),
    ...customers.map((c, i) =>
      [
        i + 1,
        `"${[c.first_name, c.last_name].filter(Boolean).join(' ')}"`,
        `"${c.email ?? 'N/A'}"`,
        `"${c.business_name ?? 'N/A'}"`,
        `"${c.phone ?? 'N/A'}"`,
        `"${c.address ?? 'N/A'}"`,
      ].join(',')
    ),
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'customers.csv'
  a.click()
}

function exportExcel(customers: CustomerRow[]) {
  const rows = [
    EXPORTABLE_COLUMNS,
    ...customers.map((c, i) => [
      i + 1,
      [c.first_name, c.last_name].filter(Boolean).join(' '),
      c.email ?? 'N/A',
      c.business_name ?? 'N/A',
      c.phone ?? 'N/A',
      c.address ?? 'N/A',
    ]),
  ]
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Customers"><Table>${rows.map((r) => `<Row>${r.map((v) => `<Cell><Data ss:Type="String">${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'customers.xls'
  a.click()
}

function exportPDF(customers: CustomerRow[]) {
  const html = `<html><head><title>Customers</title><style>body{font-family:sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#0d7070;color:#fff}</style></head><body><h2>Customers</h2><table><thead><tr>${EXPORTABLE_COLUMNS.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${customers.map((c, i) => `<tr><td>${i + 1}</td><td>${[c.first_name, c.last_name].filter(Boolean).join(' ')}</td><td>${c.email ?? 'N/A'}</td><td>${c.business_name ?? 'N/A'}</td><td>${c.phone ?? 'N/A'}</td><td>${c.address ?? 'N/A'}</td></tr>`).join('')}</tbody></table></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.print()
}

export default function CustomersPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')

  // URL-based page state
  const page = parseInt(searchParams.get('page') || '0', 10)

  const setPage = useCallback((newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, pathname, router])

  // Create sheet
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({})
  const { defs: customerFieldDefs } = useCustomFieldDefs('customers')

  // Edit sheet
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CustomerRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Column visibility
  const [colVisibility, setColVisibility] = useState<VisibilityState>({})
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  const createForm = useForm<FormData>({ resolver: zodResolver(schema) })
  const editForm = useForm<FormData>({ resolver: zodResolver(schema) })

  const { data: customerData, isLoading: loading } = useQuery({
    queryKey: ['customers', activeBranch?.id, page, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        branch_id: activeBranch!.id,
        page: String(page + 1),
        limit: '20',
      })
      if (search) params.set('search', search)
      const res = await fetch(`/api/customers?${params}`)
      const json = await res.json()
      return {
        rows: json.data ?? [],
        total: json.meta?.total ?? 0
      }
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
  })

  const customers = customerData?.rows ?? []
  const total = customerData?.total ?? 0

  // Close column menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function onCreate(data: FormData) {
    if (!activeBranch) return
    setCreateError(null)
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id, custom_fields: customFields }),
    })
    if (res.ok) { createForm.reset(); setSheetOpen(false); queryClient.invalidateQueries({ queryKey: ['customers'] }) }
    else { const j = await res.json(); setCreateError(j?.error?.message ?? 'Failed to create customer.') }
  }

  function openEdit(customer: CustomerRow) {
    setEditingCustomer(customer)
    editForm.reset({
      first_name: customer.first_name,
      last_name: customer.last_name ?? '',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      business_name: customer.business_name ?? '',
    })
    setEditError(null)
    setEditSheetOpen(true)
  }

  async function onEdit(data: FormData) {
    if (!editingCustomer) return
    setEditError(null)
    const res = await fetch(`/api/customers/${editingCustomer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, email: data.email || null }),
    })
    if (res.ok) { setEditSheetOpen(false); queryClient.invalidateQueries({ queryKey: ['customers'] }) }
    else { const j = await res.json(); setEditError(j?.error?.message ?? 'Failed to update customer.') }
  }

  function onDelete(customer: CustomerRow) {
    setConfirmDelete(customer)
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setIsDeleting(true)
    const name = [confirmDelete.first_name, confirmDelete.last_name].filter(Boolean).join(' ')
    
    const res = await fetch(`/api/customers/${confirmDelete.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`Customer "${name}" deleted.`)
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setConfirmDelete(null)
    } else {
      toast.error('Failed to delete customer.')
    }
    setIsDeleting(false)
  }

  const TOGGLEABLE_COLS = ['email', 'address', 'phone', 'created_at']
  const COL_LABELS: Record<string, string> = { email: 'Email', address: 'Address', phone: 'Contact No', created_at: 'Added' }

  const columns: ColumnDef<CustomerRow>[] = [
    {
      id: 'sr',
      header: 'Sr No#',
      size: 70,
      cell: ({ row }) => <span className="text-gray-500">{page * 20 + row.index + 1}</span>,
    },
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <p className="font-medium text-gray-900">
          {row.original.first_name} {row.original.last_name ?? ''}
        </p>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => (getValue() as string) || 'N/A',
    },
    {
      id: 'business',
      header: 'Business Name',
      cell: ({ row }) => row.original.business_name
        ? <span className="text-gray-900">{row.original.business_name}</span>
        : <span className="text-gray-400">N/A</span>,
    },
    {
      accessorKey: 'phone',
      header: 'Contact No',
      cell: ({ getValue }) => (getValue() as string) || 'N/A',
    },
    {
      accessorKey: 'address',
      header: 'Address',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? <span className="max-w-[160px] truncate block" title={v}>{v}</span> : 'N/A'
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Added',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      id: 'actions',
      header: 'Action',
      size: 120,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push(`/customers/${row.original.id}`)}
            className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <Eye className="h-3 w-3" /> Details
          </button>
          <button
            onClick={() => openEdit(row.original)}
            className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-100 transition-colors border border-amber-200"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            onClick={() => onDelete(row.original)}
            className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-100 transition-colors border border-red-200"
          >
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Manage Customers</h1>
          <p className="text-sm text-gray-500">{total} customers</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => exportCSV(customers)}
          className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FileDown className="h-3.5 w-3.5" /> Export CSV
        </button>
        <button
          onClick={() => exportExcel(customers)}
          className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
        </button>
        <button
          onClick={() => exportPDF(customers)}
          className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
        <div className="relative" ref={colMenuRef}>
          <button
            onClick={() => setColMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Columns className="h-3.5 w-3.5" /> Column visibility
          </button>
          {colMenuOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
              {TOGGLEABLE_COLS.map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded"
                    checked={colVisibility[key] !== false}
                    onChange={(e) => setColVisibility((v) => ({ ...v, [key]: e.target.checked }))}
                  />
                  {COL_LABELS[key]}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => exportPDF(customers)}
          className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" /> Export PDF
        </button>

        <div className="ml-auto relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <DataTable
        data={customers}
        columns={visibleColumns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No customers yet."
      />

      {/* Add Customer Sheet */}
      <InlineFormSheet open={sheetOpen} onClose={() => { setSheetOpen(false); setCreateError(null) }} title="Add Customer">
        <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" required error={createForm.formState.errors.first_name?.message} {...createForm.register('first_name')} />
            <Input label="Last Name" {...createForm.register('last_name')} />
          </div>
          <Input label="Business Name" {...createForm.register('business_name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" {...createForm.register('email')} />
          </div>
          <PhoneInput
            label="Phone"
            value={createForm.watch('phone') ?? ''}
            onChange={(val) => createForm.setValue('phone', val, { shouldValidate: true })}
            error={createForm.formState.errors.phone?.message}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...createForm.register('address')} />
          </div>
          {customerFieldDefs.length > 0 && (
            <div className="border-t border-gray-100 pt-3 mt-2">
              <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Additional Info</p>
              <CustomFieldRenderer
                definitions={customerFieldDefs}
                values={customFields}
                onSave={async (v) => setCustomFields(v)}
                readOnly={false}
                showSave={false}
              />
            </div>
          )}
          <Button type="submit" className="w-full" loading={createForm.formState.isSubmitting}>Add Customer</Button>
        </form>
      </InlineFormSheet>

      {/* Edit Customer Sheet */}
      <InlineFormSheet open={editSheetOpen} onClose={() => { setEditSheetOpen(false); setEditError(null) }} title="Edit Customer">
        <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
          {editError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" required error={editForm.formState.errors.first_name?.message} {...editForm.register('first_name')} />
            <Input label="Last Name" {...editForm.register('last_name')} />
          </div>
          <Input label="Business Name" {...editForm.register('business_name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" {...editForm.register('email')} />
          </div>
          <PhoneInput
            label="Phone"
            value={editForm.watch('phone') ?? ''}
            onChange={(val) => editForm.setValue('phone', val, { shouldValidate: true })}
            error={editForm.formState.errors.phone?.message}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...editForm.register('address')} />
          </div>
          <Button type="submit" className="w-full" loading={editForm.formState.isSubmitting}>Save Changes</Button>
        </form>
      </InlineFormSheet>
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Customer?"
        description={confirmDelete ? `Are you sure you want to delete "${[confirmDelete.first_name, confirmDelete.last_name].filter(Boolean).join(' ')}"? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        loading={isDeleting}
      />
    </div>
  )
}
