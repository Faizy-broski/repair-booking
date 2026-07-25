import { toast } from 'sonner'
import type { useRouter } from 'next/navigation'

/**
 * Shows an API error toast. When the error is a plan-limit rejection
 * (code === 'LIMIT_REACHED'), the original backend message is kept verbatim
 * and a reason line + "Upgrade Plan" action are added alongside it — nothing
 * about the error itself is removed or shortened.
 */
export function showApiError(
  error: { code: string; message: string } | null | undefined,
  router: ReturnType<typeof useRouter>,
  limitKey?: string,
  fallback = 'Something went wrong'
) {
  if (error?.code === 'LIMIT_REACHED') {
    toast.error(error.message, {
      description: 'Upgrade your plan to increase this limit.',
      duration: 10000,
      action: {
        label: 'Upgrade Plan',
        onClick: () => router.push(`/account/plans?reason=limit${limitKey ? `&limit=${limitKey}` : ''}`),
      },
    })
    return
  }
  toast.error(error?.message ?? fallback)
}
