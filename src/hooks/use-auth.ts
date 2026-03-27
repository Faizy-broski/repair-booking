'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import type { Profile, Branch } from '@/types/database'

/**
 * Initialises Supabase auth state into the Zustand auth store.
 * Call once in the tenant layout.
 */
export function useAuth() {
  const { setProfile, setBranches, setActiveBranch, setLoading, clear } = useAuthStore()

  useEffect(() => {
    const supabase = createClient()

    async function loadSession() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        clear()
        setLoading(false)
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      const profile = profileData as Profile | null
      if (!profile) {
        setLoading(false)
        return
      }
      setProfile(profile)

      if (profile.business_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('*')
          .eq('business_id', profile.business_id)
          .eq('is_active', true)
          .order('is_main', { ascending: false })

        const branches = (branchData ?? []) as Branch[]
        setBranches(branches)

        if (profile.branch_id) {
          const own = branches.find((b) => b.id === profile.branch_id)
          if (own) setActiveBranch(own)
        } else if (branches.length > 0) {
          setActiveBranch(branches[0])
        }
      }

      setLoading(false)
    }

    loadSession()

    // Listen for auth state changes (sign-in / sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clear()
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadSession()
      }
    })

    return () => subscription.unsubscribe()
  }, [setProfile, setBranches, setActiveBranch, setLoading, clear])

  return useAuthStore()
}
