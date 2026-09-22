import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { logout } from '@/api/identity'
import { useAuthStore } from '@/store/auth'

/**
 * Shared by both nav shells (CitizenLayout, OpsLayout) so the call-the-API-then-clear-state-
 * then-redirect sequence lives in one place, not duplicated per layout.
 *
 * Always calls the real /auth/logout first, then clears local state regardless of the
 * result — api/00-identity.md's own guidance: the route is idempotent and safe to call even
 * against an already-stale session, and a network hiccup shouldn't leave the user stuck
 * "logged in" in the UI while their session is actually gone.
 */
export function useLogout() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const mutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearAuth()
      navigate('/login', { replace: true })
    },
  })

  return { logout: () => mutation.mutate(), isLoggingOut: mutation.isPending }
}
