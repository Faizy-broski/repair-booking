'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
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

interface ExpenseRow {
  id: string
  title: string
  amount: number
  expense_date: string
  notes?: string | null
  category_id?: string | null
  payment_method?: 'cash' | 'card'
  expense_categories?: { name: string } | null
}
interface SalaryRow {
  id: string; amount: number; pay_date: string; pay_period: string | null
  employees?: { first_name: string; last_name: string | null } | null
}
interface CategoryOption { id: string; name: string }

const expenseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  amount: z.coerce.number().positive('Must be positive'),
  expense_date: z.string(),
  category_id: z.string().uuid().optional().or(z.literal('')),
  payment_method: z.enum(['cash', 'card']).default('cash'),
  notes: z.string().optional(),
})
type ExpenseFormData = z.infer<typeof expenseSchema>

export default function ExpensesPage() {
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
  const [editRow, setEditRow] = useState<ExpenseRow | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editCreatingCat, setEditCreatingCat] = useState(false)
  const [editNewCatName, setEditNewCatName] = useState('')
  const [editSavingCat, setEditSavingCat] = useState(false)

  // Delete confirm
  const [deleteRow, setDeleteRow] = useState<ExpenseRow | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [activeTab, setActiveTab] = useState('expenses')

  const addForm = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { expense_date: new Date().toISOString().split('T')[0], payment_method: 'cash' },
  })
  const editForm = useForm<ExpenseFormData>({ resolver: zodResolver(expenseSchema) })

  const { data: expensesData, isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses', activeBranch?.id, page, pageSize],
    queryFn: async () => {
      const res = await fetch(`/api/expenses?branch_id=${activeBranch!.id}&page=${page + 1}&limit=${pageSize}`)
      const json = await res.json()
      return { expenses: (json.data ?? []) as ExpenseRow[], total: json.meta?.total ?? 0 }
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
  })

  const { data: salariesData, isLoading: loadingSalaries } = useQuery({
    queryKey: ['expenses-salaries', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/salaries?branch_id=${activeBranch!.id}`)
      const json = await res.json()
      return (json.data ?? []) as SalaryRow[]
    },
    enabled: !!activeBranch,
    staleTime: 30_000,
  })

  const { data: categoriesData, refetch: refetchCategories } = useQuery({
    queryKey: ['expenses-categories', activeBranch?.business_id],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/categories?business_id=${activeBranch!.business_id}`)
      const json = await res.json()
      return (json.data ?? []) as CategoryOption[]
    },
    enabled: !!activeBranch,
    staleTime: 5 * 60_000,
  })

  const expenses  = expensesData?.expenses ?? []
  const totalExp  = expensesData?.total ?? 0
  const salaries  = salariesData ?? []
  const categories = categoriesData ?? []

  function invalidateExpenses() {
    queryClient.invalidateQueries({ queryKey: ['expenses', activeBranch?.id] })
  }

  // ── Add expense ──────────────────────────────────────────────────────────────
  async function onAddExpense(data: ExpenseFormData) {
    if (!activeBranch) return
    const res = await fetch('/api/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id, category_id: data.category_id || null }),
    })
    if (!res.ok) { toast.error('Failed to add expense'); return }
    toast.success('Expense added')
    addForm.reset({ expense_date: new Date().toISOString().split('T')[0], payment_method: 'cash' })
    setSheetOpen(false)
    setCreatingCategory(false)
    setNewCategoryName('')
    invalidateExpenses()
  }

  async function handleAddCategory() {
    if (!activeBranch || !newCategoryName.trim()) return
    setSavingCategory(true)
    const res = await fetch('/api/expenses/categories', {
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

  // ── Edit expense ─────────────────────────────────────────────────────────────
  function openEdit(row: ExpenseRow) {
    setEditRow(row)
    setEditCreatingCat(false)
    setEditNewCatName('')
    editForm.reset({
      title: row.title,
      amount: row.amount,
      expense_date: row.expense_date,
      category_id: row.category_id ?? '',
      payment_method: row.payment_method ?? 'cash',
      notes: row.notes ?? '',
    })
  }

  async function onEditExpense(data: ExpenseFormData) {
    if (!editRow || !activeBranch) return
    setEditSaving(true)
    const res = await fetch(`/api/expenses/${editRow.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, category_id: data.category_id || null }),
    })
    if (!res.ok) { toast.error('Failed to update expense'); setEditSaving(false); return }
    toast.success('Expense updated')
    setEditRow(null)
    invalidateExpenses()
    setEditSaving(false)
  }

  async function handleEditCategory() {
    if (!activeBranch || !editNewCatName.trim()) return
    setEditSavingCat(true)
    const res = await fetch('/api/expenses/categories', {
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

  // ── Delete expense ───────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteRow || !activeBranch) return
    setDeleteLoading(true)
    const res = await fetch(`/api/expenses/${deleteRow.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete expense'); setDeleteLoading(false); return }
    toast.success('Expense deleted')
    setDeleteRow(null)
    invalidateExpenses()
    setDeleteLoading(false)
  }

  // ── Table columns ────────────────────────────────────────────────────────────
  const expenseColumns: ColumnDef<ExpenseRow>[] = [
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
      accessorKey: 'expense_categories',
      header: 'Category',
      cell: ({ getValue }) => {
        const cat = (getValue() as ExpenseRow['expense_categories'])?.name
        return cat
          ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">{cat}</span>
          : <span className="text-gray-400">—</span>
      },
    },
    {
      accessorKey: 'payment_method',
      header: 'Payment',
      cell: ({ getValue }) => {
        const method = (getValue() as ExpenseRow['payment_method']) ?? 'cash'
        return (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${method === 'card' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
            {method === 'card' ? 'Card' : 'Cash'}
          </span>
        )
      },
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ getValue }) => <span className="font-semibold text-gray-900">{formatCurrency(getValue() as number)}</span>,
    },
    {
      accessorKey: 'expense_date',
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

  const salaryColumns: ColumnDef<SalaryRow>[] = [
    { accessorKey: 'employees', header: 'Employee', cell: ({ getValue }) => {
      const e = getValue() as SalaryRow['employees']
      return e ? `${e.first_name} ${e.last_name ?? ''}` : '—'
    }},
    { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'pay_period', header: 'Period', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'pay_date', header: 'Pay Date', cell: ({ getValue }) => formatDate(getValue() as string) },
  ]

  const totalExpAmount    = expenses.reduce((s, e) => s + e.amount, 0)
  const totalSalaryAmount = salaries.reduce((s, e) => s + e.amount, 0)

  // ── Payment method select helper ─────────────────────────────────────────────
  function PaymentMethodSelect({ form }: { form: ReturnType<typeof useForm<ExpenseFormData>> }) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Payment Method</label>
        <select
          {...form.register('payment_method')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
        </select>
      </div>
    )
  }

  // ── Category select helper ───────────────────────────────────────────────────
  function CategorySelect({ formName, form, onCreateClick }: { formName: string; form: ReturnType<typeof useForm<ExpenseFormData>>; onCreateClick: () => void }) {
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
          <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">Track business and branch expenses</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Expenses</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalExpAmount)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Salaries</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSalaryAmount)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Outflow</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpAmount + totalSalaryAmount)}</p>
        </div>
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          <Tabs.Trigger value="expenses" className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Expenses
          </Tabs.Trigger>
          <Tabs.Trigger value="salaries" className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Salaries
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="expenses" className="mt-4">
          <DataTable
            data={expenses}
            columns={expenseColumns}
            isLoading={loadingExpenses}
            totalCount={totalExp}
            pageIndex={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={s => { setPageSize(s); setPage(0) }}
          />
        </Tabs.Content>

        <Tabs.Content value="salaries" className="mt-4">
          <DataTable data={salaries} columns={salaryColumns} isLoading={loadingSalaries} emptyMessage="No salary records yet." />
        </Tabs.Content>
      </Tabs.Root>

      {/* ── Add Expense sheet ── */}
      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Expense">
        <form onSubmit={addForm.handleSubmit(onAddExpense)} className="space-y-4">
          <Input label="Title" placeholder="Internet Bill" required error={addForm.formState.errors.title?.message} {...addForm.register('title')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            {!creatingCategory ? (
              <CategorySelect formName="add" form={addForm} onCreateClick={() => setCreatingCategory(true)} />
            ) : (
              <div className="flex gap-2 items-end">
                <input
                  autoFocus
                  placeholder="e.g. Rent, Supplies…"
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
          <Input label="Date" type="date" required {...addForm.register('expense_date')} />
          <PaymentMethodSelect form={addForm} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes <span className="text-xs font-normal text-gray-400">(optional)</span></label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none" {...addForm.register('notes')} />
          </div>
          <Button type="submit" className="w-full" loading={addForm.formState.isSubmitting}>Add Expense</Button>
        </form>
      </InlineFormSheet>

      {/* ── Edit Expense modal ── */}
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Edit Expense" size="sm">
        {editRow && (
          <form onSubmit={editForm.handleSubmit(onEditExpense)} className="space-y-4">
            <Input label="Title" required error={editForm.formState.errors.title?.message} {...editForm.register('title')} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
              {!editCreatingCat ? (
                <CategorySelect formName="edit" form={editForm} onCreateClick={() => setEditCreatingCat(true)} />
              ) : (
                <div className="flex gap-2 items-end">
                  <input
                    autoFocus
                    placeholder="e.g. Rent, Supplies…"
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
            <Input label="Date" type="date" required {...editForm.register('expense_date')} />
            <PaymentMethodSelect form={editForm} />
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
      <Modal open={!!deleteRow} onClose={() => setDeleteRow(null)} title="Delete Expense" size="sm">
        {deleteRow && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <strong>"{deleteRow.title}"</strong> ({formatCurrency(deleteRow.amount)})?
            </p>
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              Note: If this was recorded from a POS cash out, the corresponding session movement record will remain unchanged — only the expense entry is removed.
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
