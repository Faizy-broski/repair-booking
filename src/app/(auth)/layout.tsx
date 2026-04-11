import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'RepairBooking — Sign In',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary-container/20 via-background to-secondary-container/15 px-4 py-12">
      {/* Logo — always narrow and centered */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
          <svg className="h-8 w-8 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-on-surface tracking-tight">RepairBooking</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Cloud POS &amp; Repair Management</p>
      </div>
      {/* Content — can be wide (plan step) or narrow (auth forms) */}
      <div className="w-full max-w-5xl">
        {children}
      </div>
    </div>
  )
}
