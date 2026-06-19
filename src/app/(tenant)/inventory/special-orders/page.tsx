'use client'
// Special Orders feature is temporarily disabled.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SpecialOrdersPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/inventory') }, [router])
  return null
}

/*
===== ORIGINAL SPECIAL ORDERS PAGE — DISABLED =====

'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Package, Truck, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate, getCurrencySymbol } from '@/lib/utils'

... (full implementation in git history)

===== END ORIGINAL =====
*/
