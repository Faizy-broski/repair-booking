import Link from 'next/link'

export default function TenantNotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-gray-100 p-4">
        <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Page not found</h2>
        <p className="mt-1 text-sm text-gray-500">This page does not exist.</p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Go to Dashboard
      </Link>
    </div>
  )
}
