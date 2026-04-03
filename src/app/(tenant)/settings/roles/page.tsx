'use client'
import { useState, useEffect, useCallback } from 'react'
import { Save, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'

// The modules and actions to manage
const MODULES = [
  { key: 'pos',       label: 'Point of Sale' },
  { key: 'repairs',   label: 'Repairs' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'customers', label: 'Customers' },
  { key: 'invoices',  label: 'Invoices' },
  { key: 'employees', label: 'Employees' },
  { key: 'reports',   label: 'Reports' },
  { key: 'settings',  label: 'Settings' },
  { key: 'expenses',  label: 'Expenses' },
  { key: 'suppliers', label: 'Suppliers' },
]
const ACTIONS = ['view', 'create', 'edit', 'delete']
const ROLES: { key: string; label: string }[] = [
  { key: 'branch_manager', label: 'Manager' },
  { key: 'staff',          label: 'Staff' },
  { key: 'cashier',        label: 'Cashier' },
  { key: 'technician',     label: 'Technician' },
]

interface PermRow {
  role: string
  module: string
  action: string
  allowed: boolean
  requires_pin: boolean
}

type PermMatrix = Record<string, Record<string, Record<string, PermRow>>>
// [module][role][action] → PermRow

function buildKey(role: string, module: string, action: string) {
  return `${role}::${module}::${action}`
}

export default function RolesPage() {
  const { activeBranch } = useAuthStore()
  const [matrix, setMatrix] = useState<PermMatrix>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)

  const fetchPermissions = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const res = await fetch('/api/employees/permissions')
    const json = await res.json()
    const rows: PermRow[] = json.data ?? []

    // Build matrix from server data, filling in defaults for missing combos
    const m: PermMatrix = {}
    for (const mod of MODULES) {
      m[mod.key] = {}
      for (const role of ROLES) {
        m[mod.key][role.key] = {}
        for (const action of ACTIONS) {
          const existing = rows.find(
            (r) => r.role === role.key && r.module === mod.key && r.action === action
          )
          m[mod.key][role.key][action] = existing ?? {
            role: role.key,
            module: mod.key,
            action,
            allowed: false,
            requires_pin: false,
          }
        }
      }
    }
    setMatrix(m)
    setLoading(false)
  }, [activeBranch])

  useEffect(() => { fetchPermissions() }, [fetchPermissions])

  function toggle(module: string, role: string, action: string, field: 'allowed' | 'requires_pin') {
    setMatrix((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        [role]: {
          ...prev[module]?.[role],
          [action]: {
            ...prev[module]?.[role]?.[action],
            [field]: !prev[module]?.[role]?.[action]?.[field],
          },
        },
      },
    }))
  }

  async function handleSave() {
    setSaving(true)
    const permissions: PermRow[] = []
    for (const mod of Object.values(matrix)) {
      for (const roleMap of Object.values(mod)) {
        for (const row of Object.values(roleMap)) {
          permissions.push(row)
        }
      }
    }
    await fetch('/api/employees/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    })
    setSaving(false)
    setSaveOk(true)
    setTimeout(() => setSaveOk(false), 2500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Loading permissions...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Role Permissions
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Control what each role can access. PIN-required actions prompt a confirmation code.
          </p>
        </div>
        <Button onClick={handleSave} loading={saving} variant={saveOk ? 'success' : 'default'}>
          <Save className="h-4 w-4" />
          {saveOk ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="py-3 px-4 text-left font-semibold text-gray-700 w-36">Module</th>
              <th className="py-3 px-4 text-left font-semibold text-gray-700 w-24">Action</th>
              {ROLES.map((role) => (
                <th key={role.key} className="py-3 px-4 text-center font-semibold text-gray-700" colSpan={2}>
                  {role.label}
                  <div className="flex justify-center gap-4 mt-1 text-xs font-normal text-gray-400">
                    <span>Allow</span>
                    <span>PIN</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((mod, modIdx) =>
              ACTIONS.map((action, actIdx) => {
                const isFirstAction = actIdx === 0
                return (
                  <tr
                    key={buildKey('_', mod.key, action)}
                    className={`border-b border-gray-100 ${modIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                  >
                    {isFirstAction && (
                      <td
                        className="py-2 px-4 font-medium text-gray-800 align-top"
                        rowSpan={ACTIONS.length}
                      >
                        {mod.label}
                      </td>
                    )}
                    <td className="py-2 px-4 text-gray-500 capitalize">{action}</td>
                    {ROLES.map((role) => {
                      const perm = matrix[mod.key]?.[role.key]?.[action]
                      if (!perm) return <td key={role.key} colSpan={2} />
                      return (
                        <td key={role.key} className="py-2 px-4" colSpan={2}>
                          <div className="flex items-center justify-center gap-6">
                            {/* Allow toggle */}
                            <button
                              type="button"
                              onClick={() => toggle(mod.key, role.key, action, 'allowed')}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                perm.allowed
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-gray-300 bg-white'
                              }`}
                              title="Toggle access"
                            >
                              {perm.allowed && (
                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path d="M2 6l3 3 5-5" />
                                </svg>
                              )}
                            </button>
                            {/* Requires PIN toggle */}
                            <button
                              type="button"
                              onClick={() => toggle(mod.key, role.key, action, 'requires_pin')}
                              disabled={!perm.allowed}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                perm.requires_pin && perm.allowed
                                  ? 'bg-amber-500 border-amber-500 text-white'
                                  : 'border-gray-200 bg-white opacity-50'
                              }`}
                              title="Require PIN for this action"
                            >
                              {perm.requires_pin && perm.allowed && (
                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path d="M2 6l3 3 5-5" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Note: business_owner and super_admin always have full access regardless of these settings.
      </p>
    </div>
  )
}
