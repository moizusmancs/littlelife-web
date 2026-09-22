import { apiClient, refreshAccessToken } from '@/api/client'
import { useAuthStore, type Role } from '@/store/auth'

interface MeResponse {
  id: string
  email: string
  role: Role
  status: string
  email_verified: boolean
}

/**
 * Runs once on app load. Tries to turn the web session cookie (if any) into a live access
 * token + user object, so a page refresh doesn't bounce an already-logged-in visitor to
 * /login. A failure here just means "no session cookie" (first-time visitor, or an expired
 * one) — a normal logged-out state, not an error to surface (api/00-identity.md's own
 * guidance on /auth/refresh failures).
 *
 * Deliberately implemented here rather than in src/api/identity.ts: that module's real build
 * is Phase 1's job (the Login/Register screens), but the route guards need `isBootstrapping`
 * to resolve on every page load starting now, in Phase 0 — this is auth-store plumbing, not a
 * UI screen.
 */
export async function bootstrapAuth() {
  try {
    const accessToken = await refreshAccessToken()
    const me = await apiClient.get<MeResponse>('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    useAuthStore.getState().setAuth(accessToken, {
      id: me.data.id,
      email: me.data.email,
      role: me.data.role,
      emailVerified: me.data.email_verified,
    })
  } catch {
    // No session cookie, or it's expired/invalid — stay logged out.
  } finally {
    useAuthStore.getState().setBootstrapped()
  }
}
