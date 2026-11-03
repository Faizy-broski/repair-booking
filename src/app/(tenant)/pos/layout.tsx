'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'

// Tyre businesses can switch POS off in Settings. Hiding the sidebar link isn't
// enough, so old bookmarks are sent to the dashboard. /pos/refund stays open
// because the Invoices page links to it.
export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const verticalTemplateSlug = useAuthStore((s) => s.verticalTemplateSlug)
  const configs = useModuleConfigStore((s) => s.configs)

  const blocked =
    verticalTemplateSlug === 'mobile-tyre-fitting' &&
    configs !== null &&
    !(configs.pos?._meta?.is_enabled ?? false) &&
    !pathname.startsWith('/pos/refund')

  useEffect(() => {
    if (blocked) router.replace('/dashboard')
  }, [blocked, router])

  if (blocked) return null
  return <>{children}</>
}
