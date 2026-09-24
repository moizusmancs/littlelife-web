import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

/**
 * For actions whose *server* side has already revoked every session and cleared the web cookie —
 * deactivate account, delete account, change password (api/00-identity.md) — so there's no session
 * left for a separate `logout()` call to act on. Returns a function that clears local auth and
 * routes to `/login` with a one-line message. The message goes through the auth store's
 * `pendingMessage`, not router state: this navigation races `RequireRole`'s own redirect to a
 * *stateless* `/login`, and whichever loses takes its `state` with it (see that field's comment in
 * store/auth.ts).
 */
export function useEndSession() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  return (message: string) => {
    useAuthStore.getState().setPendingMessage(message)
    clearAuth()
    navigate('/login', { replace: true })
  }
}
