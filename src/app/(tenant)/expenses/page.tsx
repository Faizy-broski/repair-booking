'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  id: string; title: string; amount: number; expense_date: string
  expense_categories?: { name: string } | null
}
interface SalaryRow {
  id: string; amount: number; pay_date: string; pay_period: string | null
  employees?: { first_name: string; last_name: string | null } | null
}
interface CategoryOption { id: string; name: string }

const expenseSchema = z.object({
  title: z.string().min(1),
  amount: z.coerce.number().positive(),
  expense_date: z.string(),
  category_id: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional(),
})

type ExpenseFormData = z.infer<typeof expenseSchema>

export default function ExpensesPage() {
  const { activeBranch } = useAuthStore()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('expenses')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { expense_date: new Date().toISOString().split('T')[0] },
  })

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

  const { data: categoriesData } = useQuery({
    queryKey: ['expenses-categories', activeBranch?.business_id],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/categories?business_id=${activeBranch!.business_id}`)
      const json = await res.json()
      return (json.data ?? []) as CategoryOption[]
    },
    enabled: !!activeBranch,
    staleTime: 5 * 60_000, // categories rarely change
  })

  const expenses = expensesData?.expenses ?? []
  const totalExp = expensesData?.total ?? 0
  const salaries = salariesData ?? []
  const categories = categoriesData ?? []

  async function onCreateExpense(data: ExpenseFormData) {
    if (!activeBranch) return
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: activeBranch.id, category_id: data.category_id || null }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Failed to add expense'); return }
    toast.success('Expense added')
    reset()
    setSheetOpen(false)
    setCreatingCategory(false)
    setNewCategoryName('')
    queryClient.invalidateQueries({ queryKey: ['expenses', activeBranch.id] })
  }

  async function handleCreateCategory() {
    if (!activeBranch || !newCategoryName.trim()) return
    setSavingCategory(true)
    try {
      const res = await fetch('/api/expenses/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: activeBranch.business_id, name: newCategoryName.trim() }),
      })
      if (res.ok) {
        const json = await res.json()
        queryClient.invalidateQueries({ queryKey: ['expenses-categories', activeBranch.business_id] })
        if (json.data?.id) setValue('category_id', json.data.id)
        setCreatingCategory(false)
        setNewCategoryName('')
      }
    } finally {
      setSavingCategory(false)
    }
  }

  const expenseColumns: ColumnDef<ExpenseRow>[] = [
    { accessorKey: 'title', header: 'Title', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: 'expense_categories', header: 'Category', cell: ({ getValue }) => (getValue() as ExpenseRow['expense_categories'])?.name ?? '—' },
    { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'expense_date', header: 'Date', cell: ({ getValue }) => formatDate(getValue() as string) },
  ]

  const salaryColumns: ColumnDef<SalaryRow>[] = [
    { accessorKey: 'employees', header: 'Employee', cell: ({ getValue }) => {
      const e = getValue() as SalaryRow['employees']
      return e ? `${e.first_name} ${e.last_name ?? ''}` : '—'
    }},
    { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'pay_period', header: 'Period', cell: ({ getValue }) => getValue() as string ?? '—' },
    { accessorKey: 'pay_date', header: 'Pay Date', cell: ({ getValue }) => formatDate(getValue() as string) },
  ]

  const totalExpAmount = expenses.reduce((s, e) => s + e.amount, 0)
  const totalSalaryAmount = salaries.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">Track business and branch expenses</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
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
          <DataTable data={expenses} columns={expenseColumns} isLoading={loadingExpenses} totalCount={totalExp} pageIndex={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(0) }} />
        </Tabs.Content>

        <Tabs.Content value="salaries" className="mt-4">
          <DataTable data={salaries} columns={salaryColumns} isLoading={loadingSalaries} emptyMessage="No salary records yet." />
        </Tabs.Content>
      </Tabs.Root>

      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Expense">
        <form onSubmit={handleSubmit(onCreateExpense)} className="space-y-4">
          <Input label="Title" placeholder="Internet Bill" required error={errors.title?.message} {...register('title')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <p className="mb-1.5 text-xs text-gray-400">Group expenses by type (e.g. Rent, Utilities, Supplies)</p>
            {!creatingCategory ? (
              <>
                <select
                  {...register('category_id')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingCategory(true)}
                  className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  + Create new category
                </button>
              </>
            ) : (
              <div className="flex gap-2 items-end">
                <input
                  placeholder="e.g. Rent, Marketing, Supplies"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!newCategoryName.trim()}
                  loading={savingCategory}
                  onClick={handleCreateCategory}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => { setCreatingCategory(false); setNewCategoryName('') }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          <Input label="Amount (£)" type="number" step="0.01" required error={errors.amount?.message} {...register('amount')} />
          <Input label="Date" type="date" required {...register('expense_date')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...register('notes')} />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Add Expense</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
