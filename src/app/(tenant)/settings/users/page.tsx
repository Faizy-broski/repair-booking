'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'

interface UserRow {
  id: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
  branches: { name: string } | null
}

interface BranchOption { id: string; name: string }

const ROLE_OPTIONS = [
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'staff', label: 'Staff' },
  { value: 'cashier', label: 'Cashier' },
]

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'purple'> = {
  branch_manager: 'purple',
  staff: 'default',
  cashier: 'secondary',
}

const schema = z.object({
  email: z.string().email('Valid email required'),
  full_name: z.string().min(1, 'Name is required'),
  role: z.enum(['branch_manager', 'staff', 'cashier']),
  branch_id: z.string().uuid().optional().nullable(),
})
type FormData = z.infer<typeof schema>

export default function UsersSettingsPage() {
  const { branches } = useAuthStore()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<string>('')

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'staff' },
  })
  const selectedRole = watch('role')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/users')
    const json = await res.json()
    setUsers(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function onInvite(data: FormData) {
    const res = await fetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: selectedBranch || null }),
    })
    if (res.ok) {
      reset()
      setSelectedBranch('')
      setSheetOpen(false)
      fetchUsers()
    }
  }

  async function toggleActive(user: UserRow) {
    await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    })
    fetchUsers()
  }

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }))

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: 'full_name',
      header: 'Name',
      cell: ({ getValue }) => (getValue() as string | null) ?? '—',
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ getValue }) => {
        const role = getValue() as string
        return (
          <Badge variant={ROLE_BADGE_VARIANT[role] ?? 'secondary'}>
            {role.replace('_', ' ')}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'branches',
      header: 'Branch',
      cell: ({ getValue }) => {
        const b = getValue() as UserRow['branches']
        return b?.name ?? <span className="text-gray-400">All branches</span>
      },
    },
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
      accessorKey: 'created_at',
      header: 'Joined',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" onClick={() => toggleActive(row.original)}>
          {row.original.is_active ? 'Deactivate' : 'Activate'}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team Members</h1>
          <p className="text-sm text-gray-500">Invite and manage staff access</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      <DataTable
        data={users}
        columns={columns}
        isLoading={loading}
        emptyMessage="No team members yet. Invite your first team member!"
      />

      <InlineFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Invite Team Member"
        description="An invitation email will be sent to the user"
      >
        <form onSubmit={handleSubmit(onInvite)} className="space-y-4">
          <Input
            label="Full Name"
            required
            error={errors.full_name?.message}
            {...register('full_name')}
          />
          <Input
            label="Email Address"
            type="email"
            required
            error={errors.email?.message}
            {...register('email')}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
            <Select
              options={ROLE_OPTIONS}
              value={selectedRole}
              onValueChange={(v) => setValue('role', v as FormData['role'])}
              placeholder="Select role"
            />
          </div>
          {branches.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Branch (leave empty for all branches)
              </label>
              <Select
                options={[{ value: '', label: 'All branches' }, ...branchOptions]}
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                placeholder="Select branch"
              />
            </div>
          )}
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Send Invitation
          </Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
