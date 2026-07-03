import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'RepairBooking — Sign In',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary-container/20 via-background to-secondary-container/15 px-4 py-12">
      {/* Logo — always narrow and centered */}
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex">
          <Image
            src="/images/logo.svg"
            alt="iRepairly"
            width={200}
            height={60}
            priority
            className="h-auto w-[170px] sm:w-[200px]"
          />
        </Link>
        <p className="mt-3 text-sm text-on-surface-variant">Cloud POS &amp; Repair Management</p>
      </div>
      {/* Content — can be wide (plan step) or narrow (auth forms) */}
      <div className="w-full max-w-5xl">
        {children}
      </div>
    </div>
  )
}
