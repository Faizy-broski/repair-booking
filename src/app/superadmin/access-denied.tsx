'use client'
import { ShieldOff } from 'lucide-react'
import { SignOutButton } from '@/components/layout/sign-out-button'

interface AccessDeniedProps {
  email: string
}

export function AccessDenied({ email }: AccessDeniedProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <ShieldOff className="h-6 w-6 text-red-600" />
        </div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">Access Denied</h1>
        <p className="mb-1 text-sm text-gray-500">
          Your account does not have permission to access the admin portal.
        </p>
        {email && (
          <p className="mb-6 text-sm text-gray-500">
            Signed in as <strong className="text-gray-700">{email}</strong>.
          </p>
        )}
        <SignOutButton
          redirectTo="/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
          label="Sign out and return to login"
        />
      </div>
    </div>
  )
}
