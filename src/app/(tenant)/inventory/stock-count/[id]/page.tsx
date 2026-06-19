'use client'
// Stock Count detail feature is temporarily disabled.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  useEffect(() => { router.replace('/inventory') }, [router])
  return null
}

/*
===== ORIGINAL STOCK COUNT DETAIL PAGE — DISABLED =====

'use client'
import { useState, useEffect, use } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmToast } from '@/lib/confirm-toast'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, CheckCircle2, XCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { formatDate } from '@/lib/utils'

... (full implementation in git history)

===== END ORIGINAL =====
*/
