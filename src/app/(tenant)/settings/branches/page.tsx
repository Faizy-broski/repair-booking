'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'

interface BranchRow {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  is_main: boolean
  is_active: boolean
}

const schema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
})
type FormData = z.infer<typeof schema>

export default function BranchesSettingsPage() {
  const { profile } = useAuthStore()
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<BranchRow | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const fetchBranches = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/branches')
    const json = await res.json()
    setBranches(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchBranches() }, [fetchBranches])

  function openCreate() {
    setEditingBranch(null)
    reset()
    setSheetOpen(true)
  }

  function openEdit(branch: BranchRow) {
    setEditingBranch(branch)
    setValue('name', branch.name)
    setValue('address', branch.address ?? '')
    setValue('phone', branch.phone ?? '')
    setValue('email', branch.email ?? '')
    setSheetOpen(true)
  }

  async function onSubmit(data: FormData) {
    if (editingBranch) {
      await fetch(`/api/settings/branches/${editingBranch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      await fetch('/api/settings/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
    reset()
    setSheetOpen(false)
    fetchBranches()
  }

  const columns: ColumnDef<BranchRow>[] = [
    {
      accessorKey: 'name',
      header: 'Branch Name',
      cell: ({ getValue, row }) => (
        <div>
          <p className="font-medium text-gray-900">{getValue() as string}</p>
          {row.original.is_main && <span className="text-xs text-blue-600">Main branch</span>}
        </div>
      ),
    },
    { accessorKey: 'address', header: 'Address', cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
    { accessorKey: 'phone', header: 'Phone', cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
    { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ getValue }) => (
        <Badge variant={(getValue() as boolean) ? 'success' : 'secondary'}>
          {(getValue() as boolean) ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" onClick={() => openEdit(row.original)}>
          Edit
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Branches</h1>
          <p className="text-sm text-gray-500">Manage your business locations</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Branch
        </Button>
      </div>

      <DataTable
        data={branches}
        columns={columns}
        isLoading={loading}
        emptyMessage="No branches found."
      />

      <InlineFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingBranch ? 'Edit Branch' : 'Add Branch'}
        description={editingBranch ? `Editing ${editingBranch.name}` : 'Create a new branch location'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Branch Name" required error={errors.name?.message} {...register('name')} />
          <Input label="Address" {...register('address')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" {...register('phone')} />
            <Input label="Email" type="email" {...register('email')} />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            {editingBranch ? 'Save Changes' : 'Create Branch'}
          </Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
