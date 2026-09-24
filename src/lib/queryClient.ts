import { QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// Cached server state here is per-account (profile name, pending invitations, ...) and
// `staleTime` is 30s, so anything left in the cache when the session ends would be served
// instantly to whoever signs in next in the same tab. Clear it whenever the signed-in account
// goes away or changes — one subscription covers every path (logout, deactivate/delete, a failed
// silent refresh in the axios interceptor) instead of each caller having to remember. A plain
// token refresh for the *same* account keeps the cache; so does the first login (null → user).
useAuthStore.subscribe((state, previous) => {
  if (previous.user && previous.user.id !== state.user?.id) {
    queryClient.clear()
  }
})
