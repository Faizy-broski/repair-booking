import { QueryClient } from '@tanstack/react-query'

/**
 * Singleton QueryClient used across the app.
 * Exported so it can be explicitly cleared during login/logout
 * to prevent cross-tenant data bleed.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
