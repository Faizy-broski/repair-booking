import { QueryClient } from '@tanstack/react-query'

/**
 * Singleton QueryClient used across the app.
 * Exported so it can be explicitly cleared during login/logout
 * to prevent cross-tenant data bleed.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 10 min — no background refetch during that window.
      staleTime: 10 * 60 * 1000,
      // Cache survives for 1 hour after a component unmounts (page navigation).
      // Previously 10 min: after 10 min on another page, every list showed a
      // skeleton on re-entry. Now re-navigating within a shift is always instant.
      gcTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
