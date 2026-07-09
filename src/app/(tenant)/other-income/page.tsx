'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'

interface IncomeRow {
  id: string
  title: string
  amount: number
  income_date: string
  notes?: string | null
  category_id?: string | null
  other_income_categories?: { name: string } | null
}
interface CategoryOption { id: string; name: string }

const incomeSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  amount: z.coerce.number().positive('Must be positive'),
  income_date: z.string(),
  category_id: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional(),
})
type IncomeFormData = z.infer<typeof incomeSchema>

export default function OtherIncomePage() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  // Add sheet
  const [sheetOpen, setSheetOpen] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)

  // Edit modal
  const [editRow, setEditRow] = useState<IncomeRow | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editCreatingCat, setEditCreatingCat] = useState(false)
  const [editNewCatName, setEditNewCatName] = useState('')
  const [editSavingCat, setEditSavingCat] = useState(false)

  // Delete confirm
  const [deleteRow, setDeleteRow] = useState<IncomeRow | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const addForm = useForm<IncomeFormData>({
    resolver: zodResolver(incomeSchema),
    defaultValues: { income_date: new Date().toISOString().split('T')[0] },
  })
  const editForm = useForm<IncomeFormData>({ resolver: zodResolver(incomeSchema) })

  const { data: incomeData, isLoading: loadingIncome } = useQuery({
    queryKey: ['other-income', activeBranch?.id, page, pageSize],
    queryFn: async () => {
      const res = await fetch(`/api/other-income?branch_id=${activeBranch!.id}&page=${page + 1}&limit=${pageSize}`)
      const json = await res.json()
      return { income: (json.data ?? []) as IncomeRow[], total: json.meta?.total ?? 0 }
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
  })

  const { data: categoriesData, refetch: refetchCategories } = useQuery({
    queryKey: ['other-income-categories', activeBranch?.business_id],
    queryFn: async () => {
      const res = await fetch(`/api/other-income/categories?business_id=${activeBranch!.business_id}`)
      const json = await res.json()
      return (json.data ?? []) as CategoryOption[]
    },
    enabled: !!activeBranch,
    staleTime: 5 * 60_000,
  })

  const income     = incomeData?.income ?? []
  const totalCount = incomeData?.total ?? 0
  const categories = categoriesData ?? []

  function invalidateIncome() {
    queryClient.invalidateQueries({ queryKey: ['other-income', activeBranch?.id] })
  }

  // ── Add income ────────────────────────────────────────────────────────────────
  async function onAddIncome(data: IncomeFormData) {
    if (!activeBranch) return
    const res = await fetch('/api/other-income', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id, category_id: data.category_id || null }),
    })
    if (!res.ok) { toast.error('Failed to add income'); return }
    toast.success('Income added')
    addForm.reset({ income_date: new Date().toISOString().split('T')[0] })
    setSheetOpen(false)
    setCreatingCategory(false)
    setNewCategoryName('')
    invalidateIncome()
  }

  async function handleAddCategory() {
    if (!activeBranch || !newCategoryName.trim()) return
    setSavingCategory(true)
    const res = await fetch('/api/other-income/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: activeBranch.business_id, name: newCategoryName.trim() }),
    })
    if (res.ok) {
      const json = await res.json()
      await refetchCategories()
      if (json.data?.id) addForm.setValue('category_id', json.data.id)
      setCreatingCategory(false)
      setNewCategoryName('')
    }
    setSavingCategory(false)
  }

  // ── Edit income ───────────────────────────────────────────────────────────────
  function openEdit(row: IncomeRow) {
    setEditRow(row)
    setEditCreatingCat(false)
    setEditNewCatName('')
    editForm.reset({
      title: row.title,
      amount: row.amount,
      income_date: row.income_date,
      category_id: row.category_id ?? '',
      notes: row.notes ?? '',
    })
  }

  async function onEditIncome(data: IncomeFormData) {
    if (!editRow || !activeBranch) return
    setEditSaving(true)
    const res = await fetch(`/api/other-income/${editRow.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, category_id: data.category_id || null }),
    })
    if (!res.ok) { toast.error('Failed to update income'); setEditSaving(false); return }
    toast.success('Income updated')
    setEditRow(null)
    invalidateIncome()
    setEditSaving(false)
  }

  async function handleEditCategory() {
    if (!activeBranch || !editNewCatName.trim()) return
    setEditSavingCat(true)
    const res = await fetch('/api/other-income/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: activeBranch.business_id, name: editNewCatName.trim() }),
    })
    if (res.ok) {
      const json = await res.json()
      await refetchCategories()
      if (json.data?.id) editForm.setValue('category_id', json.data.id)
      setEditCreatingCat(false)
      setEditNewCatName('')
    }
    setEditSavingCat(false)
  }

  // ── Delete income ─────────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteRow || !activeBranch) return
    setDeleteLoading(true)
    const res = await fetch(`/api/other-income/${deleteRow.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete income'); setDeleteLoading(false); return }
    toast.success('Income deleted')
    setDeleteRow(null)
    invalidateIncome()
    setDeleteLoading(false)
  }

  // ── Table columns ────────────────────────────────────────────────────────────
  const incomeColumns: ColumnDef<IncomeRow>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <div>
          <span className="font-medium text-gray-900">{row.original.title}</span>
        </div>
      ),
    },
    {
      accessorKey: 'other_income_categories',
      header: 'Category',
      cell: ({ getValue }) => {
        const cat = (getValue() as IncomeRow['other_income_categories'])?.name
        return cat
          ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{cat}</span>
          : <span className="text-gray-400">—</span>
      },
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ getValue }) => <span className="font-semibold text-gray-900">{formatCurrency(getValue() as number)}</span>,
    },
    {
      accessorKey: 'income_date',
      header: 'Date',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ getValue }) => {
        const notes = getValue() as string | null
        return notes
          ? <span className="max-w-[200px] truncate text-sm text-gray-500" title={notes}>{notes}</span>
          : <span className="text-gray-300">—</span>
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-800 shadow-sm hover:bg-gray-50 transition-colors">
              <MoreVertical className="h-4 w-4 stroke-[2.5]" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[140px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
            >
              <DropdownMenu.Item
                onClick={() => openEdit(row.original)}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-700 outline-none hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5 text-blue-500" />
                Edit
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={() => setDeleteRow(row.original)}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm text-red-600 outline-none hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ),
    },
  ]

  const totalIncomeAmount = income.reduce((s, e) => s + e.amount, 0)

  // ── Category select helper ───────────────────────────────────────────────────
  function CategorySelect({ form, onCreateClick }: { form: ReturnType<typeof useForm<IncomeFormData>>; onCreateClick: () => void }) {
    return (
      <>
        <select
          {...form.register('category_id')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
        >
          <option value="">No category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" onClick={onCreateClick} className="mt-1.5 text-xs font-medium text-brand-teal hover:underline">
          + Create new category
        </button>
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Income</h1>
          <p className="text-sm text-gray-500">Track miscellaneous income recorded outside normal sales</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> Add Income
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Income</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalIncomeAmount)}</p>
        </div>
      </div>

      <DataTable
        data={income}
        columns={incomeColumns}
        isLoading={loadingIncome}
        totalCount={totalCount}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={s => { setPageSize(s); setPage(0) }}
      />

      {/* ── Add Income sheet ── */}
      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Income">
        <form onSubmit={addForm.handleSubmit(onAddIncome)} className="space-y-4">
          <Input label="Title" placeholder="Misc cash payment" required error={addForm.formState.errors.title?.message} {...addForm.register('title')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            {!creatingCategory ? (
              <CategorySelect form={addForm} onCreateClick={() => setCreatingCategory(true)} />
            ) : (
              <div className="flex gap-2 items-end">
                <input
                  autoFocus
                  placeholder="e.g. Repair Cash Payment, Refund…"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                />
                <Button type="button" size="sm" disabled={!newCategoryName.trim()} loading={savingCategory} onClick={handleAddCategory}>Add</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setCreatingCategory(false); setNewCategoryName('') }}>Cancel</Button>
              </div>
            )}
          </div>
          <Input label="Amount" type="number" step="0.01" required error={addForm.formState.errors.amount?.message} {...addForm.register('amount')} />
          <Input label="Date" type="date" required {...addForm.register('income_date')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes <span className="text-xs font-normal text-gray-400">(optional)</span></label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none" {...addForm.register('notes')} />
          </div>
          <Button type="submit" className="w-full" loading={addForm.formState.isSubmitting}>Add Income</Button>
        </form>
      </InlineFormSheet>

      {/* ── Edit Income modal ── */}
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Edit Income" size="sm">
        {editRow && (
          <form onSubmit={editForm.handleSubmit(onEditIncome)} className="space-y-4">
            <Input label="Title" required error={editForm.formState.errors.title?.message} {...editForm.register('title')} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
              {!editCreatingCat ? (
                <CategorySelect form={editForm} onCreateClick={() => setEditCreatingCat(true)} />
              ) : (
                <div className="flex gap-2 items-end">
                  <input
                    autoFocus
                    placeholder="e.g. Repair Cash Payment, Refund…"
                    value={editNewCatName}
                    onChange={e => setEditNewCatName(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                  />
                  <Button type="button" size="sm" disabled={!editNewCatName.trim()} loading={editSavingCat} onClick={handleEditCategory}>Add</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setEditCreatingCat(false); setEditNewCatName('') }}>Cancel</Button>
                </div>
              )}
            </div>
            <Input label="Amount" type="number" step="0.01" required error={editForm.formState.errors.amount?.message} {...editForm.register('amount')} />
            <Input label="Date" type="date" required {...editForm.register('income_date')} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Notes <span className="text-xs font-normal text-gray-400">(optional)</span></label>
              <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none" {...editForm.register('notes')} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" loading={editSaving}>Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Delete confirm modal ── */}
      <Modal open={!!deleteRow} onClose={() => setDeleteRow(null)} title="Delete Income" size="sm">
        {deleteRow && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete &quot;{deleteRow.title}&quot; ({formatCurrency(deleteRow.amount)})?
            </p>
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              Note: If this was recorded from a POS cash in, the corresponding session movement record will remain unchanged — only the income entry is removed.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteRow(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" loading={deleteLoading} onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
